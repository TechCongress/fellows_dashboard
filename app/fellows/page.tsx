'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Fellow, Checkin, StatusReport } from '@/types';
import { INACTIVE_STATUSES, daysSince, parseCohortDate, isAISF, getRequiredReportMonths, calculateStreak } from '@/lib/helpers';

type SortOption = 'Cohort (newest first)' | 'Cohort (oldest first)' | 'Priority (Flagged first)' | 'Name (A–Z)' | 'Name (Z–A)' | 'Last Check-in (oldest first)' | 'Last Check-in (newest first)' | 'End Date (soonest first)' | 'End Date (latest first)';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Active:        { bg: 'bg-green-100',  text: 'text-green-800' },
  Flagged:       { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Ending Soon': { bg: 'bg-red-100',    text: 'text-red-800' },
  Withdrew:      { bg: 'bg-gray-100',   text: 'text-gray-600' },
};
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Senior CIF': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  CIF:          { bg: 'bg-blue-100',   text: 'text-blue-800' },
  AISF:         { bg: 'bg-cyan-100',   text: 'text-cyan-800' },
};
const PARTY_BG: Record<string, string> = {
  Democrat: 'bg-blue-500', Republican: 'bg-red-500', Independent: 'bg-purple-500', 'Institutional Office': 'bg-slate-500',
};
const PARTY_HEX: Record<string, string> = {
  Democrat: '#3b82f6', Republican: '#ef4444', Independent: '#8b5cf6', 'Institutional Office': '#64748b', Unknown: '#d1d5db',
};
const CHAMBER_HEX: Record<string, string> = {
  Senate: '#0891b2', House: '#0d9488', 'Executive Branch': '#94a3b8', Unknown: '#d1d5db',
};
const TYPE_HEX: Record<string, string> = {
  'Senior CIF': '#6366f1', CIF: '#93c5fd', AISF: '#0891b2', Unknown: '#d1d5db',
};

function ftLabel(ft: string) {
  if (ft.includes('Senior')) return 'Senior CIF';
  if (ft.includes('AI Security')) return 'AISF';
  return 'CIF';
}

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>{label}</span>;
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

