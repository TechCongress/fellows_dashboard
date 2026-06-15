import { Fellow, StatusReport, TCEvent, EventAttendance } from '@/types';

export const INACTIVE_STATUSES = ['Withdrew', 'Alumni'];

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

export function getRequiredReportMonths(fellow: Fellow): string[] {
  if (!fellow.requires_monthly_reports || !fellow.report_start_date) return [];
  const start = new Date(fellow.report_start_date);
  if (isNaN(start.getTime())) return [];
  let endMonthStr = fellow.report_end_month;
  if (!endMonthStr) {
    endMonthStr = (fellow.fellow_type || '').includes('Senior') ? 'Nov 2026' : 'Sep 2026';
  }
  const end = new Date(`${endMonthStr} 1`);
  if (isNaN(end.getTime())) return [];
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push(cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export interface StreakInfo {
  streak: number;
  giftCardEligible: boolean;
  atRisk: boolean;
  reimbursementsPaused: boolean;
}

export function calculateStreak(reports: StatusReport[], requiredMonths: string[]): StreakInfo {
  const submittedOnTime = new Set(reports.filter((r) => r.submitted && !r.late).map((r) => r.month));
  const submitted = new Set(reports.filter((r) => r.submitted).map((r) => r.month));
  const today = new Date();
  const pastMonths = requiredMonths.filter((m) => new Date(`${m} 1`) < today);
  let missed = 0;
  for (const m of pastMonths) { if (!submitted.has(m)) missed++; }
  let streak = 0;
  for (let i = pastMonths.length - 1; i >= 0; i--) {
    if (submittedOnTime.has(pastMonths[i])) streak++;
    else break;
  }
  return { streak, giftCardEligible: streak >= 3, atRisk: missed === 1, reimbursementsPaused: missed >= 2 };
}

// ── Events ───────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'Happy Hour', 'Site Visit', 'Social', 'Career Development',
  'Speaker Series', 'Check-ins', 'Conference', 'Recruitment',
];

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
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

export function getQuarterCompliance(
  fellows: { id: string; fellow_type: string }[],
  events: TCEvent[],
  attendance: EventAttendance[]
): Record<string, Record<string, 'met' | 'not_met'>> {
  const today = new Date();
  const attLookup: Record<string, Record<string, boolean>> = {};
  for (const rec of attendance) {
    if (!attLookup[rec.event_id]) attLookup[rec.event_id] = {};
    attLookup[rec.event_id][rec.fellow_id] = rec.attended;
  }
  const quarterEvents: Record<string, string[]> = {};
  for (const ev of events) {
    if (!ev.required) continue;
    const d = parseDate(ev.date);
    if (!d || d >= today) continue;
    const q = ev.quarter || dateToQuarter(ev.date);
    if (q) { if (!quarterEvents[q]) quarterEvents[q] = []; quarterEvents[q].push(ev.id); }
  }
  const result: Record<string, Record<string, 'met' | 'not_met'>> = {};
  for (const fellow of fellows) {
    if ((fellow.fellow_type || '').includes('AI Security')) continue;
    result[fellow.id] = {};
    for (const [quarter, eventIds] of Object.entries(quarterEvents)) {
      const attended = eventIds.some((eid) => attLookup[eid]?.[fellow.id] === true);
      result[fellow.id][quarter] = attended ? 'met' : 'not_met';
    }
  }
  return result;
}
