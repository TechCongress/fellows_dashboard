import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { Fellow, Checkin, StatusReport, Alumni, TCEvent, EventAttendance, Accomplishment, CareerHistoryEntry, CareerPhase } from '@/types';
import { sortHistory, CAREER_PHASES, CAREER_SECTORS, normalizeSector } from '@/lib/career-pathway';

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
  // Row 1 (index 0) is a "do not edit" warning banner; row 2 (index 1) is headers.
  if (rows.length < 3) return [];
  const headers = rows[1];
  return rows.slice(2).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => { obj[header] = row[i] || ''; });
    return obj;
  });
}

function toBool(val: string): boolean {
  return val?.toLowerCase() === 'true';
}

/**
 * 0-indexed column number → A1 column letter. Handles past Z (26 → "AA"),
 * which `String.fromCharCode(65 + i)` silently gets wrong once a tab grows
 * past 26 columns — which the new Career Pathway columns push the Fellows tab
 * close to.
 */
function columnLetter(index: number): string {
  let n = index;
  let out = '';
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

/**
 * Read a tab's values, returning null instead of throwing when the tab does
 * not exist yet. Lets Career Pathway features degrade to a "not set up yet"
 * state rather than 500-ing the whole page.
 */
async function getSheetValuesSafe(sheetName: string): Promise<string[][] | null> {
  try {
    return await getSheetValues(sheetName);
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/Unable to parse range|not found/i.test(msg)) return null;
    throw err;
  }
}

/**
 * Parse a Google Sheets multi-select (chips) cell into a tag list. The Sheets
 * API returns chip values as a comma-separated string; newline-separated and
 * single-value cells are handled too.
 */
export function parseTags(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

function serializeTags(tags: string[] | undefined): string {
  return Array.isArray(tags) ? tags.filter(Boolean).join(', ') : '';
}

export async function fetchFellows(): Promise<Fellow[]> {
  const rows = await getSheetValues('Fellows');
  const records = rowsToObjects(rows);
  return records.filter((r) => r['ID'] || r['Name']).map((r) => ({
    id: r['ID'] || '',
    name: r['Name'] || '',
    email: r['Email'] || '',
    congressional_email: r['Congressional Email'] || '',
    phone: r['Phone Number'] || '',
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
    onboarding_completed: r['Onboarding Completed Tasks'] || '',
    offboarding_completed: r['Offboarding Completed Tasks'] || '',
    // Career Pathway columns — absent until the columns are added to the tab,
    // in which case these read as empty rather than breaking the fetch.
    policy_areas: parseTags(r[FELLOW_POLICY_AREAS_COL]),
    target_pathways: parseTags(r[FELLOW_TARGET_PATHWAYS_COL]),
  }));
}

function fellowDataMap(id: string, d: Partial<Fellow>): Record<string, string> {
  return {
    'ID': id,
    'Name': d.name || '',
    'Email': d.email || '',
    'Congressional Email': d.congressional_email || '',
    'Phone Number': d.phone || '',
    'LinkedIn': d.linkedin || '',
    'Fellow Type': d.fellow_type || '',
    'Party': d.party || '',
    'Office': d.office || '',
    "Supervisor's Email": d.supervisor_email || '',
    'Chamber': d.chamber || '',
    'Cohort': d.cohort || '',
    'Status': d.status || 'Active',
    'Start Date': d.start_date || '',
    'End Date': d.end_date || '',
    'Last Check-in': d.last_check_in || '',
    'Prior Role': d.prior_role || '',
    'Education': d.education || '',
    'Notes': d.notes || '',
    'Requires Monthly Reports': d.requires_monthly_reports ? 'TRUE' : 'FALSE',
    'Report Start Date': d.report_start_date || '',
    'Report End Month': d.report_end_month || '',
    'Onboarding Completed Tasks': d.onboarding_completed || '',
    'Offboarding Completed Tasks': d.offboarding_completed || '',
    [FELLOW_POLICY_AREAS_COL]: serializeTags(d.policy_areas),
    [FELLOW_TARGET_PATHWAYS_COL]: serializeTags(d.target_pathways),
  };
}

async function getFellowHeaders(): Promise<string[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: 'Fellows!2:2',
  });
  return (res.data.values?.[0] || []) as string[];
}

