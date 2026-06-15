'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { TCEvent, EventAttendance, Fellow } from '@/types';
import { EVENT_TYPES, isPast, isUpcoming, fmtDate, fmtDateLong, eventStatus, dateToQuarter, isTrackedCohort, getQuarterCompliance } from '@/lib/helpers';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Happy Hour':         { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: '#3b82f6' },
  'Site Visit':         { bg: 'bg-green-100',  text: 'text-green-800',  dot: '#22c55e' },
  'Social':             { bg: 'bg-orange-100', text: 'text-orange-800', dot: '#f97316' },
  'Career Development': { bg: 'bg-purple-100', text: 'text-purple-800', dot: '#8b5cf6' },
  'Speaker Series':     { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: '#eab308' },
  'Check-ins':          { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: '#94a3b8' },
  'Conference':         { bg: 'bg-red-100',    text: 'text-red-800',    dot: '#ef4444' },
  'Recruitment':        { bg: 'bg-slate-100',  text: 'text-slate-700',  dot: '#6b7280' },
};
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Past:     { bg: 'bg-gray-100',   text: 'text-gray-600' },
  Today:    { bg: 'bg-green-100',  text: 'text-green-800' },
  Upcoming: { bg: 'bg-blue-100',   text: 'text-blue-800' },
};

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>{label}</span>;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-700">
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

function AttBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Event Form ────────────────────────────────────────────────────────────────

