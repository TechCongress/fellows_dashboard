'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Accomplishment } from '@/types';
import { POLICY_TAGS, TRAFFIC_LIGHT, CONTENT_FRAMEWORK } from '@/lib/reference-data';

// ── Color helpers ─────────────────────────────────────────────────────────────

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

const TAG_COLORS = [
  'bg-indigo-100 text-indigo-800', 'bg-cyan-100 text-cyan-800',
  'bg-teal-100 text-teal-800',     'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',     'bg-amber-100 text-amber-800',
  'bg-lime-100 text-lime-800',     'bg-violet-100 text-violet-800',
  'bg-sky-100 text-sky-800',       'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
];

const TAG_COLOR_MAP: Record<string, string> = {};
POLICY_TAGS.forEach((p, i) => { TAG_COLOR_MAP[p.tag] = TAG_COLORS[i % TAG_COLORS.length]; });

function TLBadge({ value }: { value: string }) {
  const s = TL_STYLES[value];
  if (!s) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text} border ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {value}
    </span>
  );
}

function CFBadge({ value }: { value: string }) {
  const s = CF_STYLES[value] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {value || '—'}
    </span>
  );
}

function TagPill({ tag }: { tag: string }) {
  const cls = TAG_COLOR_MAP[tag] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {tag}
    </span>
  );
}

// ── Reference sidebar panels ─────────────────────────────────────────────────