export async function createFellow(data: Partial<Fellow>): Promise<boolean> {
  const id = newId();
  const headers = await getFellowHeaders();
  const map = fellowDataMap(id, data);
  const row = headers.map(h => map[h] ?? '');
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Fellows',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
  return true;
}

export async function updateFellow(id: string, data: Partial<Fellow>): Promise<boolean> {
  const headers = await getFellowHeaders();
  const map = fellowDataMap(id, data);
  const row = headers.map(h => map[h] ?? '');
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rowNum = await findRowById('Fellows', id);
  if (!rowNum) return false;
  const lastCol = columnLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Fellows!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
  return true;
}

export async function updateFellowOnboarding(id: string, completed: string): Promise<boolean> {
  const headers = await getFellowHeaders();
  const colIndex = headers.indexOf('Onboarding Completed Tasks');
  if (colIndex === -1) return false; // column not yet added to sheet
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rowNum = await findRowById('Fellows', id);
  if (!rowNum) return false;
  const colLetter = columnLetter(colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Fellows!${colLetter}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[completed]] },
  });
  return true;
}

export async function updateFellowOffboarding(id: string, completed: string): Promise<boolean> {
  const headers = await getFellowHeaders();
  const colIndex = headers.indexOf('Offboarding Completed Tasks');
  if (colIndex === -1) return false;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rowNum = await findRowById('Fellows', id);
  if (!rowNum) return false;
  const colLetter = columnLetter(colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Fellows!${colLetter}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[completed]] },
  });
  return true;
}

export async function deleteFellow(id: string): Promise<boolean> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rowNum = await findRowById('Fellows', id);
  if (!rowNum) return false;

  // Get the sheet ID for the "Fellows" tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const fellowsSheet = meta.data.sheets?.find(s => s.properties?.title === 'Fellows');
  const sheetId = fellowsSheet?.properties?.sheetId;
  if (sheetId == null) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowNum - 1, // 0-indexed
            endIndex: rowNum,
          },
        },
      }],
    },
  });
  return true;
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

export async function logStatusReport(data: {
  fellow_id: string;
  fellow_name: string;
  month: string;
  late: boolean;
  date_submitted: string;
  notes?: string;
}): Promise<boolean> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rows = await getSheetValues('Status Reports');

  // Check if a record for this fellow+month already exists and update it
  // rows[0]=warning, rows[1]=headers, rows[2+]=data
  for (let i = 2; i < rows.length; i++) {
    if (rows[i][1] === data.fellow_id && rows[i][3] === data.month) {
      const rowNum = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Status Reports!E${rowNum}:H${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['TRUE', data.date_submitted, data.notes || '', data.late ? 'TRUE' : 'FALSE']],
        },
      });
      return true;
    }
  }

  // No existing record — append a new row
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Status Reports',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        newId(),
        data.fellow_id,
        data.fellow_name,
        data.month,
        'TRUE',
        data.date_submitted,
        data.notes || '',
        data.late ? 'TRUE' : 'FALSE',
      ]],
    },
  });
  return true;
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
    // Renamed sector labels still in the sheet are mapped to the current one on
    // read, so badges, filters, the pie chart, and matching all agree whether
    // or not the spreadsheet has been updated yet.
    sector: normalizeSector(r['Sector'] || ''),
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
    policy_areas: parseTags(r[ALUMNI_POLICY_AREAS_COL]),
    realized_pathway: (r[ALUMNI_REALIZED_PATHWAY_COL] || '').trim(),
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
  // rows[0] = warning banner, rows[1] = headers, rows[2+] = data
  for (let i = 2; i < rows.length; i++) {
    if (rows[i][0] === id) return i + 1; // 1-indexed sheet row
  }
  return null;
}

