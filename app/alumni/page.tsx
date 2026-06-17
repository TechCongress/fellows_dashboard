'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Alumni, Accomplishment } from '@/types';
import { parseCohortDate } from '@/lib/helpers';

// ── Constants ─────────────────────────────────────────────────────────────────

const PARTY_BG: Record<string, string> = {
  Democrat: 'bg-blue-500', Republican: 'bg-red-500',
  Independent: 'bg-purple-500', 'Institutional Office': 'bg-slate-500',
};
const SECTOR_COLORS: Record<string, { bg: string; text: string }> = {
  Government:           { bg: 'bg-blue-100',    text: 'text-blue-800' },
  'Nonprofit/Think Tank': { bg: 'bg-green-100', text: 'text-green-800' },
  Academia:             { bg: 'bg-purple-100',  text: 'text-purple-800' },
  Private:              { bg: 'bg-orange-100',  text: 'text-orange-800' },
  'Policy/Think Tank':  { bg: 'bg-cyan-100',    text: 'text-cyan-800' },
};
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Senior CIF': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  CIF:          { bg: 'bg-blue-100',   text: 'text-blue-800' },
  AISF:         { bg: 'bg-cyan-100',   text: 'text-cyan-800' },
  CIS:          { bg: 'bg-amber-100',  text: 'text-amber-800' },
  CDSF:         { bg: 'bg-emerald-100',text: 'text-emerald-800' },
};
const PARTY_HEX: Record<string, string> = {
  Democrat: '#3b82f6', Republican: '#ef4444', Independent: '#8b5cf6',
  'Institutional Office': '#64748b', Unknown: '#d1d5db',
};
const TYPE_HEX: Record<string, string> = {
  'Senior CIF': '#6366f1', CIF: '#93c5fd', AISF: '#0891b2',
  CIS: '#f59e0b', CDSF: '#10b981', Unknown: '#d1d5db',
};
const SECTOR_HEX: Record<string, string> = {
  Government: '#3b82f6', Private: '#8b5cf6', 'Nonprofit/Think Tank': '#22c55e',
  Academia: '#f59e0b', 'Policy/Think Tank': '#0891b2', Unknown: '#d1d5db',
};

function ftLabel(ft: string): string {
  if (ft.includes('Senior')) return 'Senior CIF';
  if (ft.includes('AI Security')) return 'AISF';
  if (ft.includes('Scholar')) return 'CIS';
  if (ft.includes('Digital Service')) return 'CDSF';
  return 'CIF';
}

function isAnyAISF(types: string[]): boolean {
  return types.some((t) => t.includes('AI Security'));
}

