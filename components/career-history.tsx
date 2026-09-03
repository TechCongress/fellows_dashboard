'use client';

/**
 * Alumni career trajectory — vertical timeline plus the inline editing form.
 *
 * Ordering is always derived from Start Date. There is deliberately no
 * user-facing "Order" field: the API recomputes it on every write purely as a
 * same-month tie-breaker.
 */

import { useCallback, useEffect, useState } from 'react';
import { CareerHistoryEntry, CareerPhase } from '@/types';
import {
  CAREER_PHASES,
  CAREER_SECTORS,
  MONTH_NAMES,
  OrgTenure,
  dateRangeLabel,
  durationLabel,
  groupByOrganization,
  phaseStyle,
  sortHistory,
} from '@/lib/career-pathway';

type DraftEntry = Pick<CareerHistoryEntry, 'phase' | 'title' | 'org' | 'sector' | 'start' | 'end' | 'notes'>;

const BLANK_ROW: DraftEntry = {
  phase: 'Post-Fellowship',
  title: '',
  org: '',
  sector: 'Government',
  start: '',
  end: '',
  notes: '',
};

// ── Timeline (read view) ─────────────────────────────────────────────────────

function PhaseLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
      {CAREER_PHASES.map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${phaseStyle(p).dot}`} />
          {p}
        </span>
      ))}
    </div>
  );
}

function PhaseChip({ phase }: { phase: string }) {
  const s = phaseStyle(phase);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${s.chipBg} ${s.chipText}`}>
      {phase}
    </span>
  );
}