function alumniDataMap(id: string, d: Partial<Alumni>): Record<string, string> {
  return {
    'ID': id,
    'Name': d.name || '',
    'Email': d.email || '',
    'Phone Number': d.phone || '',
    'Cohort': d.cohort || '',
    'Fellow Type': Array.isArray(d.fellow_types) ? d.fellow_types.join(',') : '',
    'Party': d.party || '',
    'Office Served': d.office_served || '',
    'Chamber': d.chamber || '',
    'Education': d.education || '',
    'Prior Role': d.prior_role || '',
    'Current Role': d.current_role || '',
    'Served on the Hill Post-fellowship?': d.served_on_hill ? 'TRUE' : 'FALSE',
    'Currently on the Hill?': d.currently_on_hill ? 'TRUE' : 'FALSE',
    'Sector': d.sector || '',
    'Location': d.location || '',
    'Contact?': d.contact === false ? 'FALSE' : 'TRUE',
    'LinkedIn': d.linkedin || '',
    'Last Engaged': d.last_engaged || '',
    'Engagement Notes': d.engagement_notes || '',
    'Notes': d.notes || '',
    [ALUMNI_POLICY_AREAS_COL]: serializeTags(d.policy_areas),
    [ALUMNI_REALIZED_PATHWAY_COL]: (d.realized_pathway || '').trim(),
  };
}

async function getAlumniHeaders(): Promise<string[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: 'Alumni!2:2',
  });
  return (res.data.values?.[0] || []) as string[];
}

export async function createAlumni(data: Partial<Alumni>): Promise<boolean> {
  const id = newId();
  const headers = await getAlumniHeaders();
  const map = alumniDataMap(id, data);
  const row = headers.map(h => map[h] ?? '');
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: 'Alumni',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
  return true;
}

