import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { Fellow, Checkin, StatusReport, Alumni, TCEvent, EventAttendance, Accomplishment } from '@/types';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

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
    scopes: SCOPES,
  });
}

function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID not set');
  return id;
}

async function getSheetValues(sheetName: string): Promise<string[][]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: sheetName,
  });
  return (res.data.values || []) as string[][];
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => { obj[header] = row[i] || ''; });
    return obj;
  });
}

function toBool(val: string): boolean {
  return val?.toLowerCase() === 'true';
}

export async function fetchFellows(): Promise<Fellow[]> {
  const rows = await getSheetValues('Fellows');
  const records = rowsToObjects(rows);
  return records.filter((r) => r['ID'] || r['Name']).map((r) => ({
    id: r['ID'] || '',
    name: r['Name'] || '',
    email: r['Email'] || '',
    congressional_email: r['Congressional Email'] || '',
    phone: r['Phone'] || '',
    linkedin: r['LinkedIn'] || '',
    fellow_type: r['Fellow Type'] || '',
    party: r['Party'] || '',
    office: r['Office'] || '',
    supervisor_email: r["Supervisor's Email"] || '',
    chamber: r['Chamber'] || '',
    cohort: r['Cohort'] || '',
    status: r['Status'] || 'Active',
    start_date: r['Start Date'] || '',
    end_date: r['End Date'] || '',
    last_check_in: r['Last Check-in'] || '',
    prior_role: r['Prior Role'] || '',
    education: r['Education'] || '',
    notes: r['Notes'] || '',
    requires_monthly_reports: toBool(r['Requires Monthly Reports']),
    report_start_date: r['Report Start Date'] || '',
    report_end_month: r['Report End Month'] || '',
  }));
}

export async function fetchCheckins(fellowId?: string): Promise<Checkin[]> {
  const rows = await getSheetValues('Check-ins');
  const records = rowsToObjects(rows);
  const checkins = records.filter((r) => r['ID']).map((r) => ({
    id: r['ID'] || '',
    fellow_id: r['Fellow ID'] || '',
    date: r['Date'] || '',
    check_in_type: r['Check-in Type'] || '',
    notes: r['Notes'] || '',
    staff_member: r['Staff Member'] || '',
  }));
  return fellowId ? checkins.filter((c) => c.fellow_id === fellowId) : checkins;
}

export async function fetchStatusReports(fellowId?: string): Promise<StatusReport[]> {
  const rows = await getSheetValues('Status Reports');
  const records = rowsToObjects(rows);
  const reports = records.filter((r) => r['ID']).map((r) => ({
    id: r['ID'] || '',
    fellow_id: r['Fellow ID'] || '',
    fellow_name: r['Fellow Name'] || '',
    month: r['Month'] || '',
    submitted: toBool(r['Submitted']),
    date_submitted: r['Date Submitted'] || '',
    notes: r['Notes'] || '',
    late: toBool(r['Late']),
  }));
  return fellowId ? reports.filter((r) => r.fellow_id === fellowId) : reports;
}

// ── Alumni ──────────────────────────────────────────────────────────────────

