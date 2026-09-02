import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { Fellow, Checkin, StatusReport, Alumni, TCEvent, EventAttendance, Accomplishment, CareerHistoryEntry, CareerPhase, PathwayRecord } from '@/types';
import { sortHistory, CAREER_PHASES, CAREER_SECTORS, normalizeSector, normalizePathway, MAX_POLICY_AREAS, MAX_TARGET_PATHWAYS } from '@/lib/career-pathway';

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

/**
 * Google allows 60 read requests per minute per user. That sounds generous
 * until you count what one interaction costs: opening a fellow's Career Pathway
 * tab reads four tabs, and saving their tags reads several more, because the
 * pathway join happens inside fetchFellows/fetchAlumni. A few quick edits in a
 * row used to be enough to hit the wall and fail the save outright.
 *
 * Two things fix that, and neither risks showing stale data for long:
 *
 *  1. Identical reads inside the same burst share one request. The promise is
 *     cached, not just the result, so concurrent callers (a Promise.all over
 *     fetchFellows + fetchAlumni) join the request already in flight rather
 *     than opening a second one.
 *  2. Any write clears the cache, so a save is always followed by a genuine
 *     re-read. Without that, the refresh after a save would hand back the rows
 *     as they looked before the write.
 *
 * The window is deliberately short. It exists to collapse the reads of a single
 * interaction, not to cache the spreadsheet — edits made directly in Google
 * Sheets still show up on the next page load.
 */
// Read at call time, not module load: ES imports are hoisted above any
// assignment in an importing file, so a constant evaluated here could never be
// overridden by a caller setting the variable.
function readWindowMs(): number {
  const raw = process.env.SHEETS_READ_WINDOW_MS;
  return raw === undefined || raw === '' ? 3000 : Number(raw);
}
const readCache = new Map<string, { at: number; rows: Promise<string[][]> }>();

/** Exported so a caller that must see the very latest rows — and tests, which
 *  rewrite the spreadsheet between assertions — can force the next read to go
 *  to Google rather than reuse the last one. */
export function invalidateReadCache() {
  readCache.clear();
}

/** Google returns 429 when the per-minute quota is spent. It clears on its own,
 *  so a short wait and a retry beats surfacing an error the person can only
 *  respond to by clicking Save again — which is what they were already doing. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  let waitMs = 500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const status = (err as { code?: number; status?: number })?.code
        ?? (err as { code?: number; status?: number })?.status;
      if (status !== 429 || attempt >= 3) throw err;
      // Jitter, so several parallel calls hitting the same limit don't all wake
      // up and retry in the same instant.
      await new Promise((r) => setTimeout(r, waitMs + Math.floor(Math.random() * 300)));
      waitMs *= 2;
    }
  }
}

async function readSheet(sheetName: string): Promise<string[][]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: getSpreadsheetId(),
      range: sheetName,
    })
  );
  return (res.data.values || []) as string[][];
}

async function getSheetValues(sheetName: string): Promise<string[][]> {
  const hit = readCache.get(sheetName);
  if (hit && Date.now() - hit.at < readWindowMs()) return hit.rows;

  const rows = readSheet(sheetName);
  readCache.set(sheetName, { at: Date.now(), rows });
  // A failed read must not linger in the cache — otherwise one 429 would be
  // replayed to every caller for the rest of the window, including the callers
  // that would have succeeded.
  rows.catch(() => {
    const current = readCache.get(sheetName);
    if (current?.rows === rows) readCache.delete(sheetName);
  });
  return rows;
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

/**
 * Google Sheets multi-select dropdowns don't enforce a maximum, so a cell can
 * legitimately come back with more values than the taxonomy caps allow. The
 * extras are dropped for scoring and flagged, never written back — the sheet
 * keeps whatever was picked; the dashboard just says which ones it's using.
 */