export async function updateAlumni(id: string, data: Partial<Alumni>): Promise<boolean> {
  const headers = await getAlumniHeaders();
  const map = alumniDataMap(id, data);
  const row = headers.map(h => map[h] ?? '');
  const sheets = await getSheetsClient();
  const rowNum = await findRowById('Alumni', id);
  if (!rowNum) return false;
  const lastCol = columnLetter(headers.length - 1); // e.g. 21 cols → U
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `Alumni!A${rowNum}:${lastCol}${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
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
  _accomplishmentWorkbook = XLSX.read(_accomplishmentBuffer, { type: 'buffer', cellDates: true, cellNF: false, cellHTML: true });
  return { wb: _accomplishmentWorkbook, buf: _accomplishmentBuffer };
}

// Extract ALL hyperlinks per cell directly from the raw xlsx XML.
// Returns: { "G5": ["https://..."], "G6": ["https://url1", "https://url2"] }
function extractAllHyperlinksFromXlsx(buf: Buffer, sheetName: string): Record<string, string[]> {
  const cellToUrls: Record<string, string[]> = {};
  try {
    const zip = new AdmZip(buf);

    // Step 1: Find the sheet rId by iterating <sheet> elements in workbook.xml
    const workbookXml = zip.readAsText('xl/workbook.xml');
    let sheetRId: string | null = null;
    const sheetElems = workbookXml.match(/<sheet\s[^>]+\/?>/g) || [];
    for (const el of sheetElems) {
      const nameMatch = el.match(/name="([^"]+)"/);
      const rIdMatch  = el.match(/r:id="([^"]+)"/);
      if (nameMatch && rIdMatch && nameMatch[1] === sheetName) {
        sheetRId = rIdMatch[1];
        break;
      }
    }
    if (!sheetRId) {
      console.error('[hyperlinks] sheet not found:', sheetName,
        '| sheets in workbook:', sheetElems.map(e => e.match(/name="([^"]+)"/)?.[1]).join(', '));
      return {};
    }

    // Step 2: Find sheet file path from workbook rels
    const workbookRels = zip.readAsText('xl/_rels/workbook.xml.rels');
    let sheetRelPath: string | null = null;
    const relElems = workbookRels.match(/<Relationship\s[^>]+\/?>/g) || [];
    for (const el of relElems) {
      const idMatch     = el.match(/Id="([^"]+)"/);
      const targetMatch = el.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch && idMatch[1] === sheetRId) {
        sheetRelPath = targetMatch[1];
        break;
      }
    }
    if (!sheetRelPath) {
      console.error('[hyperlinks] rel not found for rId:', sheetRId);
      return {};
    }

    // Normalise path (may be "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml")
    const sheetPath  = sheetRelPath.startsWith('/') ? sheetRelPath.slice(1) : `xl/${sheetRelPath}`;
    const sheetFile  = sheetPath.split('/').pop()!;
    const relsPath   = `xl/worksheets/_rels/${sheetFile}.rels`;

    // Step 3: Build rId → URL from the sheet's own rels file
    const rIdToUrl: Record<string, string> = {};
    const relsEntry = zip.getEntry(relsPath);
    if (!relsEntry) {
      console.error('[hyperlinks] no rels file at:', relsPath);
      return {};
    }
    const relsXml = zip.readAsText(relsPath);
    for (const el of (relsXml.match(/<Relationship\s[^>]+\/?>/g) || [])) {
      const idMatch     = el.match(/Id="([^"]+)"/);
      const targetMatch = el.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch) {
        rIdToUrl[idMatch[1]] = targetMatch[1].replace(/&amp;/g, '&');
      }
    }
    console.log('[hyperlinks] rId→URL count:', Object.keys(rIdToUrl).length);

    // Step 4: Parse each <hyperlink .../> element in the sheet XML
    const sheetXml    = zip.readAsText(sheetPath);
    const hlSection   = sheetXml.match(/<hyperlinks>([\s\S]*?)<\/hyperlinks>/);
    if (!hlSection) {
      console.error('[hyperlinks] no <hyperlinks> section in sheet XML for:', sheetName);
      return {};
    }
    const hlElems = hlSection[1].match(/<hyperlink\s[^>]+\/?>/g) || [];
    for (const el of hlElems) {
      const refMatch = el.match(/ref="([^"]+)"/);
      const ridMatch = el.match(/r:id="([^"]+)"/);
      if (!refMatch || !ridMatch) continue;
      const cellRef = refMatch[1];
      const url     = rIdToUrl[ridMatch[1]];
      if (url) {
        if (!cellToUrls[cellRef]) cellToUrls[cellRef] = [];
        cellToUrls[cellRef].push(url);
      }
    }
    console.log('[hyperlinks] cells with links:', Object.keys(cellToUrls).length,
      Object.keys(cellToUrls).slice(0, 5));
  } catch (e) {
    console.error('[hyperlinks] exception:', e);
  }
  return cellToUrls;
}

// Pull any URLs already present as href="..." in SheetJS-generated HTML.
// SheetJS occasionally includes <a> tags for simple HYPERLINK-formula cells.
function extractUrlsFromHtml(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    if (m[1] && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

// Replace hyperlink-styled elements with real <a> tags using urls[] in order.
// Handles <u> tags and <span> elements with any underline styling variant.
// If the HTML already contains <a> tags, return it unchanged.
function injectLinksIntoHtml(html: string, urls: string[]): string {
  if (!html) return html;
  if (/<a[\s>]/i.test(html)) return html; // already has anchors
  if (urls.length === 0) return html;
  let idx = 0;

  const wrap = (inner: string) => {
    if (idx >= urls.length) return null;
    const url = urls[idx++];
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563EB;text-decoration:underline;">${inner}</a>`;
  };

  // 1. Try <u> tags first (SheetJS sometimes outputs these)
  const afterU = html.replace(/<u>([\s\S]*?)<\/u>/gi, (match, inner) => wrap(inner) ?? match);
  if (afterU !== html) return afterU;

  // 2. Try <span> elements where the attributes mention "underline" in any form
  idx = 0;
  return html.replace(/<span([^>]*)>([\s\S]*?)<\/span>/gi, (match, attrs, inner) => {
    if (!attrs.includes('underline')) return match;
    return wrap(inner) ?? match;
  });
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

      // Primary: XML-extracted hyperlinks (supports multiple per cell)
      // Fallback: XLSX cell.l (single link) or HYPERLINK formula
      let sourceLinks = allHyperlinks[cellRef] || [];
      if (sourceLinks.length === 0 && descColIdx >= 0) {
        const descCell = ws[XLSX.utils.encode_cell({ r: sheetRow, c: descColIdx })];
        const cellTarget = descCell?.l?.Target || '';
        const formulaUrl = typeof descCell?.f === 'string'
          ? (descCell.f.match(/HYPERLINK\s*\(\s*"([^"]+)"/i)?.[1] || '')
          : '';
        const fallback = cellTarget || formulaUrl;
        if (fallback) sourceLinks = [fallback];
      }

      // Also pull any URLs SheetJS embedded directly in the HTML, and merge (dedup)
      const rawDescHtml = descHtmlAt(sheetRow);
      const htmlUrls = extractUrlsFromHtml(rawDescHtml);
      const mergedLinks = [...sourceLinks];
      for (const u of htmlUrls) {
        if (!mergedLinks.includes(u)) mergedLinks.push(u);
      }

      // Pull URLs from the Links/Evidence column and add to source_links.
      // Supports: single plain URL, comma-separated plain URLs, or a hyperlinked cell.
      const rawLinkField = linkData[sheetRow]?.url || r['Links/Evidence'] || '';
      for (const part of rawLinkField.split(',')) {
        const u = part.trim();
        if (u.startsWith('http') && !mergedLinks.includes(u)) mergedLinks.push(u);
      }

      return {
        id: `${tab}-${i}`,
        cohort: r['Cohort'] || '',
        fellow_name: r['Fellow Name'] || '',
        linkedin: linkedinData[sheetRow]?.url || r['LinkedIn'] || '',
        office: r['Office/Member'] || '',
        date: r['Date'] || '',
        type: r['Accomplishment Type'] || '',
        description: r['Description'] || '',
        description_html: rawDescHtml,
        source_link: mergedLinks[0] || '',
        source_links: mergedLinks,
        links: rawLinkField,
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
  // rows[0] = warning banner, rows[1] = headers, rows[2+] = data
  const existing: Record<string, number> = {};
  for (let i = 2; i < rows.length; i++) {
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

// ── Career Pathway Engine ────────────────────────────────────────────────────
//
// Three new columns on existing tabs plus one new tab. None of them are
// required: every read below tolerates a missing column or missing tab and
// degrades to empty, and every write reports precisely which column is absent
// so the UI can tell staff exactly what to add to the sheet.

export const FELLOW_POLICY_AREAS_COL = 'Policy Issue Areas';
export const FELLOW_TARGET_PATHWAYS_COL = 'Target Pathways';
export const ALUMNI_POLICY_AREAS_COL = 'Policy Issue Areas';
export const ALUMNI_REALIZED_PATHWAY_COL = 'Realized Pathway';
export const CAREER_HISTORY_SHEET = 'Alumni Career History';

export interface PathwaySetupStatus {
  fellowsPolicyAreas: boolean;
  fellowsTargetPathways: boolean;
  alumniPolicyAreas: boolean;
  alumniRealizedPathway: boolean;
  careerHistoryTab: boolean;
}

/** Which Career Pathway columns/tabs actually exist right now. */
export async function pathwaySetupStatus(): Promise<PathwaySetupStatus> {
  const [fellowHeaders, alumniHeaders, historyRows] = await Promise.all([
    getFellowHeaders().catch(() => [] as string[]),
    getAlumniHeaders().catch(() => [] as string[]),
    getSheetValuesSafe(CAREER_HISTORY_SHEET),
  ]);
  return {
    fellowsPolicyAreas: fellowHeaders.includes(FELLOW_POLICY_AREAS_COL),
    fellowsTargetPathways: fellowHeaders.includes(FELLOW_TARGET_PATHWAYS_COL),
    alumniPolicyAreas: alumniHeaders.includes(ALUMNI_POLICY_AREAS_COL),
    alumniRealizedPathway: alumniHeaders.includes(ALUMNI_REALIZED_PATHWAY_COL),
    careerHistoryTab: historyRows !== null,
  };
}

export interface ColumnWriteResult {
  ok: boolean;
  missingColumns: string[];
}

/**
 * Write only the pathway cells for one person, leaving every other column
 * untouched. Safer than rewriting the whole row (which is what the general
 * update path does) and it makes a missing column an explicit, reportable
 * outcome instead of a silently dropped value.
 */
async function writeNamedCells(
  sheetName: string,
  headers: string[],
  rowNum: number,
  values: Record<string, string>
): Promise<ColumnWriteResult> {
  const missingColumns: string[] = [];
  const data: { range: string; values: string[][] }[] = [];
  for (const [header, value] of Object.entries(values)) {
    const idx = headers.indexOf(header);
    if (idx === -1) { missingColumns.push(header); continue; }
    data.push({ range: `${sheetName}!${columnLetter(idx)}${rowNum}`, values: [[value]] });
  }
  if (data.length > 0) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: getSpreadsheetId(),
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }
  return { ok: missingColumns.length === 0, missingColumns };
}

export async function updateFellowPathway(
  id: string,
  policyAreas: string[],
  targetPathways: string[]
): Promise<ColumnWriteResult> {
  const headers = await getFellowHeaders();
  const rowNum = await findRowById('Fellows', id);
  if (!rowNum) return { ok: false, missingColumns: [] };
  return writeNamedCells('Fellows', headers, rowNum, {
    [FELLOW_POLICY_AREAS_COL]: serializeTags(policyAreas),
    [FELLOW_TARGET_PATHWAYS_COL]: serializeTags(targetPathways),
  });
}

export async function updateAlumniPathway(
  id: string,
  policyAreas: string[],
  realizedPathway: string
): Promise<ColumnWriteResult> {
  const headers = await getAlumniHeaders();
  const rowNum = await findRowById('Alumni', id);
  if (!rowNum) return { ok: false, missingColumns: [] };
  return writeNamedCells('Alumni', headers, rowNum, {
    [ALUMNI_POLICY_AREAS_COL]: serializeTags(policyAreas),
    [ALUMNI_REALIZED_PATHWAY_COL]: (realizedPathway || '').trim(),
  });
}

// ── Alumni Career History tab ────────────────────────────────────────────────

/**
 * Accepted header spellings per logical field. The tab was created by hand, so
 * we match on any reasonable variant rather than assuming exact strings or a
 * fixed column order.
 */
const HISTORY_HEADER_ALIASES: Record<string, string[]> = {
  id:     ['ID', 'Id', 'Person ID', 'Alumni ID', 'Fellow ID'],
  name:   ['Name', 'Person', 'Alumni Name', 'Fellow Name'],
  order:  ['Order', 'Sort Order'],
  phase:  ['Phase'],
  org:    ['Organization', 'Org', 'Employer'],
  title:  ['Title', 'Role', 'Position'],
  sector: ['Sector'],
  start:  ['Start Date', 'Start'],
  end:    ['End Date', 'End'],
  notes:  ['Notes', 'Note'],
};

interface HistorySheetShape {
  rows: string[][];
  headers: string[];
  headerRow: number;   // 0-indexed row holding the headers
  cols: Record<string, number>;  // logical field → 0-indexed column
}

/**
 * Locate the header row. Other tabs in this workbook put a "do not edit"
 * banner in row 1 and headers in row 2, but this tab was created separately,
 * so we detect rather than assume.
 */
function readHistorySheet(rows: string[][]): HistorySheetShape | null {
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const cells = (rows[i] || []).map((c) => (c || '').trim().toLowerCase());
    if (HISTORY_HEADER_ALIASES.id.some((a) => cells.includes(a.toLowerCase()))) { headerRow = i; break; }
  }
  if (headerRow === -1) return null;
  const headers = (rows[headerRow] || []).map((h) => (h || '').trim());
  const lower = headers.map((h) => h.toLowerCase());
  const cols: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HISTORY_HEADER_ALIASES)) {
    cols[field] = aliases.map((a) => lower.indexOf(a.toLowerCase())).find((i) => i >= 0) ?? -1;
  }
  return { rows, headers, headerRow, cols };
}