export async function fetchAlumni(): Promise<Alumni[]> {
  const rows = await getSheetValues('Alumni');
  const records = rowsToObjects(rows);
  return records.filter((r) => r['ID'] || r['Name']).map((r) => ({
    id: r['ID'] || '',
    name: r['Name'] || '',
    email: r['Email'] || '',
    phone: r['Phone Number'] || '',
    cohort: r['Cohort'] || '',
    fellow_types: r['Fellow Type'] ? r['Fellow Type'].split(',').map((t) => t.trim()).filter(Boolean) : [],
    office_served: r['Office Served'] || '',
    chamber: r['Chamber'] || '',
    party: r['Party'] || '',
    current_role: r['Current Role'] || '',
    sector: r['Sector'] || '',
    location: r['Location'] || '',
    contact: r['Contact?'] ? toBool(r['Contact?']) : true,
    linkedin: r['LinkedIn'] || '',
    last_engaged: r['Last Engaged'] || '',
    engagement_notes: r['Engagement Notes'] || '',
    notes: r['Notes'] || '',
    prior_role: r['Prior Role'] || '',
    education: r['Education'] || '',
    served_on_hill: toBool(r['Served on the Hill Post-fellowship?']),
    currently_on_hill: toBool(r['Currently on the Hill?']),
  }));
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function alumniRowValues(id: string, d: Partial<Alumni>): string[] {
  const ft = Array.isArray(d.fellow_types) ? d.fellow_types.join(',') : '';
  return [
    id, d.name || '', d.email || '', d.phone || '', d.cohort || '',
    ft, d.party || '', d.office_served || '', d.chamber || '',
    d.education || '', d.prior_role || '', d.current_role || '',
    d.served_on_hill ? 'TRUE' : 'FALSE',
    d.currently_on_hill ? 'TRUE' : 'FALSE',
    d.sector || '', d.location || '',
    d.contact === false ? 'FALSE' : 'TRUE',
    d.linkedin || '', d.last_engaged || '', d.engagement_notes || '', d.notes || '',
  ];
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function findRowById(sheetName: string, id: string): Promise<number | null> {
  const rows = await getSheetValues(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return i + 1; // 1-indexed sheet row
  }
  return null;
}

export async function createAlumni(data: Partial<Alumni>): Promise<boolean> {
  const sheets = await getSheetsClient();
  const id = newId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Alumni',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [alumniRowValues(id, data)] },
  });
  return true;
}

export async function updateAlumni(id: string, data: Partial<Alumni>): Promise<boolean> {
  const sheets = await getSheetsClient();
  const rowNum = await findRowById('Alumni', id);
  if (!rowNum) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Alumni!A${rowNum}:U${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [alumniRowValues(id, data)] },
  });
  return true;
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function fetchEvents(): Promise<TCEvent[]> {
  const rows = await getSheetValues('Events');
  const records = rowsToObjects(rows);
  return records
    .filter((r) => r['Event ID'])
    .map((r) => ({
      id: r['Event ID'] || '',
      name: r['Event Name'] || '',
      date: r['Date'] || '',
      type: r['Type'] || '',
      location: r['Location'] || '',
      venue: r['Venue'] || '',
      cohort: r['Cohort'] || '',
      quarter: r['Quarter'] || '',
      description: r['Description'] || '',
      required: r['Required for Fellows?'] ? toBool(r['Required for Fellows?']) : true,
      staffed_by: r['Staffed By'] || '',
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function eventRowValues(id: string, d: Partial<TCEvent>): string[] {
  return [
    id, d.name || '', d.date || '', d.type || '', d.location || '',
    d.venue || '', d.cohort || '', d.quarter || '', d.description || '',
    d.required !== false ? 'TRUE' : 'FALSE',
    d.staffed_by || '',
  ];
}

export async function addEvent(data: Partial<TCEvent>): Promise<boolean> {
  const sheets = await getSheetsClient();
  const id = newId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Events',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [eventRowValues(id, data)] },
  });
  return true;
}

export async function updateEvent(id: string, data: Partial<TCEvent>): Promise<boolean> {
  const sheets = await getSheetsClient();
  const rowNum = await findRowById('Events', id);
  if (!rowNum) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Events!A${rowNum}:K${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [eventRowValues(id, data)] },
  });
  return true;
}

// ── Event Attendance ─────────────────────────────────────────────────────────

export async function fetchEventAttendance(): Promise<EventAttendance[]> {
  const rows = await getSheetValues('Event Attendance');
  const records = rowsToObjects(rows);
  return records.filter((r) => r['Record ID']).map((r) => ({
    id: r['Record ID'] || '',
    event_id: r['Event ID'] || '',
    fellow_id: r['Fellow ID'] || '',
    fellow_name: r['Fellow Name'] || '',
    attended: toBool(r['Attended?']),
    notes: r['Notes'] || '',
  }));
}

// ── Accomplishments ──────────────────────────────────────────────────────────

// Cache the parsed workbook + raw buffer so we only download once per cold start
let _accomplishmentWorkbook: XLSX.WorkBook | null = null;
let _accomplishmentBuffer: Buffer | null = null;