function FellowCard({ fellow, onView, onEdit }: { fellow: Fellow; onView: () => void; onEdit: () => void }) {
  const days = daysSince(fellow.last_check_in);
  const aisf = isAISF(fellow);
  const needsCheckin = days > 210 && fellow.status === 'Active' && !aisf;
  const sc = STATUS_COLORS[fellow.status] || STATUS_COLORS.Active;
  const tl = fellow.fellow_type ? ftLabel(fellow.fellow_type) : '';
  const tc = tl ? TYPE_COLORS[tl] : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col min-h-[220px] hover:shadow-sm transition-shadow">
      <div className="mb-2">
        <p className="font-semibold text-gray-900">{fellow.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">Cohort: {fellow.cohort}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Badge label={fellow.status} {...sc} />
        {needsCheckin && <Badge label="Needs Check-in" bg="bg-amber-100" text="text-amber-800" />}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tc && <Badge label={tl} {...tc} />}
        {fellow.party && !aisf && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${PARTY_BG[fellow.party] || 'bg-gray-400'}`}>
            {fellow.party === 'Democrat' ? 'D' : fellow.party === 'Republican' ? 'R' : fellow.party === 'Independent' ? 'I' : fellow.party}
          </span>
        )}
        {aisf && <Badge label="Executive Branch" bg="bg-slate-100" text="text-slate-600" />}
      </div>
      <div className="mt-auto space-y-0.5 text-xs text-gray-500">
        {fellow.office && <p className="truncate">{fellow.office}</p>}
        {fellow.start_date && fellow.end_date && <p className="text-gray-400">{fellow.start_date} – {fellow.end_date}</p>}
        {fellow.last_check_in && <p className="text-gray-400">Last check-in: {fellow.last_check_in}</p>}
      </div>
      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
        <button onClick={onView} className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">View</button>
        <button onClick={onEdit} className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Edit</button>
      </div>
    </div>
  );
}

type ModalTab = 'contact' | 'placement' | 'background' | 'reports' | 'checkins';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="text-sm text-gray-500 w-36 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function FellowModal({ fellow, onClose }: { fellow: Fellow; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('contact');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [reports, setReports] = useState<StatusReport[]>([]);
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [checkinsFetched, setCheckinsFetched] = useState(false);
  const [reportsFetched, setReportsFetched] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveForm, setMoveForm] = useState({ current_role: '', sector: '', location: '' });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveDone, setMoveDone] = useState(false);

  const requiredMonths = useMemo(() => getRequiredReportMonths(fellow), [fellow]);
  const streakInfo = useMemo(() => calculateStreak(reports, requiredMonths), [reports, requiredMonths]);

  useEffect(() => {
    if (tab === 'checkins' && !checkinsFetched) {
      setLoadingCheckins(true);
      fetch(`/api/checkins?fellowId=${fellow.id}`).then(r => r.json()).then(d => { setCheckins(Array.isArray(d) ? d : []); setLoadingCheckins(false); setCheckinsFetched(true); });
    }
    if (tab === 'reports' && !reportsFetched && fellow.requires_monthly_reports) {
      setLoadingReports(true);
      fetch(`/api/status-reports?fellowId=${fellow.id}`).then(r => r.json()).then(d => { setReports(Array.isArray(d) ? d : []); setLoadingReports(false); setReportsFetched(true); });
    }
  }, [tab, fellow.id, fellow.requires_monthly_reports, checkinsFetched, reportsFetched]);

  const submittedMap = useMemo(() => {
    const m: Record<string, StatusReport> = {};
    reports.filter(r => r.submitted).forEach(r => { m[r.month] = r; });
    return m;
  }, [reports]);

  const days = daysSince(fellow.last_check_in);
  const sc = STATUS_COLORS[fellow.status] || STATUS_COLORS.Active;

  const TABS: { key: ModalTab; label: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'placement', label: 'Placement' },
    { key: 'background', label: 'Background' },
    { key: 'reports', label: 'Status Reports' },
    { key: 'checkins', label: 'Check-ins' },
  ];

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{fellow.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{fellow.cohort} · {fellow.fellow_type || 'Fellow'}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge label={fellow.status} {...sc} />
            {fellow.fellow_type && <Badge label={ftLabel(fellow.fellow_type)} {...(TYPE_COLORS[ftLabel(fellow.fellow_type)] || { bg: 'bg-gray-100', text: 'text-gray-700' })} />}
            {fellow.party && !isAISF(fellow) && <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${PARTY_BG[fellow.party] || 'bg-gray-400'}`}>{fellow.party}</span>}
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
              {fellow.email && <InfoRow label="Email" value={<a href={`mailto:${fellow.email}`} className="text-blue-600 hover:underline">{fellow.email}</a>} />}
              {fellow.congressional_email && <InfoRow label="Congressional Email" value={<a href={`mailto:${fellow.congressional_email}`} className="text-blue-600 hover:underline">{fellow.congressional_email}</a>} />}
              {fellow.phone && <InfoRow label="Phone" value={fellow.phone} />}
              {fellow.linkedin && <InfoRow label="LinkedIn" value={<a href={fellow.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View profile</a>} />}
              {!fellow.email && !fellow.congressional_email && !fellow.phone && !fellow.linkedin && <p className="text-sm text-gray-400">No contact info on record.</p>}
            </dl>
          )}

          {tab === 'placement' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Placement</h3>
                <dl className="space-y-2">
                  {fellow.office && <InfoRow label="Office" value={fellow.office} />}
                  {fellow.chamber && <InfoRow label="Chamber" value={fellow.chamber} />}
                  {fellow.party && <InfoRow label="Party" value={fellow.party} />}
                  {fellow.supervisor_email && <InfoRow label="Supervisor" value={<a href={`mailto:${fellow.supervisor_email}`} className="text-blue-600 hover:underline">{fellow.supervisor_email}</a>} />}
                </dl>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Fellowship Period</h3>
                <dl className="space-y-2">
                  {fellow.start_date && <InfoRow label="Start Date" value={fellow.start_date} />}
                  {fellow.end_date && <InfoRow label="End Date" value={fellow.end_date} />}
                  {fellow.last_check_in && <InfoRow label="Last Check-in" value={`${fellow.last_check_in} (${days} days ago)`} />}
                </dl>
              </div>
            </div>
          )}

          {tab === 'background' && (
            <div className="space-y-4">
              {fellow.prior_role && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Prior Role</h3><p className="text-sm text-gray-700">{fellow.prior_role}</p></div>}
              {fellow.education && <div><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Education</h3><p className="text-sm text-gray-700">{fellow.education}</p></div>}
              {fellow.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notes</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 leading-relaxed">{fellow.notes}</div>
                </div>
              )}
              {!fellow.prior_role && !fellow.education && !fellow.notes && <p className="text-sm text-gray-400">No background info on record.</p>}
            </div>
          )}

          {tab === 'reports' && (
            <div>
              {!fellow.requires_monthly_reports ? (
                <p className="text-sm text-gray-400">This fellow does not require monthly status reports.</p>
              ) : loadingReports ? (
                <p className="text-sm text-gray-400">Loading reports…</p>
              ) : (
                <>
                  {(streakInfo.streak > 0 || streakInfo.atRisk || streakInfo.reimbursementsPaused) && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {streakInfo.streak > 0 && <Badge label={`🔥 Streak: ${streakInfo.streak}`} bg="bg-orange-100" text="text-orange-800" />}
                      {streakInfo.giftCardEligible && <Badge label="🎁 Gift Card Earned!" bg="bg-green-100" text="text-green-800" />}
                      {streakInfo.atRisk && <Badge label="⚠️ At Risk" bg="bg-yellow-100" text="text-yellow-800" />}
                      {streakInfo.reimbursementsPaused && <Badge label="🚫 Reimbursements Paused" bg="bg-red-100" text="text-red-800" />}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {requiredMonths.map(month => {
                      const report = submittedMap[month];
                      const now = new Date();
                      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                      const reportMonthDate = new Date(`${month} 1`);
                      const graceEnd = new Date(reportMonthDate.getFullYear(), reportMonthDate.getMonth() + 1, 8); // 7 days after month end
                      const isPast = reportMonthDate < currentMonthStart;
                      const inGracePeriod = isPast && now < graceEnd;
                      const overdue = !report && isPast;
                      const graceEndStr = graceEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

                      if (report?.late) return (
                        <div key={month} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-yellow-50 border-l-4 border-yellow-500">
                          <span className="text-yellow-800 font-semibold text-sm">⏰ {month}</span>
                          <span className="text-yellow-700 text-sm">Submitted late on {report.date_submitted} — does not count toward streak</span>
                        </div>
                      );
                      if (report) return (
                        <div key={month} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border-l-4 border-green-500">
                          <span className="text-green-800 font-semibold text-sm">✅ {month}</span>
                          <span className="text-gray-500 text-sm">Submitted {report.date_submitted}</span>
                        </div>
                      );
                      if (overdue && inGracePeriod) return (
                        <div key={month} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-orange-50 border-l-4 border-orange-400">
                          <span className="text-orange-800 font-semibold text-sm">⚠️ {month}</span>
                          <span className="text-orange-700 text-sm">Overdue — late submission accepted until {graceEndStr}</span>
                        </div>
                      );
                      if (overdue) return (
                        <div key={month} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border-l-4 border-red-500">
                          <span className="text-red-800 font-semibold text-sm">❌ {month}</span>
                          <span className="text-gray-500 text-sm">Overdue</span>
                        </div>
                      );
                      return (
                        <div key={month} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border-l-4 border-gray-300">
                          <span className="text-gray-600 font-semibold text-sm">⬜ {month}</span>
                          <span className="text-gray-400 text-sm">Pending</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'checkins' && (
            <div>
              {loadingCheckins ? <p className="text-sm text-gray-400">Loading check-ins…</p>
                : checkins.length === 0 ? <p className="text-sm text-gray-400">No check-ins recorded yet.</p>
                : (
                  <div className="space-y-2">
                    {checkins.map(c => (
                      <div key={c.id} className="bg-gray-50 rounded-lg px-4 py-3 border-l-4 border-blue-400">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800">{c.date} · {c.check_in_type}</span>
                          <span className="text-xs text-gray-400">{c.staff_member}</span>
                        </div>
                        {c.notes && <p className="text-sm text-gray-600">{c.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-2">
          <button onClick={() => setShowMoveModal(true)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Move to Alumni</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">Close</button>
        </div>
      </div>
    </div>

    {showMoveModal && (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Move {fellow.name} to Alumni</h3>
            <button onClick={() => setShowMoveModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          {moveDone ? (
            <div className="px-6 py-8 text-center">
              <p className="text-green-600 font-medium text-lg">✓ Moved to Alumni!</p>
              <p className="text-sm text-gray-500 mt-1">Added to Alumni and removed from the Fellows sheet.</p>
              <button onClick={() => { setShowMoveModal(false); onClose(); }} className="mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700">Done</button>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 space-y-3">
                <p className="text-xs text-gray-500">Pre-filled from fellow record. Add any additional info below.</p>
                {([['Current Role', 'current_role'], ['Sector', 'sector'], ['Location', 'location']] as [string, keyof typeof moveForm][]).map(([label, field]) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <input type="text" value={moveForm[field]} onChange={e => setMoveForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button onClick={() => setShowMoveModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button disabled={moveSaving} onClick={async () => {
                  setMoveSaving(true);
                  try {
                    await fetch('/api/alumni', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: fellow.name,
                        email: fellow.email,
                        phone: fellow.phone,
                        linkedin: fellow.linkedin,
                        cohort: fellow.cohort,
                        fellow_types: [fellow.fellow_type],
                        office_served: fellow.office,
                        chamber: fellow.chamber,
                        party: fellow.party,
                        education: fellow.education,
                        prior_role: fellow.prior_role,
                        notes: fellow.notes,
                        current_role: moveForm.current_role,
                        sector: moveForm.sector,
                        location: moveForm.location,
                        contact: true,
                        served_on_hill: true,
                        currently_on_hill: false,
                      }),
                    });
                    // Delete the fellow row from the Google Sheet
                    await fetch('/api/fellows', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: fellow.id }),
                    });
                    setMoveDone(true);
                  } finally {
                    setMoveSaving(false);
                  }
                }} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-medium">
                  {moveSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white text-gray-700">
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function FellowsPage() {
  const [fellows, setFellows] = useState<Fellow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFellow, setSelectedFellow] = useState<Fellow | null>(null);
  const [showAddFellow, setShowAddFellow] = useState(false);
  const [addFellowForm, setAddFellowForm] = useState<Partial<Fellow>>({ status: 'Active', fellow_type: 'CIF', party: 'Democrat', chamber: 'House' });
  const [addFellowSaving, setAddFellowSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Active');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [partyFilter, setPartyFilter] = useState('All Parties');
  const [chamberFilter, setChamberFilter] = useState('All Chambers');
  const [cohortFilter, setCohortFilter] = useState('All Cohorts');
  const [sortBy, setSortBy] = useState<SortOption>('Cohort (newest first)');

  const logout = useCallback(async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.href = '/';
  }, []);

  useEffect(() => {
    fetch('/api/fellows').then(r => r.json()).then(d => { setFellows(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const activeFellows = useMemo(() => fellows.filter(f => !INACTIVE_STATUSES.includes(f.status)), [fellows]);

  const stats = useMemo(() => ({
    total: activeFellows.length,
    active: activeFellows.filter(f => f.status === 'Active').length,
    flagged: activeFellows.filter(f => f.status === 'Flagged').length,
    endingSoon: activeFellows.filter(f => f.status === 'Ending Soon').length,
    needsCheckin: activeFellows.filter(f => daysSince(f.last_check_in) > 210 && f.status === 'Active' && !isAISF(f)).length,
  }), [activeFellows]);

  const chartData = useMemo(() => {
    const party: Record<string, number> = {}, chamber: Record<string, number> = {}, type: Record<string, number> = {};
    activeFellows.forEach(f => {
      if (f.party) party[f.party] = (party[f.party] || 0) + 1;
      const ch = isAISF(f) ? 'Executive Branch' : (f.chamber || 'Unknown');
      chamber[ch] = (chamber[ch] || 0) + 1;
      const t = ftLabel(f.fellow_type || '');
      type[t] = (type[t] || 0) + 1;
    });
    return { party, chamber, type };
  }, [activeFellows]);

  const cohorts = useMemo(() =>
    [...new Set(fellows.map(f => f.cohort).filter(Boolean))].sort((a, b) => parseCohortDate(b).getTime() - parseCohortDate(a).getTime()),
    [fellows]);

  const filtered = useMemo(() => {
    let list: Fellow[];
    if (statusFilter === 'All Active') list = [...activeFellows];
    else if (statusFilter === 'Withdrew') list = fellows.filter(f => f.status === 'Withdrew');
    else list = activeFellows.filter(f => f.status === statusFilter);

    if (search) { const q = search.toLowerCase(); list = list.filter(f => f.name.toLowerCase().includes(q) || f.office.toLowerCase().includes(q)); }
    if (typeFilter !== 'All Types') list = list.filter(f => f.fellow_type === typeFilter);
    if (partyFilter !== 'All Parties') list = list.filter(f => f.party === partyFilter);
    if (chamberFilter !== 'All Chambers') list = list.filter(f => f.chamber === chamberFilter);
    if (cohortFilter !== 'All Cohorts') list = list.filter(f => f.cohort === cohortFilter);

    list.sort((a, b) => {
      switch (sortBy) {
        case 'Name (A–Z)': return a.name.localeCompare(b.name);
        case 'Name (Z–A)': return b.name.localeCompare(a.name);
        case 'Last Check-in (oldest first)': return (a.last_check_in || '').localeCompare(b.last_check_in || '');
        case 'Last Check-in (newest first)': return (b.last_check_in || '').localeCompare(a.last_check_in || '');
        case 'End Date (soonest first)': return (a.end_date || '').localeCompare(b.end_date || '');
        case 'End Date (latest first)': return (b.end_date || '').localeCompare(a.end_date || '');
        case 'Cohort (newest first)': return parseCohortDate(b.cohort).getTime() - parseCohortDate(a.cohort).getTime();
        case 'Cohort (oldest first)': return parseCohortDate(a.cohort).getTime() - parseCohortDate(b.cohort).getTime();
        case 'Priority (Flagged first)': { const p: Record<string, number> = { Flagged: 0, 'Ending Soon': 1, Active: 2 }; return (p[a.status] ?? 3) - (p[b.status] ?? 3); }
        default: return 0;
      }
    });
    return list;
  }, [fellows, activeFellows, search, statusFilter, typeFilter, partyFilter, chamberFilter, cohortFilter, sortBy]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">TC</div>
            <span className="font-semibold text-gray-900">TechCongress Fellows</span>
          </div>
          <nav className="flex gap-1">
            {([['Fellows', '/fellows'], ['Alumni', '/alumni'], ['Events', '/events'], ['Accomplishments', '/accomplishments']] as [string, string][]).map(([label, href]) => (
              <a key={href} href={href} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${href === '/fellows' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>{label}</a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAddFellow(true)} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors font-medium">+ Add Fellow</button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Log out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading fellows…</div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-4 mb-8">
              {[
                { label: 'Total Fellows', value: stats.total },
                { label: 'Active', value: stats.active },
                { label: 'Needs Check-in', value: stats.needsCheckin },
                { label: 'Flagged', value: stats.flagged },
                { label: 'Ending Soon', value: stats.endingSoon },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500 mb-1">{s.label}</p>
                  <p className="text-3xl font-semibold text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <MiniPie title="By Party" data={chartData.party} colors={PARTY_HEX} />
              <MiniPie title="By Chamber" data={chartData.chamber} colors={CHAMBER_HEX} />
              <MiniPie title="By Fellow Type" data={chartData.type} colors={TYPE_HEX} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
              <div className="grid grid-cols-5 gap-3">
                <input type="text" placeholder="Search name or office…" value={search} onChange={e => setSearch(e.target.value)}
                  className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <Select value={statusFilter} onChange={setStatusFilter} options={['All Active', 'Active', 'Flagged', 'Ending Soon', 'Withdrew']} />
                <Select value={typeFilter} onChange={setTypeFilter} options={['All Types', 'Congressional Innovation Fellow', 'Senior Congressional Innovation Fellow', 'AI Security Fellow']} />
                <Select value={partyFilter} onChange={setPartyFilter} options={['All Parties', 'Democrat', 'Republican', 'Independent', 'Institutional Office']} />
              </div>
              <div className="grid grid-cols-5 gap-3">
                <Select value={chamberFilter} onChange={setChamberFilter} options={['All Chambers', 'Senate', 'House']} />
                <Select value={cohortFilter} onChange={setCohortFilter} options={['All Cohorts', ...cohorts]} />
                <Select value={sortBy} onChange={v => setSortBy(v as SortOption)} options={['Cohort (newest first)', 'Cohort (oldest first)', 'Priority (Flagged first)', 'Name (A–Z)', 'Name (Z–A)', 'Last Check-in (oldest first)', 'Last Check-in (newest first)', 'End Date (soonest first)', 'End Date (latest first)']} />
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              {statusFilter === 'Withdrew' ? `Showing ${filtered.length} withdrawn fellow(s)` : `Showing ${filtered.length} of ${stats.total} active fellows`}
            </p>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No fellows match your filters.</div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filtered.map(f => (
                  <FellowCard key={f.id} fellow={f} onView={() => setSelectedFellow(f)} onEdit={() => {}} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {selectedFellow && <FellowModal fellow={selectedFellow} onClose={() => setSelectedFellow(null)} />}

      {showAddFellow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add New Fellow</h2>
              <button onClick={() => setShowAddFellow(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              {([
                ['Name', 'name', 'text'],
                ['Email', 'email', 'text'],
                ['Congressional Email', 'congressional_email', 'text'],
                ['Phone', 'phone', 'text'],
                ['LinkedIn', 'linkedin', 'text'],
                ['Office', 'office', 'text'],
                ['Cohort', 'cohort', 'text'],
                ['Start Date', 'start_date', 'text'],
                ['End Date', 'end_date', 'text'],
                ['Prior Role', 'prior_role', 'text'],
                ['Education', 'education', 'text'],
              ] as [string, keyof Fellow, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input type={type} value={(addFellowForm[field] as string) || ''} onChange={e => setAddFellowForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              ))}
              {([
                ['Fellow Type', 'fellow_type', ['CIF', 'Senior CIF', 'AI Security Fellow']],
                ['Party', 'party', ['Democrat', 'Republican', 'Independent', 'Institutional Office']],
                ['Chamber', 'chamber', ['House', 'Senate', 'Executive Branch']],
                ['Status', 'status', ['Active', 'Flagged', 'Ending Soon', 'Withdrew']],
              ] as [string, keyof Fellow, string[]][]).map(([label, field, options]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <select value={(addFellowForm[field] as string) || ''} onChange={e => setAddFellowForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={addFellowForm.notes || ''} onChange={e => setAddFellowForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAddFellow(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button disabled={addFellowSaving || !addFellowForm.name} onClick={async () => {
                setAddFellowSaving(true);
                try {
                  await fetch('/api/fellows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addFellowForm) });
                  setShowAddFellow(false);
                  setAddFellowForm({ status: 'Active', fellow_type: 'CIF', party: 'Democrat', chamber: 'House' });
                  const res = await fetch('/api/fellows');
                  setFellows(await res.json());
                } finally {
                  setAddFellowSaving(false);
                }
              }} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-medium">
                {addFellowSaving ? 'Saving…' : 'Add Fellow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