function rowToEntry(row: string[], cols: Record<string, number>): CareerHistoryEntry {
  const at = (field: string) => (cols[field] >= 0 ? (row[cols[field]] || '').trim() : '');
  return {
    person_id: at('id'),
    person_name: at('name'),
    order: parseInt(at('order'), 10) || 0,
    phase: (at('phase') || 'Post-Fellowship') as CareerPhase,
    org: at('org'),
    title: at('title'),
    sector: normalizeSector(at('sector')),
    start: normalizeMonth(at('start')),
    end: normalizeMonth(at('end')),
    notes: at('notes'),
  };
}

/**
 * Coerce whatever the sheet holds into "YYYY-MM". Accepts "2024-09",
 * "2024-09-01", "9/2024", "Sep 2024". Anything unparseable is passed through
 * untouched so a human can see and fix it rather than having it disappear.
 */
function normalizeMonth(value: string): string {
  if (!value) return '';
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const parsed = new Date(`${v} 1`);
  if (!isNaN(parsed.getTime()) && /[A-Za-z]/.test(v)) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }
  return v;
}

/**
 * "2008-07" → "07/2008" for writing back to the sheet, which is far easier to
 * scan by eye. Written with USER_ENTERED so Sheets stores a real date value
 * (sortable, filterable) rather than a text string; `ensureHistoryDateFormat`
 * pins the display pattern so it can't drift with locale.
 *
 * Round-trips safely: the API hands back the formatted "07/2008" and
 * normalizeMonth turns it straight back into "2008-07" for the editor.
 */
