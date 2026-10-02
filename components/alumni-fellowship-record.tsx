'use client';

/**
 * An alum's Fellowship Record tab: a read-only view of what the dashboard
 * logged while they were a fellow — check-ins, monthly status reports and
 * event attendance. Those rows stay in their own tabs after Move to Alumni
 * (same ID), so this only reads them. New contact goes in the Engagement tab.
 */

import { useEffect, useState } from 'react';
import { Alumni, Checkin, StatusReport } from '@/types';
import { calculateStreak, dateSortKey, fmtDate, parseDate } from '@/lib/helpers';

interface EventRow { event_id: string; name: string; date: string; required: boolean; attended: boolean }
interface FellowshipRecord { checkins: Checkin[]; reports: StatusReport[]; events: EventRow[] }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026" → [2026, 8], or null. */
function parseReportMonth(label: string): [number, number] | null {
  const m = (label || '').trim().match(/^([A-Za-z]{3})\w*\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1].toLowerCase());
  return idx === -1 ? null : [Number(m[2]), idx];
}

/**
 * Every month from the first logged report to the last, in order. The report
 * schedule itself (start month, end month) lived on the Fellows row, which is
 * deleted on the move, so months outside the logged range aren't guessed at;
 * a gap inside it is shown as "not submitted".
 */
function reportMonths(reports: StatusReport[]): string[] {
  const parsed = reports.map((r) => parseReportMonth(r.month)).filter((p): p is [number, number] => !!p);
  if (parsed.length === 0) return [];
  const key = ([y, m]: [number, number]) => y * 12 + m;
  const first = Math.min(...parsed.map(key));
  const last = Math.max(...parsed.map(key));
  const out: string[] = [];
  for (let k = first; k <= last; k++) out.push(`${MONTH_NAMES[k % 12]} ${Math.floor(k / 12)}`);
  return out;
}

function monthsBetween(a: string, b: string): number | null {
  const s = parseDate(a), e = parseDate(b);
  if (!s || !e) return null;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000 / 30.44));
}