/** A tenure with a single role — rendered exactly as the timeline always has. */
function SingleRoleItem({ entry }: { entry: CareerHistoryEntry }) {
  const s = phaseStyle(entry.phase);
  return (
    <div className={`flex-1 min-w-0 rounded-lg border px-4 py-2.5 ${s.cardBg} ${s.cardBorder}`}>
      <p className="text-sm font-semibold text-gray-900">{entry.title || '—'}</p>
      {entry.org && <p className="text-sm text-gray-600 mt-0.5">{entry.org}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-1.5">
        <PhaseChip phase={entry.phase} />
        <span className="text-xs text-gray-500 tabular-nums">{dateRangeLabel(entry.start, entry.end)}</span>
        {entry.sector && <span className="text-xs text-gray-500">· {entry.sector}</span>}
      </div>
      {entry.notes && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{entry.notes}</p>}
    </div>
  );
}

/**
 * Several consecutive roles at one employer, drawn as one tenure. The heading
 * carries the organization, the full span and the sector (a property of the
 * organization, not the role); each role keeps its own dates and phase beneath.
 */
function TenureItem({ tenure }: { tenure: OrgTenure<CareerHistoryEntry> }) {
  // The spine already shows the latest phase, so the block styling follows it.
  const latest = tenure.roles[tenure.roles.length - 1];
  const s = phaseStyle(latest.phase);
  const span = durationLabel(tenure.start, tenure.end);
  return (
    <div className={`flex-1 min-w-0 rounded-lg border px-4 py-2.5 ${s.cardBg} ${s.cardBorder}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{tenure.org || '—'}</p>
        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
          {dateRangeLabel(tenure.start, tenure.end)}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">
        {[tenure.sector, span, `${tenure.roles.length} roles`].filter(Boolean).join(' · ')}
      </p>
      <ol className="mt-2 pt-0.5 border-t border-dashed border-gray-300">
        {tenure.roles.map((role, i) => (
          <li
            key={`${role.start}-${role.title}-${i}`}
            className={`flex gap-2.5 py-2 ${i > 0 ? 'border-t border-gray-200' : ''}`}
          >
            <span className={`mt-1.5 w-2 h-2 flex-shrink-0 rounded-full ${phaseStyle(role.phase).dot}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-800">{role.title || '—'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <PhaseChip phase={role.phase} />
                <span className="text-xs text-gray-500 tabular-nums">{dateRangeLabel(role.start, role.end)}</span>
                {durationLabel(role.start, role.end) && (
                  <span className="text-[11px] text-gray-400">{durationLabel(role.start, role.end)}</span>
                )}
              </div>
              {role.notes && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{role.notes}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CareerTimeline({ entries }: { entries: CareerHistoryEntry[] }) {
  // Consecutive roles at one employer collapse into a single tenure. Someone
  // who leaves and returns keeps two separate blocks — see groupByOrganization.
  const tenures = groupByOrganization(sortHistory(entries));
  return (
    <div className="relative pl-1">
      <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-gray-200" aria-hidden />
      <ol className="space-y-3">
        {tenures.map((tenure, i) => {
          // The spine takes the most recent role's phase: it answers "where are
          // they now", while the block below answers "how did they get there".
          const latest = tenure.roles[tenure.roles.length - 1];
          const s = phaseStyle(latest.phase);
          return (
            <li key={`${tenure.org}-${tenure.start}-${i}`} className="relative flex gap-4">
              <span
                className={`relative z-[1] mt-2 w-[15px] h-[15px] flex-shrink-0 rounded-full border-[3px] border-white ring-2 ring-gray-200 ${s.dot}`}
                aria-hidden
              />
              {tenure.roles.length === 1
                ? <SingleRoleItem entry={tenure.roles[0]} />
                : <TenureItem tenure={tenure} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

/**
 * Split a "YYYY-MM"/"YYYY" value into its year and month parts (month blank
 * if unknown). The year half accepts 1-4 digits, not just a complete 4-digit
 * year — this is a controlled input's live value while someone is mid-type,
 * not just the saved form, so it has to round-trip "2", "20", "202" too, or
 * every keystroke before the 4th digit gets discarded and typing a year
 * appears to do nothing.
 */
function splitYearMonth(value: string): { year: string; month: string } {
  const m = value.match(/^(\d{1,4})(?:-(\d{2}))?$/);
  return m ? { year: m[1], month: m[2] || '' } : { year: '', month: '' };
}

/**
 * Year + optional Month, for a role's Start or End date. Some fellows only
 * know the year a prior position began or ended, so the month is deliberately
 * optional — a bare year ("2020") is a complete, valid value, not a
 * placeholder for one. The Month select is disabled until a Year is entered,
 * since a month with no year isn't a meaningful date.
 */
function YearMonthField({
  value,
  onChange,
  disabled,
  fieldClass,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fieldClass: string;
}) {
  const { year, month } = splitYearMonth(value);
  const commit = (nextYear: string, nextMonth: string) => {
    if (!nextYear) { onChange(''); return; }
    onChange(nextMonth ? `${nextYear}-${nextMonth}` : nextYear);
  };
  return (
    <div className="flex gap-1.5">
      <input
        className={`${fieldClass} w-20`}
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        value={year}
        disabled={disabled}
        onChange={(e) => commit(e.target.value.replace(/\D/g, '').slice(0, 4), month)}
      />
      <select
        className={`${fieldClass} flex-1`}
        value={month}
        disabled={disabled || year.length !== 4}
        onChange={(e) => commit(year, e.target.value)}
      >
        {/* Before a year is entered, this is just an inert placeholder — the
            select is disabled anyway. Once a year is set, choosing this
            option is a deliberate "I don't know the month" for that entry,
            so the label changes to say that explicitly. */}
        <option value="">{year.length === 4 ? 'Month unknown' : 'Month'}</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
    </div>
  );
}

function EditorRow({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: DraftEntry;
  index: number;
  onChange: (i: number, patch: Partial<DraftEntry>) => void;
  onRemove: (i: number) => void;
}) {
  const isCurrent = entry.phase === 'Current';
  const fieldBase = 'px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-400';
  const field = `mt-1 w-full ${fieldBase}`;
  const label = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Title</label>
          <input className={field} value={entry.title} placeholder="e.g. Legislative Director"
            onChange={(e) => onChange(index, { title: e.target.value })} />
        </div>
        <div>
          <label className={label}>Organization</label>
          <input className={field} value={entry.org} placeholder="e.g. Sen. Gary Peters (D-MI)"
            onChange={(e) => onChange(index, { org: e.target.value })} />
        </div>
        <div>
          <label className={label}>Sector</label>
          <select className={field} value={entry.sector} onChange={(e) => onChange(index, { sector: e.target.value })}>
            {CAREER_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Phase</label>
          <select className={field} value={entry.phase}
            onChange={(e) => {
              const phase = e.target.value as CareerPhase;
              // "Current" means ongoing, so the end date clears with it.
              onChange(index, phase === 'Current' ? { phase, end: '' } : { phase });
            }}>
            {CAREER_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Start</label>
          <div className="mt-1">
            <YearMonthField fieldClass={fieldBase} value={entry.start}
              onChange={(start) => onChange(index, { start })} />
          </div>
        </div>
        <div>
          <label className={label}>End</label>
          <div className="mt-1">
            <YearMonthField fieldClass={fieldBase} value={entry.end} disabled={isCurrent}
              onChange={(end) => onChange(index, { end })} />
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
        <input type="checkbox" className="rounded" checked={isCurrent}
          onChange={(e) => onChange(index, e.target.checked
            ? { phase: 'Current', end: '' }
            : { phase: 'Post-Fellowship' })} />
        This is their current role (sets Phase to &ldquo;Current&rdquo; and clears the end date)
      </label>
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className="text-[11px] text-gray-400">Position in the timeline is set automatically by Start date.</span>
        <button type="button" onClick={() => onRemove(index)}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors">
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Section (fetch + view/edit toggle) ───────────────────────────────────────

export function CareerHistorySection({ personId, personName }: { personId: string; personName: string }) {
  const [entries, setEntries] = useState<CareerHistoryEntry[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/career-history?personId=${encodeURIComponent(personId)}`);
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setAvailable(data.available !== false);
    } catch {
      setError('Could not load career history.');
    }
    setLoading(false);
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setToast('');
    setError('');
    setDraft(sortHistory(entries).map(({ phase, title, org, sector, start, end, notes }) => ({
      phase, title, org, sector: sector || 'Government', start, end, notes,
    })));
    setEditing(true);
  }

  function patchRow(i: number, patch: Partial<DraftEntry>) {
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/career-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, personName, entries: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setEditing(false);
      setToast('Saved — roles re-sorted by start date.');
    } catch {
      setError('Network error. Please try again.');
    }
    setSaving(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Career Trajectory</h3>
        {!editing && available && (
          <button onClick={startEdit}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            ✎ Edit Career History
          </button>
        )}
      </div>

      {toast && !editing && (
        <p className="mb-3 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {toast}</p>
      )}
      {error && (
        <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {!available && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          No <strong>Alumni Career History</strong> tab found in the spreadsheet. Add a tab with that exact name and the
          columns <em>ID, Name, Order, Phase, Organization, Title, Sector, Start Date, End Date, Notes</em> to turn this on.
        </p>
      )}

      {available && loading && <p className="text-sm text-gray-400">Loading career history…</p>}

      {available && !loading && !editing && (
        entries.length > 0 ? (
          <>
            <PhaseLegend />
            <CareerTimeline entries={entries} />
          </>
        ) : (
          <p className="text-sm text-gray-400">
            No career history recorded yet. Use <span className="text-gray-600">Edit Career History</span> to add roles.
          </p>
        )
      )}

      {available && editing && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
            Saving writes these rows to the <strong>Alumni Career History</strong> tab. There is no Order field to fill in —
            the timeline re-sorts itself by each role&rsquo;s Start date on save.
          </p>
          {/* No "only one Current role" warning: fellows and alumni genuinely
              hold concurrent positions, so several Current rows is valid data,
              not a mistake to flag. */}
          {draft.map((entry, i) => (
            <EditorRow key={i} entry={entry} index={i} onChange={patchRow}
              onRemove={(idx) => setDraft((rows) => rows.filter((_, x) => x !== idx))} />
          ))}
          <button type="button" onClick={() => setDraft((rows) => [...rows, { ...BLANK_ROW }])}
            className="w-full py-2.5 rounded-xl border-[1.5px] border-dashed border-gray-300 text-sm font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
            + Add role
          </button>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button type="button" onClick={() => { setEditing(false); setError(''); }}
              className="px-3.5 py-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving}
              className="px-3.5 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