function toSheetMonth(value: string): string {
  const m = (value || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}/${m[1]}` : (value || '');
}

// Sheet IDs are stable for the life of the tab; cache per server instance.
let _historySheetId: number | null | undefined;

async function getHistorySheetId(): Promise<number | null> {
  if (_historySheetId !== undefined) return _historySheetId;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
  _historySheetId =
    meta.data.sheets?.find((s) => s.properties?.title === CAREER_HISTORY_SHEET)?.properties?.sheetId ?? null;
  return _historySheetId;
}

/**
 * Pin the Start/End columns to an MM/YYYY display format, over the whole column
 * (no endRowIndex = "to the bottom of the sheet") so later rows are covered too.
 *
 * This is the *only* presentation the code touches. Everything else about how
 * the tab looks — dropdown chip colours, fills, fonts, conditional formatting —
 * is owned by hand in Google Sheets and deliberately left alone. In particular
 * the code no longer sets data validation: the Sheets API exposes no colour
 * field on a validation rule (only condition / inputMessage / showCustomUi /
 * strict), so re-applying a dropdown from here would silently wipe any chip
 * colours set in the UI. Valid values are instead guaranteed server-side, in
 * saveCareerHistory.
 */
async function ensureHistoryDateFormat(cols: Record<string, number>, headerRow: number): Promise<void> {
  const sheetId = await getHistorySheetId();
  if (sheetId == null) return;

  const requests = ['start', 'end']
    .map((f) => cols[f])
    .filter((i) => i >= 0)
    .map((i) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow + 1, startColumnIndex: i, endColumnIndex: i + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'MM/yyyy' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    }));

  if (requests.length === 0) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSpreadsheetId(),
    requestBody: { requests },
  });
}

export interface CareerHistoryResult {
  available: boolean;               // false = the tab doesn't exist yet
  entries: CareerHistoryEntry[];
  missingColumns: string[];
}

/** Read career history, optionally for one person. Always Start-Date sorted. */
export async function fetchCareerHistory(personId?: string): Promise<CareerHistoryResult> {
  const rows = await getSheetValuesSafe(CAREER_HISTORY_SHEET);
  if (rows === null) return { available: false, entries: [], missingColumns: [] };
  const shape = readHistorySheet(rows);
  if (!shape) return { available: false, entries: [], missingColumns: [] };

  const missingColumns = Object.entries(shape.cols)
    .filter(([, i]) => i === -1)
    .map(([field]) => HISTORY_HEADER_ALIASES[field][0]);

  const entries = rows
    .slice(shape.headerRow + 1)
    .map((r) => rowToEntry(r, shape.cols))
    .filter((e) => e.person_id && (e.title || e.org));

  const filtered = personId ? entries.filter((e) => e.person_id === personId) : entries;
  return { available: true, entries: sortHistory(filtered), missingColumns };
}

/**
 * Replace one person's career history with `entries`, touching nobody else's
 * rows. Entries are re-sorted by Start Date and `Order` is recomputed as
 * 1..n — there is deliberately no user-facing Order field to maintain.
 *
 * Existing rows for the person are updated in place, extras are appended, and
 * any surplus rows are deleted bottom-up so earlier row indices stay valid.
 */
export async function saveCareerHistory(
  personId: string,
  personName: string,
  entries: Partial<CareerHistoryEntry>[]
): Promise<{ ok: boolean; available: boolean; saved: number }> {
  const rows = await getSheetValuesSafe(CAREER_HISTORY_SHEET);
  if (rows === null) return { ok: false, available: false, saved: 0 };
  const shape = readHistorySheet(rows);
  if (!shape) return { ok: false, available: false, saved: 0 };

  // Phase and Sector are clamped to the fixed taxonomies here rather than being
  // enforced by dropdown validation on the sheet — that keeps the guarantee
  // while leaving the sheet's own dropdowns and their colours untouched.
  const clean = sortHistory(
    entries
      .filter((e) => (e.title || '').trim() || (e.org || '').trim())
      .map((e) => ({
        phase: (CAREER_PHASES.includes(e.phase as CareerPhase) ? e.phase : 'Post-Fellowship') as CareerPhase,
        title: (e.title || '').trim(),
        org: (e.org || '').trim(),
        sector: CAREER_SECTORS.includes(normalizeSector(e.sector || '')) ? normalizeSector(e.sector || '') : '',
        start: normalizeMonth(e.start || ''),
        // "Current" means ongoing, so it never carries an end date.
        end: e.phase === 'Current' ? '' : normalizeMonth(e.end || ''),
        notes: (e.notes || '').trim(),
        order: 0,
      }))
  ).map((e, i) => ({ ...e, order: i + 1 }));

  const width = Math.max(shape.headers.length, ...Object.values(shape.cols).map((i) => i + 1));
  const buildRow = (e: (typeof clean)[number]): string[] => {
    const row = new Array<string>(width).fill('');
    const put = (field: string, value: string) => {
      const i = shape.cols[field];
      if (i >= 0) row[i] = value;
    };
    put('id', personId);
    put('name', personName);
    put('order', String(e.order));
    put('phase', e.phase);
    put('org', e.org);
    put('title', e.title);
    put('sector', e.sector);
    put('start', toSheetMonth(e.start));
    put('end', toSheetMonth(e.end));
    put('notes', e.notes);
    return row;
  };

  // 1-indexed sheet rows currently belonging to this person
  const idCol = shape.cols.id;
  const existingRowNums: number[] = [];
  for (let i = shape.headerRow + 1; i < rows.length; i++) {
    if ((rows[i]?.[idCol] || '').trim() === personId) existingRowNums.push(i + 1);
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const lastCol = columnLetter(width - 1);

  const overwriteCount = Math.min(existingRowNums.length, clean.length);
  const data = clean.slice(0, overwriteCount).map((e, i) => ({
    range: `${CAREER_HISTORY_SHEET}!A${existingRowNums[i]}:${lastCol}${existingRowNums[i]}`,
    values: [buildRow(e)],
  }));
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }

  const toAppend = clean.slice(overwriteCount).map(buildRow);
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: CAREER_HISTORY_SHEET,
      valueInputOption: 'USER_ENTERED',
      // Deliberately NOT insertDataOption: 'INSERT_ROWS'. Inserted rows don't
      // inherit data validation or formatting, which is what made written
      // phases land as plain text instead of dropdown selections. Overwriting
      // the existing empty rows instead means new data lands in cells that
      // already carry the sheet's dropdowns, colours, and formatting.
      requestBody: { values: toAppend },
    });
  }

  const surplus = existingRowNums.slice(clean.length);
  if (surplus.length > 0) {
    const sheetId = await getHistorySheetId();
    if (sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: surplus
            .slice()
            .sort((a, b) => b - a)  // delete bottom-up so earlier indices stay valid
            .map((rowNum) => ({
              deleteDimension: {
                range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
              },
            })),
        },
      });
    }
  }

  // Applied after the writes so it also catches newly appended rows. Failing
  // here must not fail the save — the data is already correct, only the date
  // display would be off.
  try {
    await ensureHistoryDateFormat(shape.cols, shape.headerRow);
  } catch (err) {
    console.error('Could not set the MM/YYYY date format on the career history tab:', err);
  }

  return { ok: true, available: true, saved: clean.length };
}