async function getAccomplishmentWorkbook(): Promise<{ wb: XLSX.WorkBook; buf: Buffer }> {
  if (_accomplishmentWorkbook && _accomplishmentBuffer) {
    return { wb: _accomplishmentWorkbook, buf: _accomplishmentBuffer };
  }
  const id = process.env.ACCOMPLISHMENT_SHEET_ID;
  if (!id) throw new Error('ACCOMPLISHMENT_SHEET_ID not set');
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    { fileId: id, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  _accomplishmentBuffer = Buffer.from(res.data as ArrayBuffer);
  _accomplishmentWorkbook = XLSX.read(_accomplishmentBuffer, { type: 'buffer', cellDates: true, cellNF: false, cellHTML: false });
  return { wb: _accomplishmentWorkbook, buf: _accomplishmentBuffer };
}

// Extract ALL hyperlinks per cell directly from the raw xlsx XML.
// Returns: { "G5": ["https://..."], "G6": ["https://url1", "https://url2"] }
function extractAllHyperlinksFromXlsx(buf: Buffer, sheetName: string): Record<string, string[]> {
  try {
    const zip = new AdmZip(buf);

    // 1. Find the sheet's file path via workbook.xml + its rels
    const workbookXml = zip.readAsText('xl/workbook.xml');
    const workbookRels = zip.readAsText('xl/_rels/workbook.xml.rels');

    // Escape special regex chars in sheet name
    const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sheetRIdMatch = workbookXml.match(new RegExp(`<sheet[^>]+name="${escaped}"[^>]+r:id="([^"]+)"`))
                       || workbookXml.match(new RegExp(`<sheet[^>]+r:id="([^"]+)"[^>]+name="${escaped}"`));
    if (!sheetRIdMatch) return {};
    const sheetRId = sheetRIdMatch[1];

    const relMatch = workbookRels.match(new RegExp(`Id="${sheetRId}"[^>]+Target="([^"]+)"`))
                  || workbookRels.match(new RegExp(`Target="([^"]+)"[^>]+Id="${sheetRId}"`));
    if (!relMatch) return {};
    const sheetRelPath = relMatch[1]; // e.g. "worksheets/sheet1.xml"
    const sheetPath = `xl/${sheetRelPath}`;
    const sheetFile = sheetRelPath.split('/').pop()!;
    const relsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

    // 2. Parse rels file: rId → URL
    const rIdToUrl: Record<string, string> = {};
    try {
      const relsXml = zip.readAsText(relsPath);
      for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
        rIdToUrl[m[1]] = m[2].replace(/&amp;/g, '&');
      }
    } catch { /* no rels file = no hyperlinks */ }

    // 3. Parse <hyperlinks> section from sheet XML: cell ref → [urls]
    const sheetXml = zip.readAsText(sheetPath);
    const cellToUrls: Record<string, string[]> = {};
    const hlSection = sheetXml.match(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/);
    if (!hlSection) return {};

    // Attribute order varies — match either r:id/ref or ref/r:id
    const hlRegex = /<hyperlink\s[^>]*?(?:r:id="([^"]+)"[^>]*?ref="([^"]+)"|ref="([^"]+)"[^>]*?r:id="([^"]+)")[^>]*?\/?>/g;
    for (const m of hlSection[1].matchAll(hlRegex)) {
      const rId     = m[1] || m[4];
      const cellRef = m[2] || m[3];
      const url = rIdToUrl[rId];
      if (url && cellRef) {
        if (!cellToUrls[cellRef]) cellToUrls[cellRef] = [];
        cellToUrls[cellRef].push(url);
      }
    }

    return cellToUrls;
  } catch (e) {
    console.error('[extractAllHyperlinks]', e);
    return {};
  }
}