function inferChamber(role: string): 'Senate' | 'House' | 'Other' {
  if (!role) return 'Other';
  if (role.includes('Sen.') || role.includes('Senate')) return 'Senate';
  if (role.includes('Rep.') || role.includes('House')) return 'House';
  return 'Other';
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

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

function MiniPie({ data, colors, title }: { data: Record<string, number>; colors: Record<string, string>; title: string }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let cum = 0;
  const slices = entries.map(([label, value]) => {
    const pct = value / total;
    const start = cum * 360;
    const end = (cum + pct) * 360;
    cum += pct;
    const toRad = (d: number) => (d * Math.PI) / 180;
    return {
      label, value,
      x1: 50 + 40 * Math.cos(toRad(start - 90)), y1: 50 + 40 * Math.sin(toRad(start - 90)),
      x2: 50 + 40 * Math.cos(toRad(end - 90)),   y2: 50 + 40 * Math.sin(toRad(end - 90)),
      large: pct > 0.5 ? 1 : 0,
      color: colors[label] || '#d1d5db',
    };
  });
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>
      {total === 0 ? <p className="text-xs text-gray-400">No data</p> : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
            {slices.map((s, i) => (
              <path key={i} d={`M 50 50 L ${s.x1} ${s.y1} A 40 40 0 ${s.large} 1 ${s.x2} ${s.y2} Z`} fill={s.color} stroke="white" strokeWidth="1.5" />
            ))}
          </svg>
          <div className="space-y-1 min-w-0">
            {slices.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="truncate">{s.label}</span>
                <span className="text-gray-400">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alumni Card ───────────────────────────────────────────────────────────────

function AlumniCard({ alumni, onView, onEdit }: { alumni: Alumni; onView: () => void; onEdit: () => void }) {
  const aisf = isAnyAISF(alumni.fellow_types);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col min-h-[220px] hover:shadow-sm transition-shadow">
      <div className="mb-2">
        <p className="font-semibold text-gray-900">{alumni.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">Cohort: {alumni.cohort || '—'}</p>
      </div>
      {!alumni.contact && <p className="text-xs text-red-600 font-medium mb-1">⚠️ Do not contact</p>}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {alumni.fellow_types.map((ft) => {
          const lbl = ftLabel(ft);
          const c = TYPE_COLORS[lbl] || { bg: 'bg-gray-100', text: 'text-gray-700' };
          return <Badge key={ft} label={lbl} {...c} />;
        })}
        {alumni.party && !aisf && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${PARTY_BG[alumni.party] || 'bg-gray-400'}`}>
            {alumni.party === 'Democrat' ? 'D' : alumni.party === 'Republican' ? 'R' : alumni.party === 'Independent' ? 'I' : alumni.party}
          </span>
        )}
        {aisf && <Badge label="Executive Branch" bg="bg-slate-100" text="text-slate-600" />}
        {alumni.sector && (() => { const c = SECTOR_COLORS[alumni.sector] || { bg: 'bg-gray-100', text: 'text-gray-600' }; return <Badge label={alumni.sector} {...c} />; })()}
      </div>
      <div className="mt-auto space-y-0.5 text-xs text-gray-500">
        {alumni.current_role && <p className="truncate font-medium text-gray-700">{alumni.current_role}</p>}
        {alumni.office_served && <p className="truncate">Served: {alumni.office_served}</p>}
        {alumni.location && <p className="text-gray-400">{alumni.location}</p>}
      </div>
      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
        <button onClick={onView} className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">View</button>
        <button onClick={onEdit} className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Edit</button>
      </div>
    </div>
  );
}

// ── Alumni Modal ──────────────────────────────────────────────────────────────

type ModalTab = 'contact' | 'fellowship' | 'background' | 'current' | 'engagement' | 'accomplishments';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="text-sm text-gray-500 w-36 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}

const TL_STYLES: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  Green:  { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200' },
  Yellow: { dot: 'bg-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  Red:    { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200' },
};
const CF_STYLES: Record<string, { bg: string; text: string }> = {
  'Tier 1': { bg: 'bg-purple-100', text: 'text-purple-800' },
  'Tier 2': { bg: 'bg-blue-100',   text: 'text-blue-800' },
  'Tier 3': { bg: 'bg-slate-100',  text: 'text-slate-700' },
};

function AlumniModal({ alumni, onClose, onEdit }: { alumni: Alumni; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<ModalTab>('contact');
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acLoaded, setAcLoaded] = useState(false);

  useEffect(() => {
    if (tab === 'accomplishments' && !acLoaded) {
      setAcLoading(true);
      fetch('/api/accomplishments')
        .then((r) => r.json())
        .then((data: Accomplishment[]) => {
          const name = alumni.name.toLowerCase();
          setAccomplishments(data.filter((a) => a.fellow_name.toLowerCase() === name));
          setAcLoaded(true);
          setAcLoading(false);
        })
        .catch(() => setAcLoading(false));
    }
  }, [tab, acLoaded, alumni.name]);
  const aisf = isAnyAISF(alumni.fellow_types);
  const TABS: { key: ModalTab; label: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'fellowship', label: 'Fellowship' },
    { key: 'background', label: 'Background' },
    { key: 'current', label: 'Current Info' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'accomplishments', label: 'Accomplishments' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{alumni.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{alumni.cohort} · {alumni.fellow_types.join(', ') || 'Alumni'}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alumni.fellow_types.map((ft) => { const lbl = ftLabel(ft); const c = TYPE_COLORS[lbl] || { bg: 'bg-gray-100', text: 'text-gray-700' }; return <Badge key={ft} label={lbl} {...c} />; })}
            {alumni.party && !aisf && <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${PARTY_BG[alumni.party] || 'bg-gray-400'}`}>{alumni.party}</span>}
            {aisf && <Badge label="Executive Branch" bg="bg-slate-100" text="text-slate-600" />}
            {alumni.sector && (() => { const c = SECTOR_COLORS[alumni.sector] || { bg: 'bg-gray-100', text: 'text-gray-600' }; return <Badge label={alumni.sector} {...c} />; })()}
            {!alumni.contact && <Badge label="⚠️ Do not contact" bg="bg-red-100" text="text-red-700" />}
          </div>
        </div>
        <div className="flex border-b border-gray-100 flex-shrink-0 px-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`py-3 px-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'contact' && (
            <dl className="space-y-3">
              {alumni.email && <InfoRow label="Email" value={<a href={`mailto:${alumni.email}`} className="text-blue-600 hover:underline">{alumni.email}</a>} />}
              {alumni.phone && <InfoRow label="Phone" value={alumni.phone} />}
              {alumni.linkedin && <InfoRow label="LinkedIn" value={<a href={alumni.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View profile</a>} />}
              {!alumni.contact && <p className="text-sm text-red-600 font-medium mt-2">⚠️ Do not contact</p>}
              {alumni.contact && <p className="text-sm text-green-700 mt-2">✓ OK to contact</p>}
              {!alumni.email && !alumni.phone && !alumni.linkedin && <p className="text-sm text-gray-400">No contact info on record.</p>}
            </dl>
          )}
          {tab === 'fellowship' && (
            <dl className="space-y-3">
              {alumni.fellow_types.length > 0 && <InfoRow label="Fellow Type(s)" value={alumni.fellow_types.join(', ')} />}
              {alumni.cohort && <InfoRow label="Cohort" value={alumni.cohort} />}
              {alumni.chamber && <InfoRow label="Chamber" value={alumni.chamber} />}
              {alumni.party && <InfoRow label="Party" value={alumni.party} />}
              {aisf && <InfoRow label="Branch" value="Executive Branch" />}
              {alumni.office_served && <InfoRow label="Office Served" value={alumni.office_served} />}
              {alumni.served_on_hill && <InfoRow label="Post-fellowship" value="Served on the Hill" />}
              {alumni.currently_on_hill && <InfoRow label="Currently" value="On the Hill" />}
            </dl>
          )}
          {tab === 'background' && (
            <div className="space-y-4">
              {alumni.prior_role && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Prior Role</h3><p className="text-sm text-gray-700">{alumni.prior_role}</p></div>}
              {alumni.education && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Education</h3><p className="text-sm text-gray-700">{alumni.education}</p></div>}
              {alumni.notes && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes</h3><div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed">{alumni.notes}</div></div>}
              {!alumni.prior_role && !alumni.education && !alumni.notes && <p className="text-sm text-gray-400">No background info on record.</p>}
            </div>
          )}
          {tab === 'current' && (
            <dl className="space-y-3">
              {alumni.current_role && <InfoRow label="Current Role" value={alumni.current_role} />}
              {alumni.sector && <InfoRow label="Sector" value={(() => { const c = SECTOR_COLORS[alumni.sector] || { bg: 'bg-gray-100', text: 'text-gray-600' }; return <Badge label={alumni.sector} {...c} />; })()} />}
              {alumni.location && <InfoRow label="Location" value={alumni.location} />}
              {!alumni.current_role && !alumni.sector && !alumni.location && <p className="text-sm text-gray-400">No current info on record.</p>}
            </dl>
          )}
          {tab === 'engagement' && (
            <div className="space-y-4">
              {alumni.last_engaged
                ? <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Last Engaged</h3><p className="text-sm text-gray-700">{alumni.last_engaged}</p></div>
                : <p className="text-sm text-gray-400">No engagement date recorded.</p>}
              {alumni.engagement_notes && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Engagement Notes</h3><div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed">{alumni.engagement_notes}</div></div>}
            </div>
          )}
          {tab === 'accomplishments' && (
            <div className="space-y-3">
              {acLoading && (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                  Loading accomplishments…
                </div>
              )}
              {!acLoading && accomplishments.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No accomplishments found for {alumni.name}.</p>
                  <a href="/accomplishments" className="text-xs text-blue-600 hover:underline mt-1 inline-block">View full Accomplishments Matrix →</a>
                </div>
              )}
              {!acLoading && accomplishments.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">{accomplishments.length} accomplishment{accomplishments.length !== 1 ? 's' : ''} logged</span>
                    <a href={`/accomplishments?fellow=${encodeURIComponent(alumni.name)}`} className="text-xs text-blue-600 hover:underline">View all →</a>
                  </div>
                  {accomplishments.map((ac) => {
                    const tl = TL_STYLES[ac.traffic_light];
                    const cf = CF_STYLES[ac.content_framework] || { bg: 'bg-gray-100', text: 'text-gray-600' };
                    return (
                      <div key={ac.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{ac.type || 'Accomplishment'}</div>
                            <div className="text-xs text-gray-400">{ac.date}{ac.office ? ` · ${ac.office}` : ''}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {tl && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tl.bg} ${tl.text} border ${tl.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${tl.dot}`} />
                                {ac.traffic_light}
                              </span>
                            )}
                            {ac.content_framework && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cf.bg} ${cf.text}`}>
                                {ac.content_framework}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{ac.description}</p>
                        {ac.policy_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {ac.policy_tags.map((tag) => (
                              <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{tag}</span>
                            ))}
                          </div>
                        )}
                        {ac.links && (
                          <a href={ac.links} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">View evidence ↗</a>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={onEdit} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">Edit Alumni</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Alumni Form ───────────────────────────────────────────────────────────────

const FELLOW_TYPE_OPTIONS = [
  'Congressional Innovation Fellow',
  'Senior Congressional Innovation Fellow',
  'Congressional Innovation Scholar',
  'Congressional Digital Service Fellow',
  'AI Security Fellow',
];

function AlumniForm({ alumni, onClose, onSaved }: { alumni?: Alumni; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!alumni;
  const [form, setForm] = useState<Partial<Alumni>>(alumni || { contact: true, fellow_types: [], served_on_hill: false, currently_on_hill: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof Alumni>(k: K, v: Alumni[K]) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      const payload = isEdit ? { ...form, id: alumni.id } : form;
      const res = await fetch('/api/alumni', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { onSaved(); onClose(); }
      else setError('Failed to save. Please try again.');
    } catch { setError('Network error.'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Alumni' : 'Add New Alumni'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="text-xs font-medium text-gray-600">Name *</label><input value={form.name || ''} onChange={e => set('name', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Email</label><input value={form.email || ''} onChange={e => set('email', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Phone</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">LinkedIn URL</label><input value={form.linkedin || ''} onChange={e => set('linkedin', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Cohort</label><input value={form.cohort || ''} onChange={e => set('cohort', e.target.value)} placeholder="e.g., 2024" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Fellow Type(s)</label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {FELLOW_TYPE_OPTIONS.map(ft => (
                <label key={ft} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={(form.fellow_types || []).includes(ft)} onChange={e => { const cur = form.fellow_types || []; set('fellow_types', e.target.checked ? [...cur, ft] : cur.filter(x => x !== ft)); }} className="rounded" />
                  {ftLabel(ft)}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-gray-600">Party</label>
              <Select value={form.party || ''} onChange={v => set('party', v)} options={['', 'Democrat', 'Republican', 'Independent', 'Institutional Office']} /></div>
            <div><label className="text-xs font-medium text-gray-600">Chamber</label>
              <Select value={form.chamber || ''} onChange={v => set('chamber', v)} options={['', 'Senate', 'House', 'Executive Branch']} /></div>
            <div><label className="text-xs font-medium text-gray-600">Sector</label>
              <Select value={form.sector || ''} onChange={v => set('sector', v)} options={['', 'Government', 'Nonprofit/Think Tank', 'Academia', 'Private', 'Policy/Think Tank']} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-gray-600">Office Served</label><input value={form.office_served || ''} onChange={e => set('office_served', e.target.value)} placeholder="e.g., Sen. Maria Cantwell (D-WA)" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Current Role</label><input value={form.current_role || ''} onChange={e => set('current_role', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Location</label><input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g., Washington, DC" className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div><label className="text-xs font-medium text-gray-600">Last Engaged</label><input type="date" value={form.last_engaged || ''} onChange={e => set('last_engaged', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-600">Prior Role</label><input value={form.prior_role || ''} onChange={e => set('prior_role', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div><label className="text-xs font-medium text-gray-600">Education</label><input value={form.education || ''} onChange={e => set('education', e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div><label className="text-xs font-medium text-gray-600">Engagement Notes</label><textarea value={form.engagement_notes || ''} onChange={e => set('engagement_notes', e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div><label className="text-xs font-medium text-gray-600">Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={!!form.served_on_hill} onChange={e => set('served_on_hill', e.target.checked)} className="rounded" />Served on the Hill Post-fellowship?</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={!!form.currently_on_hill} onChange={e => set('currently_on_hill', e.target.checked)} className="rounded" />Currently on the Hill</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={form.contact !== false} onChange={e => set('contact', e.target.checked)} className="rounded" />OK to contact</label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit as never} disabled={saving} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Alumni'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: All Alumni ───────────────────────────────────────────────────────────

function AllAlumniTab({ alumni, onView, onEdit }: { alumni: Alumni[]; onView: (a: Alumni) => void; onEdit: (a: Alumni) => void }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
  const [partyFilter, setPartyFilter] = useState('All Parties');
  const [chamberFilter, setChamberFilter] = useState('All Chambers');
  const [cohortFilter, setCohortFilter] = useState('All Cohorts');
  const [sortBy, setSortBy] = useState('Cohort (newest first)');

  const stats = useMemo(() => ({
    total: alumni.length,
    govt: alumni.filter(a => a.sector === 'Government').length,
    private: alumni.filter(a => a.sector === 'Private').length,
    nonprofit: alumni.filter(a => a.sector === 'Nonprofit/Think Tank').length,
    academia: alumni.filter(a => a.sector === 'Academia').length,
  }), [alumni]);

  const charts = useMemo(() => {
    const party: Record<string, number> = {}, type: Record<string, number> = {}, sector: Record<string, number> = {};
    alumni.forEach(a => {
      (a.party || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => { party[p] = (party[p] || 0) + 1; });
      (a.fellow_types || []).forEach(ft => { const l = ftLabel(ft); type[l] = (type[l] || 0) + 1; });
      const s = a.sector || 'Unknown'; sector[s] = (sector[s] || 0) + 1;
    });
    return { party, type, sector };
  }, [alumni]);

  const cohorts = useMemo(() =>
    [...new Set(alumni.map(a => a.cohort).filter(Boolean))].sort((a, b) => parseCohortDate(b).getTime() - parseCohortDate(a).getTime()),
    [alumni]);

  const filtered = useMemo(() => {
    let list = [...alumni];
    if (search) { const q = search.toLowerCase(); list = list.filter(a => a.name.toLowerCase().includes(q) || (a.office_served || '').toLowerCase().includes(q) || (a.current_role || '').toLowerCase().includes(q)); }
    if (typeFilter !== 'All Types') list = list.filter(a => a.fellow_types.includes(typeFilter));
    if (sectorFilter !== 'All Sectors') list = list.filter(a => a.sector === sectorFilter);
    if (partyFilter !== 'All Parties') list = list.filter(a => a.party === partyFilter);
    if (chamberFilter !== 'All Chambers') list = list.filter(a => a.chamber === chamberFilter);
    if (cohortFilter !== 'All Cohorts') list = list.filter(a => a.cohort === cohortFilter);
    switch (sortBy) {
      case 'Cohort (newest first)': list.sort((a, b) => parseCohortDate(b.cohort).getTime() - parseCohortDate(a.cohort).getTime()); break;
      case 'Cohort (oldest first)': list.sort((a, b) => parseCohortDate(a.cohort).getTime() - parseCohortDate(b.cohort).getTime()); break;
      case 'Name (A-Z)': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'Name (Z-A)': list.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'Last Engaged (newest first)': list.sort((a, b) => (b.last_engaged || '').localeCompare(a.last_engaged || '')); break;
      case 'Last Engaged (oldest first)': list.sort((a, b) => (a.last_engaged || '').localeCompare(b.last_engaged || '')); break;
      case 'Sector': list.sort((a, b) => (a.sector || '').localeCompare(b.sector || '')); break;
    }
    return list;
  }, [alumni, search, typeFilter, sectorFilter, partyFilter, chamberFilter, cohortFilter, sortBy]);

  return (
    <div>
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[['Total Alumni', stats.total], ['Government', stats.govt], ['Private Sector', stats.private], ['Nonprofit/Think Tank', stats.nonprofit], ['Academia', stats.academia]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">{l}</p>
            <p className="text-3xl font-semibold text-gray-900">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MiniPie title="By Party" data={charts.party} colors={PARTY_HEX} />
        <MiniPie title="By Fellow Type" data={charts.type} colors={TYPE_HEX} />
        <MiniPie title="By Sector" data={charts.sector} colors={SECTOR_HEX} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-5 gap-3">
          <input type="text" placeholder="Search name, org, or office…" value={search} onChange={e => setSearch(e.target.value)} className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <Select value={typeFilter} onChange={setTypeFilter} options={['All Types', ...FELLOW_TYPE_OPTIONS]} />
          <Select value={sectorFilter} onChange={setSectorFilter} options={['All Sectors', 'Government', 'Nonprofit/Think Tank', 'Academia', 'Private', 'Policy/Think Tank']} />
          <Select value={partyFilter} onChange={setPartyFilter} options={['All Parties', 'Democrat', 'Republican', 'Independent', 'Institutional Office']} />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <Select value={chamberFilter} onChange={setChamberFilter} options={['All Chambers', 'Senate', 'House', 'Executive Branch']} />
          <Select value={cohortFilter} onChange={setCohortFilter} options={['All Cohorts', ...cohorts]} />
          <Select value={sortBy} onChange={setSortBy} options={['Cohort (newest first)', 'Cohort (oldest first)', 'Name (A-Z)', 'Name (Z-A)', 'Last Engaged (newest first)', 'Last Engaged (oldest first)', 'Current Role (A-Z)', 'Sector']} />
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">Showing {filtered.length} of {stats.total} alumni</p>
      {filtered.length === 0 ? <div className="text-center py-16 text-gray-400 text-sm">No alumni match your filters.</div> : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}
        </div>
      )}
    </div>
  );
}

// ── Tab: On the Hill ──────────────────────────────────────────────────────────

function OnHillTab({ alumni, onView, onEdit }: { alumni: Alumni[]; onView: (a: Alumni) => void; onEdit: (a: Alumni) => void }) {
  const [search, setSearch] = useState('');
  const [party, setParty] = useState('All Parties');
  const [cohort, setCohort] = useState('All Cohorts');
  const onHill = alumni.filter(a => a.currently_on_hill);
  const cohorts = [...new Set(onHill.map(a => a.cohort).filter(Boolean))].sort((a, b) => parseCohortDate(b).getTime() - parseCohortDate(a).getTime());
  function applyFilters(list: Alumni[]) {
    if (search) { const q = search.toLowerCase(); list = list.filter(a => a.name.toLowerCase().includes(q) || (a.current_role || '').toLowerCase().includes(q)); }
    if (party !== 'All Parties') list = list.filter(a => a.party === party);
    if (cohort !== 'All Cohorts') list = list.filter(a => a.cohort === cohort);
    return list;
  }
  const senate = applyFilters(onHill.filter(a => inferChamber(a.current_role) === 'Senate'));
  const house  = applyFilters(onHill.filter(a => inferChamber(a.current_role) === 'House'));
  const other  = applyFilters(onHill.filter(a => inferChamber(a.current_role) === 'Other'));
  const pct = alumni.length ? Math.round(onHill.length / alumni.length * 100) : 0;
  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[['Total on the Hill', onHill.length], ['Senate', onHill.filter(a => inferChamber(a.current_role) === 'Senate').length], ['House', onHill.filter(a => inferChamber(a.current_role) === 'House').length], ['% of All Alumni', `${pct}%`]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm text-gray-500 mb-1">{l}</p><p className="text-3xl font-semibold text-gray-900">{v}</p></div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <input type="text" placeholder="Search name or role…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <Select value={party} onChange={setParty} options={['All Parties', 'Democrat', 'Republican', 'Independent', 'Institutional Office']} />
        <Select value={cohort} onChange={setCohort} options={['All Cohorts', ...cohorts]} />
      </div>
      {onHill.length === 0 ? <p className="text-sm text-gray-400">No alumni are currently marked as working on the Hill.</p> : (
        <>
          <div className="grid grid-cols-2 gap-6">
            <div><h3 className="font-semibold text-gray-700 mb-3">🏛 Senate ({senate.length})</h3>{senate.length ? <div className="grid grid-cols-1 gap-4">{senate.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div> : <p className="text-sm text-gray-400">No Senate alumni match.</p>}</div>
            <div><h3 className="font-semibold text-gray-700 mb-3">🏛 House ({house.length})</h3>{house.length ? <div className="grid grid-cols-1 gap-4">{house.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div> : <p className="text-sm text-gray-400">No House alumni match.</p>}</div>
          </div>
          {other.length > 0 && <div className="mt-6"><h3 className="font-semibold text-gray-700 mb-3">Other / Unknown ({other.length})</h3><div className="grid grid-cols-3 gap-4">{other.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div></div>}
        </>
      )}
    </div>
  );
}

// ── Tab: Served on Hill ───────────────────────────────────────────────────────

function ServedTab({ alumni, onView, onEdit }: { alumni: Alumni[]; onView: (a: Alumni) => void; onEdit: (a: Alumni) => void }) {
  const [search, setSearch] = useState('');
  const [party, setParty] = useState('All Parties');
  const [cohort, setCohort] = useState('All Cohorts');
  const served = alumni.filter(a => a.served_on_hill);
  const cohorts = [...new Set(served.map(a => a.cohort).filter(Boolean))].sort((a, b) => parseCohortDate(b).getTime() - parseCohortDate(a).getTime());
  function applyFilters(list: Alumni[]) {
    if (search) { const q = search.toLowerCase(); list = list.filter(a => a.name.toLowerCase().includes(q) || (a.office_served || '').toLowerCase().includes(q)); }
    if (party !== 'All Parties') list = list.filter(a => a.party === party);
    if (cohort !== 'All Cohorts') list = list.filter(a => a.cohort === cohort);
    return list;
  }
  const senate = applyFilters(served.filter(a => inferChamber(a.office_served) === 'Senate'));
  const house  = applyFilters(served.filter(a => inferChamber(a.office_served) === 'House'));
  const other  = applyFilters(served.filter(a => inferChamber(a.office_served) === 'Other'));
  const stillThere = served.filter(a => a.currently_on_hill).length;
  const pct = alumni.length ? Math.round(served.length / alumni.length * 100) : 0;
  return (
    <div>
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[['Served Post-fellowship', served.length], ['Senate', served.filter(a => inferChamber(a.office_served) === 'Senate').length], ['House', served.filter(a => inferChamber(a.office_served) === 'House').length], ['Still on the Hill', stillThere], ['% of All Alumni', `${pct}%`]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-sm text-gray-500 mb-1">{l}</p><p className="text-3xl font-semibold text-gray-900">{v}</p></div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <input type="text" placeholder="Search name or office…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <Select value={party} onChange={setParty} options={['All Parties', 'Democrat', 'Republican', 'Independent', 'Institutional Office']} />
        <Select value={cohort} onChange={setCohort} options={['All Cohorts', ...cohorts]} />
      </div>
      {served.length === 0 ? <p className="text-sm text-gray-400">No alumni marked as having served on the Hill post-fellowship.</p> : (
        <>
          <div className="grid grid-cols-2 gap-6">
            <div><h3 className="font-semibold text-gray-700 mb-3">🏛 Senate ({senate.length})</h3>{senate.length ? <div className="grid grid-cols-1 gap-4">{senate.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div> : <p className="text-sm text-gray-400">No Senate alumni match.</p>}</div>
            <div><h3 className="font-semibold text-gray-700 mb-3">🏛 House ({house.length})</h3>{house.length ? <div className="grid grid-cols-1 gap-4">{house.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div> : <p className="text-sm text-gray-400">No House alumni match.</p>}</div>
          </div>
          {other.length > 0 && <div className="mt-6"><h3 className="font-semibold text-gray-700 mb-3">Other / Unknown ({other.length})</h3><div className="grid grid-cols-3 gap-4">{other.map(a => <AlumniCard key={a.id} alumni={a} onView={() => onView(a)} onEdit={() => onEdit(a)} />)}</div></div>}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AlumniPage() {
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'hill' | 'served'>('all');
  const [viewing, setViewing] = useState<Alumni | null>(null);
  const [editing, setEditing] = useState<Alumni | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const logout = useCallback(async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/'; }, []);

  async function load() {
    const res = await fetch('/api/alumni');
    const data = await res.json();
    setAlumni(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const TABS = [
    { key: 'all' as const, label: 'All Alumni' },
    { key: 'hill' as const, label: '🏛 On the Hill' },
    { key: 'served' as const, label: '📊 Served on Hill' },
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
              <a key={href} href={href} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${href === '/alumni' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>{label}</a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditing(undefined); setShowForm(true); }} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">+ Add Alumni</button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Log out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Alumni Network</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage TechCongress alumni</p>
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
          <div className="flex items-center justify-center h-64 text-gray-400">Loading alumni…</div>
        ) : (
          <>
            {activeTab === 'all'    && <AllAlumniTab alumni={alumni} onView={setViewing} onEdit={a => { setEditing(a); setShowForm(true); }} />}
            {activeTab === 'hill'   && <OnHillTab alumni={alumni} onView={setViewing} onEdit={a => { setEditing(a); setShowForm(true); }} />}
            {activeTab === 'served' && <ServedTab alumni={alumni} onView={setViewing} onEdit={a => { setEditing(a); setShowForm(true); }} />}
          </>
        )}
      </main>

      {viewing && <AlumniModal alumni={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setShowForm(true); setViewing(null); }} />}
      {showForm && <AlumniForm alumni={editing} onClose={() => { setShowForm(false); setEditing(undefined); }} onSaved={load} />}
    </div>
  );
}
