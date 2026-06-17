import { cookies } from 'next/headers';
import { google } from 'googleapis';
import AdmZip from 'adm-zip';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      type: process.env.GCP_TYPE,
      project_id: process.env.GCP_PROJECT_ID,
      private_key_id: process.env.GCP_PRIVATE_KEY_ID,
      private_key: (process.env.GCP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      client_email: process.env.GCP_CLIENT_EMAIL,
      client_id: process.env.GCP_CLIENT_ID,
      auth_uri: process.env.GCP_AUTH_URI,
      token_uri: process.env.GCP_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.GCP_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.GCP_CLIENT_CERT_URL,
    } as any,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

export async function GET() {
  const store = await cookies();
  if (store.get('tc-auth')?.value !== 'authenticated') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = process.env.ACCOMPLISHMENT_SHEET_ID;
  if (!id) return Response.json({ error: 'ACCOMPLISHMENT_SHEET_ID not set' });

  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    { fileId: id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const buf = Buffer.from(res.data as ArrayBuffer);
  const zip = new AdmZip(buf);

  // List all ZIP entries
  const entries = zip.getEntries().map(e => e.entryName);

  // Read workbook XML
  const workbookXml = zip.readAsText('xl/workbook.xml');

  // Find sheet elements
  const sheetElems = workbookXml.match(/<sheet\s[^>]+\/?>/g) || [];

  // Find Master Accomplishments Log sheet
  const workbookRels = zip.readAsText('xl/_rels/workbook.xml.rels');
  let targetSheetPath: string | null = null;
  let targetRId: string | null = null;
  for (const el of sheetElems) {
    const nameMatch = el.match(/name="([^"]+)"/);
    const rIdMatch = el.match(/r:id="([^"]+)"/);
    if (nameMatch && rIdMatch && nameMatch[1] === 'Master Accomplishments Log') {
      targetRId = rIdMatch[1];
      break;
    }
  }

  if (targetRId) {
    const relElems = workbookRels.match(/<Relationship\s[^>]+\/?>/g) || [];
    for (const el of relElems) {
      const idMatch = el.match(/Id="([^"]+)"/);
      const targetMatch = el.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch && idMatch[1] === targetRId) {
        targetSheetPath = `xl/${targetMatch[1]}`;
        break;
      }
    }
  }

  let sheetXmlSnippet = '';
  let hyperlinksSection = '';
  let relsXml = '';

  if (targetSheetPath) {
    const sheetXml = zip.readAsText(targetSheetPath);
    sheetXmlSnippet = sheetXml.slice(0, 300);
    const hlMatch = sheetXml.match(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/);
    hyperlinksSection = hlMatch ? hlMatch[0].slice(0, 2000) : 'NO <hyperlinks> SECTION FOUND';

    const sheetFile = targetSheetPath.split('/').pop()!;
    const relsPath = `xl/worksheets/_rels/${sheetFile}.rels`;
    const relsEntry = zip.getEntry(relsPath);
    relsXml = relsEntry ? zip.readAsText(relsPath).slice(0, 2000) : 'NO RELS FILE FOUND';
  }

  // First 200 chars of sharedStrings
  const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
  const sharedStringsSnippet = sharedStringsEntry
    ? zip.readAsText('xl/sharedStrings.xml').slice(0, 1000)
    : 'NO sharedStrings.xml';

  return Response.json({
    zipEntries: entries,
    sheetElements: sheetElems,
    targetRId,
    targetSheetPath,
    sheetXmlSnippet,
    hyperlinksSection,
    relsXml,
    sharedStringsSnippet,
  });
}
