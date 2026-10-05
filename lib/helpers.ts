import { Fellow, StatusReport, TCEvent, EventAttendance } from '@/types';

export const INACTIVE_STATUSES = [
  'Withdrew',
  'Alumni',
  'Offboarded',
  'Verbal Acceptance/Sent Contract',
  'Signed Contract/Pre-Orientation',
];

export function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 9999;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function parseCohortDate(cohortStr: string): Date {
  if (!cohortStr) return new Date(0);
  for (const fmt of [/^(\w+)\s+(\d{4})$/, /^(\d{4})$/]) {
    const m = cohortStr.trim().match(fmt);
    if (m) {
      const d = m[2] ? new Date(`${m[1]} 1, ${m[2]}`) : new Date(`Jan 1, ${m[1]}`);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date(0);
}

export function isAISF(fellow: Fellow): boolean {
  return (fellow.fellow_type || '').includes('AI Security');
}

// ── Monthly report schedule ─────────────────────────────────────────────────
//
// A fellow owes a monthly status report for each month from their Report
// Start Date through their Report End Month. Their final month is covered by
// their Accomplishments document instead, which is tracked by the offboarding
// task "Submitted Accomplishments document" (ticked = submitted; it has no
// late state).

/**
 * Whether the Accomplishments document counts toward the on-time streak and
 * gift cards. Not decided yet; off keeps every fellow's streak exactly as it
 * was before the document was added to the schedule.
 */
export const ACCOMPLISHMENTS_DOC_COUNTS_TOWARD_STREAK = false;

export const ACCOMPLISHMENTS_TASK_LABEL = 'Submitted Accomplishments document';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthLabel = (i: number) => `${SHORT_MONTHS[i % 12]} ${Math.floor(i / 12)}`;

/**
 * A month as typed in the sheet, as a month index (year * 12 + month), or null.
 * Accepts "Sep 2026", "September 2026", any capitalization, and the forms a
 * cell takes once Sheets has turned it into a real date: "9/1/2026",
 * "2026-09-01", "2026-09".
 */
function parseMonthValue(value: string | undefined): number | null {
  const v = (value || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return Number(m[1]) * 12 + Number(m[2]) - 1;
  m = v.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (m) return Number(m[2]) * 12 + Number(m[1]) - 1;
  m = v.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const i = SHORT_MONTHS.findIndex((n) => m![1].toLowerCase().startsWith(n.toLowerCase()));
    return i === -1 ? null : Number(m[2]) * 12 + i;
  }
  return null;
}

export interface ReportSchedule {
  /** Months that need a monthly status report, e.g. "Mar 2027". */
  reportMonths: string[];
  /** The month covered by the Accomplishments document, or null when the End Date isn't set. */
  docMonth: string | null;
  /** Where the last report month came from: the Report End Month, the End Date, or nowhere. */
  endSource: 'report_end_month' | 'end_date' | 'none';
}

type ScheduleInput = Pick<Fellow, 'requires_monthly_reports' | 'report_start_date' | 'report_end_month' | 'end_date'>;

/**
 * - Reports run from the Report Start Month through the Report End
 *   Month. A filled-in Report End Month always wins, even past the End Date,
 *   so exceptions can be set by hand. When it's blank, reports run through
 *   the month before the End Date.
 * - The month the fellowship ends (the End Date's month) is covered by the
 *   Accomplishments document, but only when it comes after the last report
 *   month. A custom end month that runs past the End Date has no document row.
 */
export function getReportSchedule(fellow: Partial<ScheduleInput>): ReportSchedule {
  const none: ReportSchedule = { reportMonths: [], docMonth: null, endSource: 'none' };
  if (!fellow.requires_monthly_reports || !fellow.report_start_date) return none;
  // "March 2026", "Mar 2026", or an older full date like "03/01/2026"; only the month matters.
  const first = parseMonthValue(fellow.report_start_date);
  if (first === null) return none;

  const endDate = fellow.end_date ? parseDate(fellow.end_date) : null;
  const docIdx = endDate ? monthIndex(endDate) : null;

  let last: number | null = null;
  let endSource: ReportSchedule['endSource'] = 'none';
  const explicit = parseMonthValue(fellow.report_end_month);
  if (explicit !== null) { last = explicit; endSource = 'report_end_month'; }
  else if (docIdx !== null) { last = docIdx - 1; endSource = 'end_date'; }

  const reportMonths: string[] = [];
  if (last !== null) for (let i = first; i <= last; i++) reportMonths.push(monthLabel(i));
  const lastReport = last !== null && last >= first ? last : first - 1;
  const docMonth = docIdx !== null && docIdx > lastReport && docIdx >= first ? monthLabel(docIdx) : null;
  return { reportMonths, docMonth, endSource };
}

/** The months that need a monthly status report. See getReportSchedule. */
export function getRequiredReportMonths(fellow: Partial<ScheduleInput>): string[] {
  return getReportSchedule(fellow).reportMonths;
}

/** Whether the offboarding task for the Accomplishments document is ticked. */
export function accomplishmentsDocSubmitted(offboardingCompleted: string | undefined): boolean {
  const i = OFFBOARDING_TASKS.findIndex((t) => t.label === ACCOMPLISHMENTS_TASK_LABEL);
  if (i === -1) return false;
  return (offboardingCompleted || '').split(',').map((x) => x.trim()).includes(String(i));
}

/**
 * The fellow's streak and gift cards. With ACCOMPLISHMENTS_DOC_COUNTS_TOWARD_STREAK
 * on, the document month counts as an on-time report once its task is ticked.
 */
export function reportStreak(fellow: Partial<ScheduleInput> & { offboarding_completed?: string }, reports: StatusReport[]): StreakInfo {
  const { reportMonths, docMonth } = getReportSchedule(fellow);
  if (!ACCOMPLISHMENTS_DOC_COUNTS_TOWARD_STREAK || !docMonth) return calculateStreak(reports, reportMonths);
  const docReport: StatusReport = {
    id: 'accomplishments-doc', fellow_id: '', fellow_name: '', month: docMonth,
    submitted: accomplishmentsDocSubmitted(fellow.offboarding_completed), date_submitted: '', notes: '', late: false,
  };
  return calculateStreak([...reports, docReport], [...reportMonths, docMonth]);
}

export interface StreakInfo {
  streak: number;
  giftCards: number;      // total gift cards earned (1 per 3 consecutive on-time submissions)
  giftCardEligible: boolean;
  atRisk: boolean;
  reimbursementsPaused: boolean;
}

export function calculateStreak(reports: StatusReport[], requiredMonths: string[]): StreakInfo {
  const submittedOnTime = new Set(reports.filter((r) => r.submitted && !r.late).map((r) => r.month));
  const submitted = new Set(reports.filter((r) => r.submitted).map((r) => r.month));
  const today = new Date();
  // Only count a month as past once it's fully over (i.e. we're in a later month)
  const pastMonths = requiredMonths.filter((m) => {
    const d = new Date(`${m} 1`);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return nextMonth <= today;
  });
  let missed = 0;
  for (const m of pastMonths) { if (!submitted.has(m)) missed++; }
  let streak = 0;
  for (let i = pastMonths.length - 1; i >= 0; i--) {
    if (submittedOnTime.has(pastMonths[i])) streak++;
    else break;
  }
  const giftCards = Math.floor(streak / 3);
  return { streak, giftCards, giftCardEligible: streak >= 3, atRisk: missed === 1, reimbursementsPaused: missed >= 2 };
}

// ── Events ───────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'Happy Hour', 'Site Visit', 'Social', 'Career Development',
  'Speaker Series', 'Check-ins', 'Conference', 'Recruitment',
];

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // new Date('2026-09-10') is midnight UTC, which is the evening of Sep 9 in US
  // time zones, so a bare YYYY-MM-DD is built as a local date instead.
  const iso = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const formats = [
    (s: string) => new Date(s),
    (s: string) => { const [m, d, y] = s.split('/'); return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`); },
  ];
  for (const fn of formats) {
    try { const d = fn(dateStr); if (!isNaN(d.getTime())) return d; } catch { /* skip */ }
  }
  return null;
}

export function isPast(dateStr: string): boolean {
  const d = parseDate(dateStr);
  return d !== null && d < new Date(new Date().toDateString());
}

export function isUpcoming(dateStr: string): boolean {
  const d = parseDate(dateStr);
  return d !== null && d >= new Date(new Date().toDateString());
}

export function fmtDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateLong(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

export function eventStatus(dateStr: string): 'Past' | 'Today' | 'Upcoming' {
  const d = parseDate(dateStr);
  if (!d) return 'Upcoming';
  const today = new Date(new Date().toDateString());
  if (d.getTime() === today.getTime()) return 'Today';
  return d < today ? 'Past' : 'Upcoming';
}

export function dateToQuarter(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '';
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

export function isTrackedCohort(cohortStr: string): boolean {
  if (!cohortStr) return false;
  const cutoff = new Date(2026, 0, 1);
  const m = cohortStr.match(/([A-Za-z]+ \d{4})/);
  if (m) {
    const d = new Date(`${m[1]} 1`);
    if (!isNaN(d.getTime())) return d >= cutoff;
  }
  const y = cohortStr.match(/\b(\d{4})\b/);
  if (y) return parseInt(y[1]) >= 2026;
  return false;
}

/**
 * Whether an event is for a fellow's cohort. A blank event cohort means every
 * cohort. "Jan 2026" and "January 2026" are the same cohort (events use both);
 * a year-only cohort ("2019") matches by year.
 */
export function cohortMatches(eventCohort: string | undefined, fellowCohort: string | undefined): boolean {
  const ev = (eventCohort || '').trim(), fe = (fellowCohort || '').trim();
  if (!ev) return true;
  const a = parseMonthValue(ev), b = parseMonthValue(fe);
  if (a !== null && b !== null) return a === b;
  const ya = ev.match(/\b(\d{4})\b/)?.[1], yb = fe.match(/\b(\d{4})\b/)?.[1];
  if (ya && yb) return ya === yb;
  return ev.toLowerCase() === fe.toLowerCase();
}

/** "Q3 2026" sorts by year, then quarter. As plain text, "Q1 2027" would sort before "Q2 2026". */
export function compareQuarters(a: string, b: string): number {
  const key = (q: string) => { const m = q.match(/Q([1-4])\s+(\d{4})/); return m ? Number(m[2]) * 4 + Number(m[1]) : Number.MAX_SAFE_INTEGER; };
  return key(a) - key(b) || a.localeCompare(b);
}

/**
 * Quarterly compliance: met when a fellow attended at least one required event
 * in the quarter. Each fellow is only measured against required events that
 * have already happened, are for their cohort, and fall within their own
 * Start Date to End Date, so a new cohort isn't marked "not met" for quarters
 * before it started, and a finished cohort isn't measured on later ones.
 */
export function getQuarterCompliance(
  fellows: { id: string; fellow_type: string; cohort: string; start_date: string; end_date: string }[],
  events: TCEvent[],
  attendance: EventAttendance[]
): Record<string, Record<string, 'met' | 'not_met'>> {
  const today = new Date();
  const attLookup: Record<string, Record<string, boolean>> = {};
  for (const rec of attendance) {
    if (!attLookup[rec.event_id]) attLookup[rec.event_id] = {};
    attLookup[rec.event_id][rec.fellow_id] = rec.attended;
  }
  const required = events
    .filter((ev) => ev.required)
    .map((ev) => ({ ev, d: parseDate(ev.date), q: ev.quarter || dateToQuarter(ev.date) }))
    .filter((x): x is { ev: TCEvent; d: Date; q: string } => !!x.d && x.d < today && !!x.q);

  const result: Record<string, Record<string, 'met' | 'not_met'>> = {};
  for (const fellow of fellows) {
    if ((fellow.fellow_type || '').includes('AI Security')) continue;
    const start = fellow.start_date ? parseDate(fellow.start_date) : null;
    const end = fellow.end_date ? parseDate(fellow.end_date) : null;
    const quarterEvents: Record<string, string[]> = {};
    for (const { ev, d, q } of required) {
      if (!cohortMatches(ev.cohort, fellow.cohort)) continue;
      if (start && d < start) continue;
      if (end && d > end) continue;
      (quarterEvents[q] ||= []).push(ev.id);
    }
    result[fellow.id] = {};
    for (const [quarter, eventIds] of Object.entries(quarterEvents)) {
      const attended = eventIds.some((eid) => attLookup[eid]?.[fellow.id] === true);
      result[fellow.id][quarter] = attended ? 'met' : 'not_met';
    }
  }
  return result;
}

/** Allowed values for Check-in Type — must match the Check-ins tab's dropdown. */
export const CHECKIN_TYPES = ['Email', 'Phone', 'Zoom', 'In-person', 'Slack', 'Text'];

/** Today as YYYY-MM-DD in America/New_York, so a late-evening entry isn't dated tomorrow. */
export function todayISOET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Allowed values for Engagement Type on the Alumni Engagement Log tab — must
 * match that tab's dropdown. `group` drives the Events / Conversations /
 * Contributions filters on an alum's Engagement tab.
 */
export const ENGAGEMENT_TYPES: { name: string; group: 'Events' | 'Conversations' | 'Contributions' }[] = [
  { name: 'Attended event', group: 'Events' },
  { name: 'Co-hosted or sponsored event', group: 'Events' },
  { name: 'Coffee or 1:1', group: 'Conversations' },
  { name: 'Email or call', group: 'Conversations' },
  { name: 'Speaker or panelist', group: 'Contributions' },
  { name: 'Alumni Advisor', group: 'Contributions' },
  { name: 'Application reviewer', group: 'Contributions' },
  { name: 'Referred an applicant', group: 'Contributions' },
];

/** How recently an alum was engaged, as a label. `days` = days since the newest engagement. */
export function engagementStatus(days: number | null): 'Active' | 'Warm' | 'Going quiet' | 'Lapsed' | 'No engagement yet' {
  if (days === null) return 'No engagement yet';
  if (days <= 90) return 'Active';
  if (days <= 180) return 'Warm';
  if (days <= 365) return 'Going quiet';
  return 'Lapsed';
}

/**
 * A date from the sheet as a sortable YYYY-MM-DD string ('' when blank or
 * unreadable). Cells come back as M/D/YYYY, YYYY-MM-DD, or text like
 * "Jan 15, 2026", depending on how they were entered; comparing those as raw
 * strings puts 10/2 before 9/1. String-based, so no time-zone shifts.
 */
export function dateSortKey(value: string): string {
  const v = (value || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The offboarding checklist. Moving a fellow to Alumni requires every task to be ticked. */
export const OFFBOARDING_TASKS: { label: string }[] = [
  { label: 'Submitted Accomplishments document' },
  { label: 'Completed exit interview' },
  { label: 'Confirm final paycheck' },
  { label: 'Offboard in Rippling' },
  { label: 'Remove from #current-fellows-plus-tc Slack channel' },
];

/** True when a fellow's saved offboarding string ("0,1,2,3,4") covers every task. */
export function offboardingComplete(completed: string | undefined): boolean {
  const done = new Set((completed || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number));
  return OFFBOARDING_TASKS.every((_, i) => done.has(i));
}