export function AlumniFellowshipRecordTab({ alumni }: { alumni: Alumni }) {
  const [record, setRecord] = useState<FellowshipRecord | null>(null);
  const [error, setError] = useState('');
  const [showAllCheckins, setShowAllCheckins] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError('');
    fetch(`/api/alumni/${encodeURIComponent(alumni.id)}/fellowship-record`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setRecord({ checkins: d.checkins || [], reports: d.reports || [], events: d.events || [] }); })
      .catch(() => { if (!cancelled) setError('Couldn’t load the fellowship record. Close and reopen this alum to try again.'); });
    return () => { cancelled = true; };
  }, [alumni.id]);

  const first = alumni.name.split(' ')[0] || alumni.name;
  const hasDates = !!alumni.fellowship_start;

  const sectionHead = (title: string, hint?: string) => (
    <div className="flex items-baseline justify-between gap-3 mb-2.5 flex-wrap">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
  const empty = (text: string) => <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-3">{text}</p>;

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!record) return <p className="text-sm text-gray-400">Loading fellowship record…</p>;

  const checkins = [...record.checkins].sort((a, b) => dateSortKey(b.date).localeCompare(dateSortKey(a.date)));
  // Month labels normalized to "Sep 2026", so a cell typed "September 2026"
  // still lines up with the grid and the streak count.
  const reports = record.reports.map((r) => {
    const p = parseReportMonth(r.month);
    return p ? { ...r, month: `${MONTH_NAMES[p[1]]} ${p[0]}` } : r;
  });
  const months = reportMonths(reports);
  const byMonth = new Map(reports.map((r) => [r.month, r]));
  const states = months.map((m) => {
    const r = byMonth.get(m);
    return { month: m, state: !r || !r.submitted ? 'miss' : r.late ? 'late' : 'on' } as const;
  });
  const onTime = states.filter((s) => s.state === 'on').length;
  const late = states.filter((s) => s.state === 'late').length;
  const missed = states.filter((s) => s.state === 'miss').length;
  const streak = calculateStreak(reports, months);
  const events = [...record.events].sort((a, b) => dateSortKey(a.date).localeCompare(dateSortKey(b.date)));
  const required = events.filter((e) => e.required);
  const requiredAttended = required.filter((e) => e.attended).length;
  const length = hasDates ? monthsBetween(alumni.fellowship_start, alumni.fellowship_end) : null;

  const stat = (k: string, v: string, d?: string, small = false) => (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
      <p className="text-[11px] text-gray-500">{k}</p>
      <p className={`${small ? 'text-sm leading-snug' : 'text-lg'} font-semibold text-gray-900 tabular-nums mt-0.5`}>{v}</p>
      {d && <p className="text-xs text-gray-500">{d}</p>}
    </div>
  );

  const shownCheckins = showAllCheckins ? checkins : checkins.slice(0, 3);

  return (
    <div className="space-y-6">
      <p className="flex gap-2.5 items-start text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z" clipRule="evenodd" /></svg>
        <span>A read-only record of {first}&rsquo;s fellowship, kept exactly as it was logged. To record new contact, use the Engagement tab.</span>
      </p>

      <section>
        {sectionHead('At a glance')}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {stat('Fellowship',
            hasDates ? `${fmtDate(alumni.fellowship_start)} – ${alumni.fellowship_end ? fmtDate(alumni.fellowship_end) : '?'}` : 'Dates not recorded',
            hasDates ? [length ? `${length} months` : '', alumni.office_served].filter(Boolean).join(' · ') : `Saved for 2026 fellows onward${alumni.office_served ? ` · ${alumni.office_served}` : ''}`,
            true)}
          {stat('Check-ins', String(checkins.length), checkins.length ? `last ${fmtDate(checkins[0].date)}` : 'none on record')}
          {stat('Reports on time', months.length ? `${onTime} of ${months.length}` : '—', months.length ? `${streak.giftCards} gift card${streak.giftCards === 1 ? '' : 's'}` : 'none on record')}
          {stat('Required events', required.length ? `${requiredAttended} of ${required.length}` : '—', required.length ? 'attended' : 'none on record')}
        </div>
      </section>

      <section>
        {sectionHead('Monthly status reports', months.length ? `${months[0]} – ${months[months.length - 1]}` : undefined)}
        {months.length === 0 ? empty('No monthly reports on record.') : (
          <>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
              {states.map(({ month, state }) => {
                const [mon, year] = month.split(' ');
                const label = { on: 'on time', late: 'late', miss: 'not submitted' }[state];
                const cls = state === 'on' ? 'bg-green-100 text-green-800'
                  : state === 'late' ? 'bg-amber-100 text-amber-800'
                  : 'bg-white text-red-700 border border-dashed border-red-300';
                return (
                  <div key={month} title={`${month}: ${label}`} aria-label={`${month}: ${label}`}
                    className={`rounded-md px-0.5 pt-1.5 pb-1 text-center text-[11px] font-semibold ${cls}`}>
                    {mon}<span className="block text-[10px] font-normal opacity-75">{year?.slice(2)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 flex-wrap mt-2 text-xs text-gray-500">
              <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-500 mr-1.5 align-[-1px]" />On time</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-500 mr-1.5 align-[-1px]" />Late</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed border-red-300 mr-1.5 align-[-1px]" />Not submitted</span>
            </div>
            <div className="flex gap-4 flex-wrap mt-3 text-sm text-gray-700">
              <span><b className="tabular-nums">{onTime}</b> on time</span>
              <span><b className="tabular-nums">{late}</b> late</span>
              <span><b className="tabular-nums">{missed}</b> not submitted</span>
              <span>Final streak <b className="tabular-nums">{streak.streak}</b></span>
              <span>Gift cards <b className="tabular-nums">{streak.giftCards}</b></span>
            </div>
          </>
        )}
      </section>

      <section>
        {sectionHead('Check-ins', checkins.length ? 'newest first' : undefined)}
        {checkins.length === 0 ? empty('No check-ins on record.') : (
          <div className="space-y-2">
            {shownCheckins.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-4 py-3 border-l-4 border-blue-400">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800">{fmtDate(c.date)} · {c.check_in_type}</span>
                  <span className="text-xs text-gray-400">{c.staff_member}</span>
                </div>
                {c.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.notes}</p>}
              </div>
            ))}
            {checkins.length > 3 && (
              <button onClick={() => setShowAllCheckins((v) => !v)} className="text-xs font-semibold text-gray-600 hover:text-gray-900">
                {showAllCheckins ? 'Show fewer' : `Show all ${checkins.length} check-ins`}
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        {sectionHead('Events during the fellowship', required.length ? `${requiredAttended} of ${required.length} required attended` : undefined)}
        {events.length === 0 ? empty('No event attendance on record.') : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-500 whitespace-nowrap tabular-nums w-px">{e.date ? fmtDate(e.date) : '—'}</td>
                    <td className="py-2 pr-3 text-gray-800">{e.name}{!e.required && <span className="ml-1.5 text-[11px] text-gray-500">optional</span>}</td>
                    <td className="py-2 text-right w-px">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${e.attended ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                        {e.attended ? 'Attended' : 'Missed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
