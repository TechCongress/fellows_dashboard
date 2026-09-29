'use client';

/**
 * An alum's Engagement tab: how recently staff have engaged with them, a log
 * of touchpoints from the Alumni Engagement Log tab, and a form to log a new
 * one. Logging moves the alum's Last Engaged date forward (see
 * addAlumniEngagement), so nobody has to type it by hand.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alumni, AlumniEngagement } from '@/types';
import { ENGAGEMENT_TYPES, engagementStatus, todayISOET } from '@/lib/helpers';

const GROUP_OF = Object.fromEntries(ENGAGEMENT_TYPES.map((t) => [t.name, t.group]));
const FILTERS = ['All', 'Events', 'Conversations', 'Contributions'] as const;
const GROUP_BORDER: Record<string, string> = {
  Events: 'border-blue-400', Conversations: 'border-violet-400', Contributions: 'border-emerald-400',
};
const STATUS_STYLE: Record<string, string> = {
  'Active': 'bg-green-100 text-green-800',
  'Warm': 'bg-teal-100 text-teal-800',
  'Going quiet': 'bg-amber-100 text-amber-800',
  'Lapsed': 'bg-red-100 text-red-700',
  'No engagement yet': 'bg-gray-100 text-gray-600',
};

/** M/D/YYYY or YYYY-MM-DD → YYYY-MM-DD. Kept as a string so dates never shift a day across time zones. */
function toISO(value: string): string {
  const v = (value || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
const daysBetween = (fromISO: string, toISODate: string) =>
  Math.round((Date.parse(toISODate + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
const fmt = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function ago(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30.4)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

// The last name typed is remembered in this browser so staff don't retype it
// every time. Best effort: private windows or blocked storage just start blank.
const STAFF_KEY = 'alumni-engagement-staff-member';
function rememberedStaff(): string {
  try { return localStorage.getItem(STAFF_KEY) || ''; } catch { return ''; }
}
function rememberStaff(name: string) {
  try { localStorage.setItem(STAFF_KEY, name); } catch { /* storage unavailable */ }
}

const blankForm = () => ({ date: todayISOET(), engagement_type: 'Attended event', staff_member: rememberedStaff(), notes: '' });

export function AlumniEngagementTab({ alumni, onAlumniUpdate }: { alumni: Alumni; onAlumniUpdate?: (updated: Alumni) => void }) {
  const [entries, setEntries] = useState<AlumniEngagement[]>([]);
  const [available, setAvailable] = useState(true);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/alumni-engagement?alumniId=${encodeURIComponent(alumni.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setAvailable(data.available !== false);
      setMissingColumns(Array.isArray(data.missingColumns) ? data.missingColumns : []);
    } catch {
      setLoadError('Could not load the engagement log.');
    }
    setLoading(false);
  }, [alumni.id]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const today = todayISOET();
  // Last Engaged on the Alumni tab can predate the log (it used to be typed
  // by hand), so the newest of the two counts.
  const lastEngaged = [toISO(alumni.last_engaged), sorted[0]?.date || ''].filter(Boolean).sort().pop() || '';
  const days = lastEngaged ? daysBetween(lastEngaged, today) : null;
  const status = engagementStatus(days);
  const yearAgo = new Date(Date.parse(today + 'T00:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const last12 = sorted.filter((e) => e.date >= yearAgo).length;
  const events = sorted.filter((e) => e.engagement_type === 'Attended event').length;
  const shown = filter === 'All' ? sorted : sorted.filter((e) => GROUP_OF[e.engagement_type] === filter);

  function openForm() {
    setForm(blankForm());
    setError('');
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/alumni-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumni_id: alumni.id, ...form }),
      });
      rememberStaff(form.staff_member.trim());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.engagement) {
        setError(data.error || 'Could not save the engagement. Please try again.');
        return;
      }
      setEntries((es) => [data.engagement, ...es]);
      setJustAdded(data.engagement.id);
      setFilter('All');
      // The server only moves Last Engaged forward; mirror that so the list,
      // sort and card update without a reload.
      if (data.lastEngagedUpdated && onAlumniUpdate) onAlumniUpdate({ ...alumni, last_engaged: data.engagement.date });
      setShowForm(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900';

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">At a glance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-gray-500">Status</p>
            <span className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[status]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />{status}
            </span>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-gray-500">Last engaged</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{lastEngaged ? fmt(lastEngaged) : '—'}</p>
            <p className="text-xs text-gray-500">{days !== null ? ago(days) : 'Nothing logged'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-gray-500">Touchpoints, last 12 months</p>
            <p className="text-lg font-semibold text-gray-900 tabular-nums">{loading ? '…' : last12}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-gray-500">Events they came to</p>
            <p className="text-lg font-semibold text-gray-900 tabular-nums">{loading ? '…' : events}</p>
            <p className="text-xs text-gray-500">logged by staff</p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Engagement log</h3>
          {available && !showForm && (
            <button onClick={openForm} className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700">
              + Log engagement
            </button>
          )}
        </div>

        {!available && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            No <strong>Alumni Engagement Log</strong> tab found in the spreadsheet. Add a tab with that name and the
            columns <em>Record ID, Alumni ID, Name, Date, Engagement Type, Notes, Staff Member</em> to turn this on.
          </p>
        )}
        {available && missingColumns.length > 0 && (
          <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            The <strong>Alumni Engagement Log</strong> tab is missing {missingColumns.length === 1 ? 'a column' : 'columns'}:{' '}
            <em>{missingColumns.join(', ')}</em>. Add {missingColumns.length === 1 ? 'it' : 'them'} to the tab&rsquo;s header row, or those values won&rsquo;t be saved.
          </p>
        )}
        {loadError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>}

        {showForm && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="engagement-date" className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input id="engagement-date" type="date" value={form.date} max={today}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={field} />
              </div>
              <div>
                <label htmlFor="engagement-type" className="block text-xs font-medium text-gray-600 mb-1">Engagement type</label>
                <select id="engagement-type" value={form.engagement_type}
                  onChange={(e) => setForm((f) => ({ ...f, engagement_type: e.target.value }))} className={field}>
                  {ENGAGEMENT_TYPES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="engagement-staff" className="block text-xs font-medium text-gray-600 mb-1">Staff member</label>
              <input id="engagement-staff" type="text" value={form.staff_member} placeholder="Your name"
                onChange={(e) => setForm((f) => ({ ...f, staff_member: e.target.value }))} className={field} />
            </div>
            <div>
              <label htmlFor="engagement-notes" className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea id="engagement-notes" rows={3} value={form.notes}
                placeholder="e.g. Came to the fall alumni reception. Asked about the 2027 cohort."
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={field} />
            </div>
            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving || !form.date || !form.staff_member.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save engagement'}
              </button>
            </div>
          </div>
        )}

        {available && !loading && entries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FILTERS.map((f) => {
              const n = f === 'All' ? entries.length : entries.filter((e) => GROUP_OF[e.engagement_type] === f).length;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border ${filter === f ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {f} {n}
                </button>
              );
            })}
          </div>
        )}

        {available && loading && <p className="text-sm text-gray-400">Loading engagement log…</p>}
        {available && !loading && !loadError && entries.length === 0 && !showForm && (
          <p className="text-sm text-gray-400">No engagements logged yet. Use <span className="text-gray-600">+ Log engagement</span> to add one.</p>
        )}
        {available && !loading && entries.length > 0 && shown.length === 0 && (
          <p className="text-sm text-gray-400">Nothing logged in this group yet.</p>
        )}
        <div className="space-y-2">
          {shown.map((e) => (
            <div key={e.id} className={`bg-gray-50 rounded-lg px-4 py-3 border-l-4 ${GROUP_BORDER[GROUP_OF[e.engagement_type]] || 'border-gray-300'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-800">
                  {e.engagement_type}
                  {e.id === justAdded && <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Just added</span>}
                </span>
                <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{/^\d{4}-\d{2}-\d{2}$/.test(e.date) ? fmt(e.date) : e.date}</span>
              </div>
              {e.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{e.notes}</p>}
              {e.staff_member && <p className="text-xs text-gray-400 mt-1">Logged by {e.staff_member}</p>}
            </div>
          ))}
        </div>
      </section>

      {alumni.engagement_notes && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-gray-500">Earlier notes (from the old Engagement Notes field)</summary>
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{alumni.engagement_notes}</div>
        </details>
      )}
    </div>
  );
}