function EventForm({ event, onClose, onSaved }: { event?: TCEvent; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!event;
  const [form, setForm] = useState<Partial<TCEvent>>(event || { required: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof TCEvent>(k: K, v: TCEvent[K]) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'date') next.quarter = dateToQuarter(v as string);
      if (k === 'type' && v === 'Recruitment') next.required = false;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setError('Event name is required.'); return; }
    setSaving(true);
    try {
      const payload = isEdit ? { ...form, id: event.id } : form;
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { onSaved(); onClose(); }
      else setError('Failed to save.');
    } catch { setError('Network error.'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Event' : 'Add New Event'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div><label className="text-xs font-medium text-gray-600">Event Name *</label><input value={form.name || ''} onChange={e => set('name', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-600">Date</label><input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Type</label>
              <Select value={form.type || EVENT_TYPES[0]} onChange={v => set('type', v)} options={EVENT_TYPES} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-600">Location (City)</label><input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g., Washington, DC" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Venue</label><input value={form.venue || ''} onChange={e => set('venue', e.target.value)} placeholder="e.g., Capitol Hill Club" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-600">Cohort</label><input value={form.cohort || ''} onChange={e => set('cohort', e.target.value)} placeholder="e.g., Jan 2026 CIF/SCIF" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Quarter (auto)</label><input value={form.quarter || ''} readOnly className="mt-1 w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-400" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Staffed By</label><input value={form.staffed_by || ''} onChange={e => set('staffed_by', e.target.value)} placeholder="e.g., Grace, Mya" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div><label className="text-xs font-medium text-gray-600">Description</label><textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.type !== 'Recruitment' && form.required !== false} disabled={form.type === 'Recruitment'} onChange={e => set('required', e.target.checked)} className="rounded" />
            Required for Fellows? {form.type === 'Recruitment' && <span className="text-xs text-gray-400">(Recruitment events are never required)</span>}
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit as never} disabled={saving} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Attendance Modal ──────────────────────────────────────────────────────────

function AttendanceModal({ event, fellows, attendance, onClose, onSaved }: {
  event: TCEvent; fellows: Fellow[]; attendance: EventAttendance[]; onClose: () => void; onSaved: () => void;
}) {
  const eligible = fellows.filter(f => !f.fellow_type.includes('AI Security') && isTrackedCohort(f.cohort));
  const existing = useMemo(() => {
    const m: Record<string, boolean> = {};
    attendance.filter(r => r.event_id === event.id).forEach(r => { m[r.fellow_id] = r.attended; });
    return m;
  }, [attendance, event.id]);
  const [checks, setChecks] = useState<Record<string, boolean>>({ ...existing });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const map: Record<string, { fellowName: string; attended: boolean }> = {};
    eligible.forEach(f => { map[f.id] = { fellowName: f.name, attended: !!checks[f.id] }; });
    await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id, attendanceMap: map }) });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{event.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{fmtDateLong(event.date)} · {event.venue || event.location || ''}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Mark attendance</p>
          <div className="space-y-2">
            {eligible.map(f => (
              <label key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!!checks[f.id]} onChange={e => setChecks(c => ({ ...c, [f.id]: e.target.checked }))} className="rounded" />
                <span className="text-sm text-gray-800">{f.name}</span>
              </label>
            ))}
            {eligible.length === 0 && <p className="text-sm text-gray-400">No tracked fellows found.</p>}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Attendance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ fellows, events, attendance }: { fellows: Fellow[]; events: TCEvent[]; attendance: EventAttendance[] }) {
  const pastEvents = events.filter(e => isPast(e.date));
  const attByEvent = useMemo(() => {
    const m: Record<string, boolean[]> = {};
    attendance.forEach(r => { if (!m[r.event_id]) m[r.event_id] = []; m[r.event_id].push(r.attended); });
    return m;
  }, [attendance]);

  const pcts = pastEvents.map(e => { const vals = attByEvent[e.id] || []; return vals.length ? Math.round(vals.filter(Boolean).length / vals.length * 100) : 0; }).filter((_, i) => (attByEvent[pastEvents[i].id] || []).length > 0);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

  const eligible = fellows.filter(f => !f.fellow_type.includes('AI Security') && isTrackedCohort(f.cohort));
  const compliance = useMemo(() => getQuarterCompliance(eligible.map(f => ({ id: f.id, fellow_type: f.fellow_type })), events, attendance), [eligible, events, attendance]);
  const atRisk = eligible.filter(f => Object.values(compliance[f.id] || {}).includes('not_met')).length;
  const upcoming = events.filter(e => isUpcoming(e.date)).slice(0, 5);

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[['Total Events', events.length], ['Events Completed', pastEvents.length], ['Avg. Attendance', `${avgPct}%`], ['At-Risk Fellows', atRisk]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm text-gray-500 mb-1">{l}</p><p className="text-3xl font-semibold text-gray-900">{v}</p></div>
        ))}
      </div>
      <div className="grid grid-cols-[1.7fr_1fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Attendance by Event</h3>
          {pastEvents.length === 0 ? <p className="text-sm text-gray-400">No past events yet.</p> : (
            <div className="space-y-3">
              {pastEvents.map(e => {
                const vals = attByEvent[e.id] || [];
                const attended = vals.filter(Boolean).length;
                const total = vals.length;
                const pct = total ? Math.round(attended / total * 100) : 0;
                const dot = TYPE_COLORS[e.type]?.dot || '#6366f1';
                return (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                    <div className="w-36 flex-shrink-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{e.name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(e.date)}</p>
                    </div>
                    <div className="flex-1"><AttBar pct={pct} /></div>
                    <span className="text-xs text-gray-400 w-12 text-right">{attended}/{total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Quarterly Compliance</h3>
            {eligible.length === 0 ? <p className="text-sm text-gray-400">No tracked fellows.</p> : (
              <div className="space-y-2">
                {eligible.map(f => {
                  const qc = compliance[f.id] || {};
                  const quarters = Object.keys(qc).sort();
                  const atRisk = Object.values(qc).includes('not_met');
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate flex-1">{f.name}{atRisk && ' ⚠️'}</span>
                      <div className="flex gap-1">
                        {quarters.map(q => (
                          <span key={q} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${qc[q] === 'met' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {qc[q] === 'met' ? '✓' : '✗'} {q}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400 mt-2">Fellows must attend ≥1 required event per quarter.</p>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Upcoming Events</h3>
            {upcoming.length === 0 ? <p className="text-sm text-gray-400">No upcoming events scheduled.</p> : (
              <div className="space-y-2">
                {upcoming.map(e => {
                  const dot = TYPE_COLORS[e.type]?.dot || '#6366f1';
                  return (
                    <div key={e.id} className="flex gap-2 items-start">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: dot }} />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{e.name}</p>
                        <p className="text-xs text-gray-400">{fmtDate(e.date)}{e.location ? ` · ${e.location}` : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Events ───────────────────────────────────────────────────────────────

function EventsTab({ fellows, events, attendance, onEditEvent, onRefresh }: {
  fellows: Fellow[]; events: TCEvent[]; attendance: EventAttendance[];
  onEditEvent: (e: TCEvent) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [quarterFilter, setQuarterFilter] = useState('All Quarters');
  const [attendanceTarget, setAttendanceTarget] = useState<TCEvent | null>(null);
  const [showRoster, setShowRoster] = useState<string | null>(null);

  const quarters = useMemo(() => [...new Set(events.map(e => e.quarter).filter(Boolean))].sort(), [events]);
  const eligible = useMemo(() => fellows.filter(f => !f.fellow_type.includes('AI Security') && isTrackedCohort(f.cohort)), [fellows]);

  const filtered = useMemo(() => {
    let list = [...events];
    if (search) { const q = search.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)); }
    if (typeFilter !== 'All Types') list = list.filter(e => e.type === typeFilter);
    if (quarterFilter !== 'All Quarters') list = list.filter(e => e.quarter === quarterFilter);
    return list;
  }, [events, search, typeFilter, quarterFilter]);

  const attByEvent = useMemo(() => {
    const m: Record<string, Record<string, boolean>> = {};
    attendance.forEach(r => { if (!m[r.event_id]) m[r.event_id] = {}; m[r.event_id][r.fellow_id] = r.attended; });
    return m;
  }, [attendance]);

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <Select value={typeFilter} onChange={setTypeFilter} options={['All Types', ...EVENT_TYPES]} />
        <Select value={quarterFilter} onChange={setQuarterFilter} options={['All Quarters', ...quarters]} />
      </div>
      <p className="text-xs text-gray-400 mb-4">Showing {filtered.length} of {events.length} events</p>
      <div className="space-y-3">
        {filtered.map(event => {
          const status = eventStatus(event.date);
          const ev_att = attByEvent[event.id] || {};
          const total = Object.keys(ev_att).length;
          const attended = Object.values(ev_att).filter(Boolean).length;
          const pct = total ? Math.round(attended / total * 100) : 0;
          const tc = TYPE_COLORS[event.type] || { bg: 'bg-gray-100', text: 'text-gray-700', dot: '#6366f1' };
          const sc = STATUS_STYLES[status] || STATUS_STYLES.Upcoming;
          const locationStr = [event.venue, event.location].filter(Boolean).join(' · ');
          return (
            <div key={event.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-semibold text-gray-900">{event.name}</span>
                    <Badge label={event.type} bg={tc.bg} text={tc.text} />
                    <Badge label={status} bg={sc.bg} text={sc.text} />
                    {!event.required && <Badge label="Not Required" bg="bg-gray-100" text="text-gray-500" />}
                  </div>
                  {event.description && <p className="text-sm text-gray-500 mb-2">{event.description}</p>}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>📅 {fmtDateLong(event.date)}</span>
                    {locationStr && <span>📍 {locationStr}</span>}
                    {event.quarter && <span>🗓 {event.quarter}</span>}
                    {event.staffed_by && <span>👤 {event.staffed_by}</span>}
                  </div>
                </div>
                {status === 'Past' && total > 0 && (
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-2xl font-bold text-gray-900">{pct}%</p>
                    <p className="text-xs text-gray-400">{attended}/{total} attended</p>
                    <div className="w-24 mt-1"><AttBar pct={pct} /></div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <button onClick={() => onEditEvent(event)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">✏️ Edit</button>
                {status === 'Past' && (
                  <button onClick={() => setAttendanceTarget(event)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                    📋 {total > 0 ? 'Update Attendance' : 'Record Attendance'}
                  </button>
                )}
                {status === 'Past' && total > 0 && (
                  <button onClick={() => setShowRoster(showRoster === event.id ? null : event.id)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                    {showRoster === event.id ? '▲ Hide Roster' : '▼ View Roster'}
                  </button>
                )}
              </div>
              {showRoster === event.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-1.5">
                    {eligible.map(f => {
                      const present = ev_att[f.id];
                      if (present === undefined) return null;
                      return (
                        <div key={f.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${present ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${present ? 'bg-green-500' : 'bg-red-400'}`} />
                          {f.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">No events match your filters.</div>}
      </div>
      {attendanceTarget && (
        <AttendanceModal event={attendanceTarget} fellows={fellows} attendance={attendance}
          onClose={() => setAttendanceTarget(null)} onSaved={onRefresh} />
      )}
    </div>
  );
}

// ── Tab: Fellows ──────────────────────────────────────────────────────────────

function FellowsTab({ fellows, events, attendance }: { fellows: Fellow[]; events: TCEvent[]; attendance: EventAttendance[] }) {
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const eligible = fellows.filter(f => !f.fellow_type.includes('AI Security') && isTrackedCohort(f.cohort));
  const compliance = useMemo(() => getQuarterCompliance(eligible.map(f => ({ id: f.id, fellow_type: f.fellow_type })), events, attendance), [eligible, events, attendance]);
  const attLookup = useMemo(() => {
    const m: Record<string, Record<string, boolean>> = {};
    attendance.forEach(r => { if (!m[r.fellow_id]) m[r.fellow_id] = {}; m[r.fellow_id][r.event_id] = r.attended; });
    return m;
  }, [attendance]);
  const pastEvents = useMemo(() => events.filter(e => isPast(e.date)), [events]);

  if (eligible.length === 0) return <p className="text-sm text-gray-400">No tracked fellows. Fellows must be Jan 2026 CIF/SCIF or a later cohort.</p>;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-6">Tracking attendance for Jan 2026 CIF/SCIF fellows and future cohorts. Each fellow must attend at least one required event per quarter.</p>
      <div className="grid grid-cols-2 gap-4">
        {eligible.map(f => {
          const qc = compliance[f.id] || {};
          const quarters = Object.keys(qc).sort();
          const atRisk = Object.values(qc).includes('not_met');
          const fAtt = attLookup[f.id] || {};
          const fellowPastEvents = pastEvents.filter(e => e.id in fAtt);
          const attendedCount = fellowPastEvents.filter(e => fAtt[e.id]).length;
          const pct = fellowPastEvents.length ? Math.round(attendedCount / fellowPastEvents.length * 100) : 0;
          const pctColor = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
          const initials = f.name.split(' ').map(p => p[0]).join('').slice(0, 2);
          return (
            <div key={f.id} className={`bg-white rounded-xl border p-5 ${atRisk ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">{initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{f.name}{atRisk && ' ⚠️'}</p>
                  <p className="text-xs text-gray-400 truncate">{f.fellow_type} · {f.office}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${pctColor}`}>{pct}%</p>
                  <p className="text-xs text-gray-400">{attendedCount}/{fellowPastEvents.length} events</p>
                </div>
              </div>
              <AttBar pct={pct} />
              <div className="flex flex-wrap gap-1.5 mt-3">
                {quarters.map(q => (
                  <span key={q} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${qc[q] === 'met' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {qc[q] === 'met' ? '✓' : '✗'} {q}
                  </span>
                ))}
                {atRisk && <Badge label="⚠ Needs attention" bg="bg-red-100" text="text-red-700" />}
              </div>
              <button onClick={() => setOpenHistory(openHistory === f.id ? null : f.id)} className="mt-3 text-xs text-gray-400 hover:text-gray-600">
                {openHistory === f.id ? '▲ Hide event history' : '▼ View event history'}
              </button>
              {openHistory === f.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  {fellowPastEvents.length === 0 ? <p className="text-xs text-gray-400">No attendance recorded yet.</p>
                    : fellowPastEvents.map(e => {
                      const present = fAtt[e.id];
                      const tc = TYPE_COLORS[e.type];
                      return (
                        <div key={e.id} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc?.dot || '#6366f1' }} />
                          <span className="text-xs text-gray-700 flex-1 truncate">{e.name}</span>
                          <span className="text-xs text-gray-400">{e.quarter}</span>
                          <span className={`text-xs font-medium ${present ? 'text-green-600' : 'text-red-500'}`}>{present ? '✓ Attended' : '✗ Absent'}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [fellows, setFellows] = useState<Fellow[]>([]);
  const [events, setEvents] = useState<TCEvent[]>([]);
  const [attendance, setAttendance] = useState<EventAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'fellows'>('overview');
  const [editingEvent, setEditingEvent] = useState<TCEvent | undefined>(undefined);
  const [showEventForm, setShowEventForm] = useState(false);

  const logout = useCallback(async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/'; }, []);

  async function load() {
    const [fr, er, ar] = await Promise.all([fetch('/api/fellows'), fetch('/api/events'), fetch('/api/attendance')]);
    const [fd, ed, ad] = await Promise.all([fr.json(), er.json(), ar.json()]);
    setFellows(Array.isArray(fd) ? fd : []);
    setEvents(Array.isArray(ed) ? ed : []);
    setAttendance(Array.isArray(ad) ? ad : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const TABS = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'events' as const, label: 'Events' },
    { key: 'fellows' as const, label: 'Fellows' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">TC</div>
            <span className="font-semibold text-gray-900">TechCongress Fellows</span>
          </div>
          <nav className="flex gap-1">
            {[['Fellows', '/fellows'], ['Alumni', '/alumni'], ['Events', '/events'], ['Accomplishments', '/accomplishments']].map(([label, href]) => (
              <a key={href} href={href} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${href === '/events' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>{label}</a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditingEvent(undefined); setShowEventForm(true); }} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">+ Add Event</button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Log out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Events & Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Jan 2026 CIF/SCIF cohort · Required: ≥1 event per quarter</p>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading events…</div>
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab fellows={fellows} events={events} attendance={attendance} />}
            {activeTab === 'events'   && <EventsTab fellows={fellows} events={events} attendance={attendance} onEditEvent={e => { setEditingEvent(e); setShowEventForm(true); }} onRefresh={load} />}
            {activeTab === 'fellows'  && <FellowsTab fellows={fellows} events={events} attendance={attendance} />}
          </>
        )}
      </main>

      {showEventForm && <EventForm event={editingEvent} onClose={() => { setShowEventForm(false); setEditingEvent(undefined); }} onSaved={load} />}
    </div>
  );
}