function cap(areas: string[], targets: string[]) {
  const over: ('policy_areas' | 'target_pathways')[] = [];
  if (areas.length > MAX_POLICY_AREAS) over.push('policy_areas');
  if (targets.length > MAX_TARGET_PATHWAYS) over.push('target_pathways');
  return {
    policy_areas: areas.slice(0, MAX_POLICY_AREAS),
    target_pathways: targets.slice(0, MAX_TARGET_PATHWAYS),
    over_cap: over,
  };
}

/**
 * Writes use valueInputOption: 'USER_ENTERED' so that dates land as real dates
 * rather than text. The cost is that a cell beginning with = + - or @ is parsed
 * as a formula, which for a free-text note means "Sheets shows #NAME? instead of
 * what someone typed". A leading apostrophe is the sheet's own escape for
 * "treat this as text" and isn't displayed in the cell.
 */
function escapeFormula(text: string): string {
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function serializeTags(tags: string[] | undefined): string {
  return Array.isArray(tags) ? tags.filter(Boolean).join(', ') : '';
}

export async function fetchFellows(): Promise<Fellow[]> {
  // Tagging lives on the Career Pathways Engine tab, so it's joined in here.
  // That keeps `fellow.policy_areas` meaning "this person's tags" for every
  // existing caller — cards, modal, matching — with no changes at the call site.
  const [rows, pathways] = await Promise.all([
    getSheetValues('Fellows'),
    fetchPathwayRecords().catch(() => ({ records: {} as Record<string, PathwayRecord> })),
  ]);
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
    // From the Career Pathways Engine tab, or empty when that tab or the
    // person's row doesn't exist yet.
    policy_areas: pathways.records[r['ID'] || '']?.policy_areas || [],
    target_pathways: pathways.records[r['ID'] || '']?.target_pathways || [],
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

/**
 * Remove a logged status report. Keyed on fellow + month, the same pair
 * logStatusReport treats as unique, so there is never more than one row to
 * remove and no ambiguity about which.
 *
 * This exists because the sync files a submission under the month it arrived
 * in. A report handed in on 8/16 that was really July's lands as an on-time
 * August report, and re-logging can correct August but can't remove a month
 * that should never have been recorded at all.
 *
 * Returns false when there's nothing to remove, so the caller can say so
 * rather than reporting a success that didn't happen.
 */
export async function deleteStatusReport(fellowId: string, month: string): Promise<boolean> {
  const id = (fellowId || '').trim();
  const m = (month || '').trim();
  if (!id || !m) return false;

  const rows = await getSheetValues('Status Reports');
  // rows[0] = warning banner, rows[1] = headers, rows[2+] = data.
  // Column B (index 1) is Fellow ID, column D (index 3) is Month.
  let rowNum = 0;
  for (let i = 2; i < rows.length; i++) {
    if ((rows[i]?.[1] || '').trim() === id && (rows[i]?.[3] || '').trim() === m) {
      rowNum = i + 1;
      break;
    }
  }
  if (!rowNum) return false;

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tab = meta.data.sheets?.find((sh) => sh.properties?.title === 'Status Reports');
  const sheetId = tab?.properties?.sheetId;
  if (sheetId == null) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
  return true;
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
  const [rows, pathways] = await Promise.all([
    getSheetValues('Alumni'),
    fetchPathwayRecords().catch(() => ({ records: {} as Record<string, PathwayRecord> })),
  ]);
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
    policy_areas: pathways.records[r['ID'] || '']?.policy_areas || [],
    // Only ever the manual override. The real realized pathway is DERIVED from
    // career history at the point of use — see lib/pathway-derivation.ts — so
    // there is deliberately no stored column for it.
    realized_pathway: pathways.records[r['ID'] || '']?.pathway_override || '',
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

/**
 * Every write in this file goes through here, which makes it the one place to
 * guarantee two things: writes retry on a rate-limit response, and a successful
 * write drops the read cache so nothing downstream reads pre-write rows.
 */
async function getSheetsClient() {
  const auth = getAuth();
  const client = google.sheets({ version: 'v4', auth });

  // The googleapis methods are heavily overloaded, so they're narrowed to a
  // plain call signature to wrap them and cast back afterwards. The cast is
  // safe: the wrapper forwards every argument and returns what the call
  // returned — it only adds a retry and a cache drop around it.
  type WriteCall = (...args: unknown[]) => Promise<unknown>;
  const guard = (fn: WriteCall): WriteCall => async (...args: unknown[]) => {
    const result = await withRetry(() => fn(...args));
    invalidateReadCache();
    return result;
  };

  const values = client.spreadsheets.values;
  values.update = guard(values.update.bind(values) as WriteCall) as typeof values.update;
  values.append = guard(values.append.bind(values) as WriteCall) as typeof values.append;
  values.batchUpdate = guard(values.batchUpdate.bind(values) as WriteCall) as typeof values.batchUpdate;
  client.spreadsheets.batchUpdate = guard(
    client.spreadsheets.batchUpdate.bind(client.spreadsheets) as WriteCall
  ) as typeof client.spreadsheets.batchUpdate;

  return client;
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

/**
 * `keepId` exists for the fellow → alumni move. Everything about a person is
 * keyed to their ID: career history, pathway tagging, check-ins, status
 * reports. Minting a fresh ID on the move silently stranded all of it under an
 * ID whose Fellows row was then deleted, and the new alumni record started
 * blank. The move passes the fellow's own ID so the person keeps their history.
 */
export async function createAlumni(data: Partial<Alumni>, keepId?: string): Promise<boolean> {
  const id = keepId || newId();
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

// ── Alumni Career History ────────────────────────────────────────────────────

export const CAREER_HISTORY_SHEET = 'Alumni Career History';

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
 * Coerce whatever the sheet holds into "YYYY-MM", or "YYYY" for a role whose
 * exact month isn't known. Accepts "2024-09", "2024-09-01", "9/2024",
 * "Sep 2024", and a bare "2024". Anything else unparseable is passed through
 * untouched so a human can see and fix it rather than having it disappear.
 */
function normalizeMonth(value: string): string {
  if (!value) return '';
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}$/.test(v)) return v;
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
 *
 * A bare year ("2008", month unknown) is written with a leading apostrophe to
 * force Sheets to store it as literal text. Without that, USER_ENTERED would
 * treat "2008" as the number 2008, and the column's MM/yyyy DATE format would
 * reinterpret that number as a serial date, showing a nonsense date instead
 * of the year. The apostrophe isn't part of the stored value, so it reads
 * back as a plain "2008" and round-trips through normalizeMonth untouched.
 */
function toSheetMonth(value: string): string {
  const v = (value || '').trim();
  const m = v.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[2]}/${m[1]}`;
  if (/^\d{4}$/.test(v)) return `'${v}`;
  return v;
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

// ── Career Pathways Engine tab ───────────────────────────────────────────────
//
// One row per person, fellows and alumni together, holding the tagging that
// drives matching. This replaces the earlier design of hanging pathway columns
// off the Fellows and Alumni tabs.
//
// Note there is no "Realized Pathway" column: an alum's pathway is derived from
// their career history (see lib/pathway-derivation.ts) so it can't go stale.
// The only hand-kept pathway value is `Pathway Override`, and it should be
// blank for almost everyone.

/**
 * Tab name candidates, in priority order. The plural is what exists today; the
 * singular is kept as a fallback so a rename doesn't silently read as an empty
 * tab — which is how a wrong tab name fails, since a missing tab isn't an error.
 */
const PATHWAY_SHEET_NAMES = ['Career Pathways Engine', 'Career Pathway Engine'];

const PATHWAY_HEADER_ALIASES: Record<string, string[]> = {
  id:        ['ID', 'Id', 'Person ID'],
  name:      ['Name', 'Person'],
  type:      ['Record Type', 'Person Type', 'Fellow or Alumni', 'Status'],
  cohort:    ['Cohort'],
  areas:     ['Policy Issue Areas', 'Policy Interest Areas', 'Policy Areas'],
  targets:   ['Target Pathways', 'Target Pathway'],
  override:  ['Pathway Override', 'Realized Pathway Override', 'Override'],
  updated:   ['Last Updated', 'Updated', 'Last Updated Date'],
  notes:     ['Notes', 'Note'],
};

interface PathwaySheetShape {
  sheetName: string;
  rows: string[][];
  headers: string[];
  headerRow: number;
  cols: Record<string, number>;
}

/** Resolve which of the candidate tab names actually exists, and read it. */
async function readPathwaySheet(): Promise<PathwaySheetShape | null> {
  for (const sheetName of PATHWAY_SHEET_NAMES) {
    const rows = await getSheetValuesSafe(sheetName);
    if (rows === null) continue;

    // Row 1 is a "do not edit" banner and row 2 the headers, but detect rather
    // than assume — the tab was created by hand.
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 4); i++) {
      const cells = (rows[i] || []).map((c) => (c || '').trim().toLowerCase());
      if (PATHWAY_HEADER_ALIASES.id.some((a) => cells.includes(a.toLowerCase()))) { headerRow = i; break; }
    }
    if (headerRow === -1) continue;

    const headers = (rows[headerRow] || []).map((h) => (h || '').trim());
    const lower = headers.map((h) => h.toLowerCase());
    const cols: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(PATHWAY_HEADER_ALIASES)) {
      cols[field] = aliases.map((a) => lower.indexOf(a.toLowerCase())).find((i) => i >= 0) ?? -1;
    }
    return { sheetName, rows, headers, headerRow, cols };
  }
  return null;
}

/**
 * Coerce a Last Updated cell into YYYY-MM-DD. Accepts the MM/DD/YYYY the sheet
 * displays and the ISO form the API sometimes returns, so it doesn't matter
 * which the Sheets API hands back.
 */
function normalizeDate(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return v;
}

/**
 * Today's date as MM/DD/YYYY in America/New_York.
 *
 * Deliberately not UTC: the app runs on a UTC server, so a naive stamp would
 * date an 8pm edit to tomorrow and rows would appear dated in the future.
 */
function todayStampET(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export interface PathwayRecordsResult {
  available: boolean;                      // false = the tab doesn't exist yet
  records: Record<string, PathwayRecord>;  // keyed by ID, for joining
  missingColumns: string[];
  sheetName: string;
}

/**
 * Read the whole tab into a lookup by ID. Small enough to fetch wholesale —
 * one row per person, so hundreds of rows at most.
 */
export async function fetchPathwayRecords(): Promise<PathwayRecordsResult> {
  const shape = await readPathwaySheet();
  if (!shape) return { available: false, records: {}, missingColumns: [], sheetName: PATHWAY_SHEET_NAMES[0] };

  const missingColumns = Object.entries(shape.cols)
    .filter(([, i]) => i === -1)
    .map(([field]) => PATHWAY_HEADER_ALIASES[field][0]);

  const at = (row: string[], field: string) =>
    (shape.cols[field] >= 0 ? (row[shape.cols[field]] || '') : '').trim();

  const records: Record<string, PathwayRecord> = {};
  for (const row of shape.rows.slice(shape.headerRow + 1)) {
    const id = at(row, 'id');
    if (!id) continue;
    records[id] = {
      id,
      name: at(row, 'name'),
      record_type: at(row, 'type'),
      cohort: at(row, 'cohort'),
      ...cap(parseTags(at(row, 'areas')), parseTags(at(row, 'targets')).map(normalizePathway)),
      pathway_override: normalizePathway(at(row, 'override')),
      last_updated: normalizeDate(at(row, 'updated')),
      notes: at(row, 'notes'),
    };
  }
  return { available: true, records, missingColumns, sheetName: shape.sheetName };
}

/** Convenience for the single-person case — avoids a second round trip's worth of code. */
export async function fetchPathwayRecord(id: string): Promise<PathwayRecord | null> {
  const { records } = await fetchPathwayRecords();
  return records[id] || null;
}

type PathwayIdentity = Partial<Pick<PathwayRecord, 'name' | 'record_type' | 'cohort'>>;

export interface SavePathwayResult {
  ok: boolean;
  available: boolean;
  created: boolean;          // true when a new row was appended
  missingColumns: string[];
  last_updated: string;
}

/**
 * Write one person's tagging. Creates their row if they don't have one yet —
 * otherwise staff would have to hand-create a row per person before tagging,
 * which is exactly the busywork this tab is meant to remove.
 *
 * `Last Updated` is stamped on every write, so the column stays honest without
 * anyone remembering to touch it.
 */
export async function savePathwayRecord(
  id: string,
  data: Partial<Pick<PathwayRecord, 'policy_areas' | 'target_pathways' | 'pathway_override' | 'notes'>>,
  // Either the identity values, or a function that fetches them. The function
  // form is only invoked when a row actually has to be created, which keeps the
  // common case — updating a row that already exists — from reading the Fellows
  // and Alumni tabs for values it will never use.
  person?: PathwayIdentity | (() => Promise<PathwayIdentity | undefined>)
): Promise<SavePathwayResult> {
  const shape = await readPathwaySheet();
  if (!shape) {
    return { ok: false, available: false, created: false, missingColumns: [], last_updated: '' };
  }

  const stamp = todayStampET();
  const missingColumns: string[] = [];
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Only the fields actually supplied are written, so a partial save can't
  // blank a column the caller didn't mean to touch.
  const values: Record<string, string> = { updated: stamp };
  if (data.policy_areas) values.areas = serializeTags(data.policy_areas);
  // Renamed labels are migrated on the way out too, so a row rewrites itself to
  // the current spelling the first time it's saved — the same self-healing the
  // sector rename has. Without this, only the API route normalises and a direct
  // save would put a stale label back into the sheet.
  if (data.target_pathways) values.targets = serializeTags(data.target_pathways.map(normalizePathway));
  if (data.pathway_override !== undefined) values.override = normalizePathway(data.pathway_override || '');
  // Free text, stored verbatim apart from trimming. Newlines survive the round
  // trip — the Sheets API keeps them inside the cell.
  if (data.notes !== undefined) values.notes = escapeFormula((data.notes || '').trim());

  const idCol = shape.cols.id;
  let rowNum = 0;
  for (let i = shape.headerRow + 1; i < shape.rows.length; i++) {
    if ((shape.rows[i]?.[idCol] || '').trim() === id) { rowNum = i + 1; break; }
  }

  if (rowNum) {
    const data_: { range: string; values: string[][] }[] = [];
    for (const [field, value] of Object.entries(values)) {
      const col = shape.cols[field];
      if (col === -1) { missingColumns.push(PATHWAY_HEADER_ALIASES[field][0]); continue; }
      data_.push({ range: `${shape.sheetName}!${columnLetter(col)}${rowNum}`, values: [[value]] });
    }
    if (data_.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: data_ },
      });
    }
    return { ok: missingColumns.length === 0, available: true, created: false, missingColumns, last_updated: stamp };
  }

  const identity = typeof person === 'function' ? await person() : person;

  // No row yet — append one. Identity columns come from the caller, since the
  // Fellows/Alumni tabs are the source of truth for name, cohort and status.
  const width = Math.max(shape.headers.length, ...Object.values(shape.cols).map((i) => i + 1));
  const row = new Array<string>(width).fill('');
  const put = (field: string, value: string) => {
    const col = shape.cols[field];
    if (col === -1) { if (value) missingColumns.push(PATHWAY_HEADER_ALIASES[field][0]); return; }
    row[col] = value;
  };
  put('id', id);
  put('name', identity?.name || '');
  put('type', identity?.record_type || '');
  put('cohort', identity?.cohort || '');
  put('areas', values.areas || '');
  put('targets', values.targets || '');
  put('override', values.override || '');
  put('notes', values.notes || '');
  put('updated', stamp);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: shape.sheetName,
    valueInputOption: 'USER_ENTERED',
    // Deliberately NOT insertDataOption: 'INSERT_ROWS' — inserted rows inherit
    // no validation or formatting, which is what made career-history phases
    // land as plain text instead of dropdown selections.
    requestBody: { values: [row] },
  });

  return { ok: missingColumns.length === 0, available: true, created: true, missingColumns, last_updated: stamp };
}
