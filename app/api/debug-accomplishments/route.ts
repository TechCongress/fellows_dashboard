import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';

function authed() {
  const store = cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
}

export async function GET() {
  if (!authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id = process.env.ACCOMPLISHMENT_SHEET_ID;
    if (!id) return NextResponse.json({ error: 'ACCOMPLISHMENT_SHEET_ID not set' });

    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    const sheetName = 'Master Accomplishments Log';
    const ws = wb.Sheets[sheetName];
    if (!ws) return NextResponse.json({ error: `Sheet not found`, available: Object.keys(wb.Sheets) });

    // Get headers
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
    const headers = rows[0];
    const debugSheetName = 'Master Accomplishments Log';
    const zip = new AdmZip(buffer);

    // Step 1: list all files in the zip
    const zipEntries = zip.getEntries().map(e => e.entryName);

    // Step 2: read workbook.xml to find sheet rId
    const workbookXml = zip.readAsText('xl/workbook.xml');
    const escaped = debugSheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sheetRIdMatch = workbookXml.match(new RegExp(`<sheet[^>]+name="${escaped}"[^>]+r:id="([^"]+)"`))
                       || workbookXml.match(new RegExp(`<sheet[^>]+r:id="([^"]+)"[^>]+name="${escaped}"`));
    const sheetRId = sheetRIdMatch?.[1] ?? null;

    // Step 3: resolve sheet file path from workbook rels
    const workbookRels = zip.readAsText('xl/_rels/workbook.xml.rels');
    const relMatch = sheetRId
      ? (workbookRels.match(new RegExp(`Id="${sheetRId}"[^>]+Target="([^"]+)"`))
      || workbookRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${sheetRId}"`)))
      : null;
    const sheetRelPath = relMatch?.[1] ?? null; // e.g. "worksheets/sheet1.xml"
    const sheetPath = sheetRelPath ? `xl/${sheetRelPath}` : null;
    const sheetFile = sheetRelPath?.split('/').pop() ?? null;
    const relsPath  = sheetFile ? `xl/worksheets/_rels/${sheetFile}.rels` : null;

    // Step 4: read rels file
    let rIdToUrl: Record<string, string> = {};
    let relsXmlSample = null;
    if (relsPath) {
      try {
        const relsXml = zip.readAsText(relsPath);
        relsXmlSample = relsXml.slice(0, 500);
        for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
          rIdToUrl[m[1]] = m[2].replace(/&amp;/g, '&');
        }
      } catch(e) { relsXmlSample = `ERROR: ${e}`; }
    }

    // Step 5: find hyperlinks section in sheet XML
    let hyperlinksSectionSample = null;
    let cellToUrls: Record<string, string[]> = {};
    if (sheetPath) {
      const sheetXml = zip.readAsText(sheetPath);
      const hlSection = sheetXml.match(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/);
      hyperlinksSectionSample = hlSection ? hlSection[1].slice(0, 500) : 'NOT FOUND';
      if (hlSection) {
        for (const m of hlSection[1].matchAll(/ref="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
          const [, cellRef, rId] = m;
          const url = rIdToUrl[rId];
          if (url) {
            if (!cellToUrls[cellRef]) cellToUrls[cellRef] = [];
            cellToUrls[cellRef].push(url);
          }
        }
      }
    }

    const descColIdx = headers.findIndex((h) => h === 'Description');
    const descColLetter = XLSX.utils.encode_col(descColIdx);

    // Show all G-column links and any cell with 2+ links
    const descLinks = Object.entries(cellToUrls)
      .filter(([ref]) => ref.startsWith(descColLetter))
      .slice(0, 10)
      .map(([ref, urls]) => ({ ref, count: urls.length, urls }));

    const multiLinks = Object.entries(cellToUrls)
      .filter(([, urls]) => urls.length > 1)
      .slice(0, 5)
      .map(([ref, urls]) => ({ ref, urls }));

    // Raw hyperlinks section so we can see exact attribute order
    const rawHlLines = (hyperlinksSectionSample || '').split('><').slice(0, 5);

    return NextResponse.json({
      rIdToUrl_count: Object.keys(rIdToUrl).length,
      totalCellsWithLinks: Object.keys(cellToUrls).length,
      descColLetter,
      descLinks,
      multiLinks,
      rawHlLines,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) });
  }
}