function parseAccomplishmentSheet(
  ws: XLSX.WorkSheet,
  buf: Buffer,
  sheetName: string,
  tab: string
): Accomplishment[] {
  if (!ws || !ws['!ref']) return [];

  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  if (rows.length < 2) return [];

  const headers = rows[0];
  const descColIdx     = headers.findIndex((h) => h === 'Description');
  const linksColIdx    = headers.findIndex((h) => h === 'Links/Evidence');
  const linkedinColIdx = headers.findIndex((h) => h === 'LinkedIn');
  const range = XLSX.utils.decode_range(ws['!ref']!);

  // All hyperlinks from raw XML: cellRef (e.g. "G5") → [url1, url2, ...]
  const allHyperlinks = extractAllHyperlinksFromXlsx(buf, sheetName);

  // Build row-index → { url, html } for non-description columns (single link per cell)
  function extractCellData(colIdx: number): Record<number, { url: string; html: string }> {
    const map: Record<number, { url: string; html: string }> = {};
    if (colIdx < 0) return map;
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
      if (!cell) continue;
      const url = cell.l?.Target || (typeof cell.v === 'string' && cell.v.startsWith('http') ? cell.v : '');
      const html = cell.h || '';
      if (url || html) map[r] = { url, html };
    }
    return map;
  }

  const linkData     = extractCellData(linksColIdx);
  const linkedinData = extractCellData(linkedinColIdx);

  // For description column, also pull html from cell.h
  const descColLetter = descColIdx >= 0 ? XLSX.utils.encode_col(descColIdx) : '';
  function descHtmlAt(sheetRow: number): string {
    if (descColIdx < 0) return '';
    const cell = ws[XLSX.utils.encode_cell({ r: sheetRow, c: descColIdx })];
    return cell?.h || '';
  }

  return rows
    .slice(1)
    .map((row, i) => {
      const r: Record<string, string> = {};
      headers.forEach((h, idx) => { r[h] = String(row[idx] ?? ''); });
      const sheetRow = i + 1; // 0-indexed within data rows → 1-indexed cell row
      const cellRef  = `${descColLetter}${sheetRow + 1}`; // +1 for header row offset
      const sourceLinks = allHyperlinks[cellRef] || [];
      return {
        id: `${tab}-${i}`,
        cohort: r['Cohort'] || '',
        fellow_name: r['Fellow Name'] || '',
        linkedin: linkedinData[sheetRow]?.url || r['LinkedIn'] || '',
        office: r['Office/Member'] || '',
        date: r['Date'] || '',
        type: r['Accomplishment Type'] || '',
        description: r['Description'] || '',
        description_html: descHtmlAt(sheetRow),
        source_link: sourceLinks[0] || '',
        source_links: sourceLinks,
        links: linkData[sheetRow]?.url || r['Links/Evidence'] || '',
        policy_tags: r['Policy Tags']
          ? r['Policy Tags'].split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        traffic_light: r['Traffic Light'] || '',
        content_framework: r['Content Framework Tier'] || r['Content Framework'] || '',
        tab,
      };
    })
    .filter((a) => a.fellow_name || a.description);
}

export async function fetchAccomplishments(): Promise<Accomplishment[]> {
  const { wb, buf } = await getAccomplishmentWorkbook();

  function getSheet(name: string): XLSX.WorkSheet {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" not found. Available: ${Object.keys(wb.Sheets).join(', ')}`);
    return ws;
  }

  const masterName = 'Master Accomplishments Log';
  const aisfName   = 'AI Security Fellows';

  return [
    ...parseAccomplishmentSheet(getSheet(masterName), buf, masterName, 'Master'),
    ...parseAccomplishmentSheet(getSheet(aisfName),   buf, aisfName,   'AISF'),
  ];
}

export async function saveAttendanceBatch(
  eventId: string,
  attendanceMap: Record<string, { fellowName: string; attended: boolean }>
): Promise<boolean> {
  const sheets = await getSheetsClient();
  const rows = await getSheetValues('Event Attendance');

  // Build lookup: "eventId|fellowId" → row number
  const existing: Record<string, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const key = `${rows[i][1]}|${rows[i][2]}`;
    existing[key] = i + 1;
  }

  const batchUpdates: { range: string; values: string[][] }[] = [];
  const newRows: string[][] = [];

  for (const [fellowId, { fellowName, attended }] of Object.entries(attendanceMap)) {
    const key = `${eventId}|${fellowId}`;
    const val = attended ? 'TRUE' : 'FALSE';
    if (existing[key]) {
      batchUpdates.push({ range: `Event Attendance!E${existing[key]}`, values: [[val]] });
    } else {
      newRows.push([newId(), eventId, fellowId, fellowName, val, '']);
    }
  }

  if (batchUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: batchUpdates,
      },
    });
  }
  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: 'Event Attendance',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows },
    });
  }
  return true;
}