function TLPanel({ color }: { color: string }) {
  const info = TRAFFIC_LIGHT.find((t) => t.color === color);
  if (!info) return null;
  const s = TL_STYLES[color] || TL_STYLES['Green'];
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} p-4 text-sm`}>
      <div className={`font-semibold mb-1 ${s.text}`}>{info.label}</div>
      <p className={`text-xs mb-2 ${s.text} opacity-80`}>{info.storyPotential}</p>
      <div className="mb-2">
        <div className="text-xs font-medium text-gray-600 mb-1">Examples</div>
        <ul className="space-y-0.5">
          {info.examples.map((e) => (
            <li key={e} className="text-xs text-gray-700 flex gap-1"><span>•</span>{e}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-600 mb-1">Use Cases</div>
        <ul className="space-y-0.5">
          {info.useCases.map((u) => (
            <li key={u} className="text-xs text-gray-700 flex gap-1"><span>•</span>{u}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CFPanel({ tier }: { tier: string }) {
  const info = CONTENT_FRAMEWORK.find((c) => c.tier === tier);
  if (!info) return null;
  const s = CF_STYLES[tier] || { bg: 'bg-gray-50', text: 'text-gray-700' };
  return (
    <div className={`rounded-lg border border-gray-200 ${s.bg} p-4 text-sm`}>
      <div className={`font-semibold mb-1 ${s.text}`}>{info.tier} — {info.format}</div>
      <div className="text-xs text-gray-600 mb-2">Audience: {info.audience}</div>
      <div className="text-xs text-gray-600 mb-2">Approval: {info.approval}</div>
      <div className="text-xs font-medium text-gray-600 mb-1">Criteria</div>
      <ul className="space-y-0.5">
        {info.criteria.map((c) => (
          <li key={c} className="text-xs text-gray-700 flex gap-1"><span>•</span>{c}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ item, onClose }: { item: Accomplishment; onClose: () => void }) {
  const tlInfo = TRAFFIC_LIGHT.find((t) => t.color === item.traffic_light);
  const cfInfo = CONTENT_FRAMEWORK.find((c) => c.tier === item.content_framework);
  const policyDefs = item.policy_tags
    .map((tag) => POLICY_TAGS.find((p) => p.tag === tag))
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-500">{item.fellow_name}</span>
                {item.cohort && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.cohort}</span>}
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.tab === 'AISF' ? 'AISF' : 'CIF'}</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 leading-snug">{item.type || 'Accomplishment'}</h2>
              <div className="flex items-center gap-2 mt-2">
                {item.traffic_light && <TLBadge value={item.traffic_light} />}
                {item.content_framework && <CFBadge value={item.content_framework} />}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Meta row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            {item.date && <span><span className="font-medium text-gray-900">Date:</span> {item.date}</span>}
            {item.office && <span><span className="font-medium text-gray-900">Office:</span> {item.office}</span>}
            {item.linkedin && (
              <a href={item.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                LinkedIn ↗
              </a>
            )}
          </div>

          {/* Description */}
          <div>
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</h3>
              {item.source_links && item.source_links.length > 0 && (
                <div className="flex flex-col items-end gap-1">
                  {item.source_links.map((url, idx) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                    >
                      {item.source_links.length > 1 ? `Source ${idx + 1}` : 'View Source'}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {item.description_html ? (
              <div
                className="text-sm text-gray-800 leading-relaxed [&_span]:text-gray-800 [&_span[style*='underline']]:text-blue-700 [&_span[style*='underline']]:underline"
                dangerouslySetInnerHTML={{ __html: item.description_html }}
              />
            ) : (
              <p className="text-sm text-gray-800 leading-relaxed">{item.description}</p>
            )}
          </div>

          {/* Links */}
          {item.links && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Links / Evidence</h3>
              <div className="text-sm text-blue-600 hover:underline">
                <a href={item.links} target="_blank" rel="noopener noreferrer">{item.links}</a>
              </div>
            </div>
          )}

          {/* Policy Tags */}
          {item.policy_tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Policy Tags</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {item.policy_tags.map((tag) => <TagPill key={tag} tag={tag} />)}
              </div>
              {policyDefs.length > 0 && (
                <div className="space-y-2">
                  {policyDefs.map((p) => p && (
                    <div key={p.tag} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                      <div className="text-xs font-medium text-gray-700">{p.tag}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{p.definition}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Traffic Light */}
          {item.traffic_light && tlInfo && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Traffic Light</h3>
              <TLPanel color={item.traffic_light} />
            </div>
          )}

          {/* Content Framework */}
          {item.content_framework && cfInfo && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Content Framework</h3>
              <CFPanel tier={item.content_framework} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reference drawer ─────────────────────────────────────────────────────────

function ReferenceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'tags' | 'traffic' | 'framework'>('traffic');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Reference Guide</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 pt-3 pb-2 flex gap-1 border-b border-gray-100">
          {(['traffic', 'framework', 'tags'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t === 'traffic' ? 'Traffic Light' : t === 'framework' ? 'Content Tiers' : 'Policy Tags'}
            </button>
          ))}
        </div>
        <div className="px-5 py-4 space-y-3">
          {tab === 'traffic' && TRAFFIC_LIGHT.map((tl) => <TLPanel key={tl.color} color={tl.color} />)}
          {tab === 'framework' && CONTENT_FRAMEWORK.map((cf) => <CFPanel key={cf.tier} tier={cf.tier} />)}
          {tab === 'tags' && POLICY_TAGS.map((p) => (
            <div key={p.tag} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-1">
                <TagPill tag={p.tag} />
              </div>
              <p className="text-xs text-gray-600 mb-1">{p.definition}</p>
              <p className="text-xs text-gray-400">Keywords: {p.keywords.join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccomplishmentsPage() {
  const [items, setItems] = useState<Accomplishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Accomplishment | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [refOpen, setRefOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'All' | 'Master' | 'AISF'>('All');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [tlFilter, setTlFilter] = useState('');
  const [cfFilter, setCfFilter] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [fellowFilter, setFellowFilter] = useState('');

  useEffect(() => {
    fetch('/api/accomplishments')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data);
        } else {
          setError(data?.error || 'Unexpected response from server');
        }
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  // Build filter option lists
  const types = useMemo(() => [...new Set(items.map((i) => i.type).filter(Boolean))].sort(), [items]);
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.policy_tags))].sort(), [items]);
  const cohorts = useMemo(() => [...new Set(items.map((i) => i.cohort).filter(Boolean))].sort(), [items]);
  const fellows = useMemo(() => [...new Set(items.map((i) => i.fellow_name).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (tabFilter !== 'All' && item.tab !== tabFilter) return false;
      if (typeFilter && item.type !== typeFilter) return false;
      if (tagFilter && !item.policy_tags.includes(tagFilter)) return false;
      if (tlFilter && item.traffic_light !== tlFilter) return false;
      if (cfFilter && item.content_framework !== cfFilter) return false;
      if (cohortFilter && item.cohort !== cohortFilter) return false;
      if (fellowFilter && item.fellow_name !== fellowFilter) return false;
      if (q && !item.fellow_name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q) && !item.type.toLowerCase().includes(q) && !item.office.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, tabFilter, typeFilter, tagFilter, tlFilter, cfFilter, cohortFilter, fellowFilter]);

  // Stats
  const greenCount = items.filter((i) => i.traffic_light === 'Green').length;
  const yellowCount = items.filter((i) => i.traffic_light === 'Yellow').length;
  const redCount = items.filter((i) => i.traffic_light === 'Red').length;

  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => i.policy_tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [items]);

  const hasFilters = !!(search || tabFilter !== 'All' || typeFilter || tagFilter || tlFilter || cfFilter || cohortFilter || fellowFilter);

  function clearFilters() {
    setSearch(''); setTabFilter('All'); setTypeFilter(''); setTagFilter('');
    setTlFilter(''); setCfFilter(''); setCohortFilter(''); setFellowFilter('');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">TC</div>
            <span className="font-semibold text-gray-900">TechCongress Fellows</span>
          </div>
          <nav className="flex gap-1">
            {([['Fellows', '/fellows'], ['Alumni', '/alumni'], ['Events', '/events'], ['Accomplishments', '/accomplishments']] as [string, string][]).map(([label, href]) => (
              <a key={href} href={href} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${href === '/accomplishments' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Reference Guide
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Accomplishments Matrix</h1>
          <p className="text-sm text-gray-500 mt-1">Track fellow and alumni accomplishments across policy areas, traffic light status, and content tiers.</p>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Accomplishments" value={items.length} />
            <StatCard label="Amplify Now" value={greenCount} sub="🟢 Green" />
            <StatCard label="Track & Revisit" value={yellowCount} sub="🟡 Yellow" />
            <StatCard label="Internal Only" value={redCount} sub="🔴 Red" />
          </div>
        )}

        {/* Top tags bar */}
        {!loading && topTags.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-6 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Tags:</span>
            {topTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                className={`flex items-center gap-1.5 transition-all ${tagFilter === tag ? 'ring-2 ring-offset-1 ring-gray-400 rounded-full' : ''}`}
              >
                <TagPill tag={tag} />
                <span className="text-xs text-gray-400">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input
                type="text"
                placeholder="Fellow name, description, type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sheet</label>
              <div className="flex gap-1">
                {(['All', 'Master', 'AISF'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTabFilter(t)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${tabFilter === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {t === 'Master' ? 'CIF' : t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Traffic Light</label>
              <select value={tlFilter} onChange={(e) => setTlFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All</option>
                <option value="Green">🟢 Green</option>
                <option value="Yellow">🟡 Yellow</option>
                <option value="Red">🔴 Red</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Content Tier</label>
              <select value={cfFilter} onChange={(e) => setCfFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All Tiers</option>
                <option value="Tier 1">Tier 1 — Impact Story</option>
                <option value="Tier 2">Tier 2 — Social Media</option>
                <option value="Tier 3">Tier 3 — Funder Report</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Policy Tag</label>
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All Tags</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All Types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fellow</label>
              <select value={fellowFilter} onChange={(e) => setFellowFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All Fellows</option>
                {fellows.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cohort</label>
              <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">All Cohorts</option>
                {cohorts.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 font-medium">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div className="text-sm text-gray-500 mb-3">
            {hasFilters ? `${filtered.length} of ${items.length} accomplishments` : `${items.length} accomplishments`}
          </div>
        )}

        {/* Table */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
            Loading accomplishments...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            {hasFilters ? 'No accomplishments match your filters.' : 'No accomplishments found.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
          {/* Top scrollbar mirror */}
          <div
            ref={topScrollRef}
            className="overflow-x-auto rounded-t-xl"
            onScroll={() => { if (tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current!.scrollLeft; }}
          >
            <div style={{ minWidth: 900, height: 1 }} />
          </div>
          <div
            ref={tableScrollRef}
            className="bg-white rounded-b-xl border border-gray-200 overflow-x-auto"
            onScroll={() => { if (topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current!.scrollLeft; }}
          >
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fellow</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Policy Tags</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Traffic Light</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Tier</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelected(item)}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs w-20">{item.date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.fellow_name}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        {item.cohort && <span>{item.cohort}</span>}
                        {item.cohort && item.tab && <span>·</span>}
                        {item.tab && <span className={item.tab === 'AISF' ? 'text-cyan-600' : 'text-gray-400'}>{item.tab === 'AISF' ? 'AISF' : 'CIF'}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{item.type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="line-clamp-2">{item.description}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.policy_tags.slice(0, 2).map((tag) => <TagPill key={tag} tag={tag} />)}
                        {item.policy_tags.length > 2 && (
                          <span className="text-xs text-gray-400 self-center">+{item.policy_tags.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TLBadge value={item.traffic_light} />
                    </td>
                    <td className="px-4 py-3">
                      <CFBadge value={item.content_framework} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {item.source_link && (
                          <a
                            href={item.source_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View source"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                        {item.links && (
                          <a
                            href={item.links}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                            title="View evidence"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Modals */}
      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
      <ReferenceDrawer open={refOpen} onClose={() => setRefOpen(false)} />
    </div>
  );
}
