'use client';

/**
 * Career Pathway Engine UI — policy issue area / pathway tag chips, the tag
 * pickers, and the fellow + alumni pathway panels (including ranked alumni
 * recommendations and the intro-email draft).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alumni, AlumniMatch, Fellow } from '@/types';
import {
  MAX_POLICY_AREAS,
  MAX_TARGET_PATHWAYS,
  PATHWAY_TAGS,
  POLICY_AREA_CATEGORIES,
  draftAsText,
  introDraft,
  mailtoHref,
  pathwayColors,
  policyAreaColors,
} from '@/lib/career-pathway';

// ── Chips ────────────────────────────────────────────────────────────────────

export function PolicyAreaChip({ tag }: { tag: string }) {
  const c = policyAreaColors(tag);
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{tag}</span>;
}

export function PathwayChip({ tag }: { tag: string }) {
  const c = pathwayColors(tag);
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{tag}</span>;
}

function ChipRow({ tags, kind, empty }: { tags: string[]; kind: 'policy' | 'pathway'; empty: string }) {
  if (!tags.length) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (kind === 'policy' ? <PolicyAreaChip key={t} tag={t} /> : <PathwayChip key={t} tag={t} />))}
    </div>
  );
}

export function SetupNote({ tab, column }: { tab: string; column: string }) {
  return (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
      Add a column named <strong>{column}</strong> to the <strong>{tab}</strong> tab of the spreadsheet to turn this on.
      Until then it stays read-only and empty.
    </p>
  );
}

// ── Pickers ──────────────────────────────────────────────────────────────────

function PolicyAreaPicker({
  selected,
  onToggle,
  max = MAX_POLICY_AREAS,
}: { selected: string[]; onToggle: (tag: string) => void; max?: number }) {
  const full = selected.length >= max;
  return (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {POLICY_AREA_CATEGORIES.map((cat) => (
        <div key={cat.group}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{cat.group}</p>
          <div className="flex flex-wrap gap-1.5">
            {cat.tags.map((tag) => {
              const on = selected.includes(tag);
              const disabled = !on && full;
              const c = policyAreaColors(tag);
              return (
                <button key={tag} type="button" disabled={disabled} onClick={() => onToggle(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                    ${on ? `${c.bg} ${c.text} border-transparent ring-1 ring-gray-900/20`
                         : disabled ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {on && '✓ '}{tag}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PathwayPicker({
  selected,
  onToggle,
  max,
}: { selected: string[]; onToggle: (tag: string) => void; max: number }) {
  const full = selected.length >= max;
  return (
    <div className="space-y-1.5">
      {PATHWAY_TAGS.map((p) => {
        const on = selected.includes(p.tag);
        const disabled = !on && full;
        return (
          <button key={p.tag} type="button" disabled={disabled} onClick={() => onToggle(p.tag)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors
              ${on ? 'bg-gray-900 border-gray-900' : disabled ? 'bg-white border-gray-100 cursor-not-allowed' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
            <span className={`text-sm font-medium ${on ? 'text-white' : disabled ? 'text-gray-300' : 'text-gray-900'}`}>
              {on && '✓ '}{p.tag}
            </span>
            <span className={`block text-xs mt-0.5 ${on ? 'text-gray-300' : disabled ? 'text-gray-300' : 'text-gray-500'}`}>
              {p.definition}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Editable tag block ───────────────────────────────────────────────────────

function TagBlock({
  title,
  hint,
  tags,
  kind,
  empty,
  editable,
  disabledNote,
  onSave,
  max,
  singleSelect,
}: {
  title: string;
  hint?: string;
  tags: string[];
  kind: 'policy' | 'pathway';
  empty: string;
  editable: boolean;
  disabledNote?: React.ReactNode;
  onSave: (next: string[]) => Promise<string | null>;  // resolves to an error message, or null
  max: number;
  singleSelect?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(tag: string) {
    setDraft((cur) => {
      if (cur.includes(tag)) return cur.filter((t) => t !== tag);
      if (singleSelect) return [tag];
      if (cur.length >= max) return cur;
      return [...cur, tag];
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    const err = await onSave(draft);
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {title}
          {hint && <span className="ml-2 normal-case tracking-normal font-normal text-gray-300">{hint}</span>}
        </h3>
        {editable && !editing && (
          <button onClick={() => { setDraft(tags); setError(''); setEditing(true); }}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            Edit
          </button>
        )}
      </div>

      {!editable && disabledNote}

      {!editing ? (
        <ChipRow tags={tags} kind={kind} empty={empty} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-xs text-gray-500">
            {singleSelect ? 'Pick one.' : `Pick up to ${max}.`} Selected {draft.length}/{max}.
          </p>
          {kind === 'policy'
            ? <PolicyAreaPicker selected={draft} onToggle={toggle} max={max} />
            : <PathwayPicker selected={draft} onToggle={toggle} max={max} />}
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alumni match card ────────────────────────────────────────────────────────

function MatchCard({ fellow, match, senderName }: { fellow: Fellow; match: AlumniMatch; senderName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const a = match.alumni;
  const draft = introDraft(fellow, a, match.overlap, senderName);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draftAsText(draft));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{a.name}</p>
          <p className="text-xs text-gray-500">{a.current_role || '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {a.realized_pathway && <PathwayChip tag={a.realized_pathway} />}
          <span className="text-[11px] text-gray-400 tabular-nums">match score {match.score}</span>
        </div>
      </div>
      {a.policy_areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.policy_areas.map((t) => <PolicyAreaChip key={t} tag={t} />)}
        </div>
      )}
      <p className="text-xs text-gray-500">Match: {match.reason}</p>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <button onClick={() => setOpen((o) => !o)}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
          ✉️ {open ? 'Hide' : 'Draft'} Intro Email
        </button>
        {a.email && (
          <a href={mailtoHref(a.email, draft)}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            Open in email client
          </a>
        )}
      </div>
      {open && (
        <div className="space-y-1.5">
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
            {draftAsText(draft)}
          </div>
          <button onClick={copy} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
            {copied ? '✓ Copied' : 'Copy draft'}
          </button>
          <p className="text-[11px] text-gray-400">Nothing is sent automatically — review and send this yourself.</p>
        </div>
      )}
    </div>
  );
}

// ── Fellow pathway tab ───────────────────────────────────────────────────────

interface PathwayResponse {
  policy_areas: string[];
  target_pathways: string[];
  tagged: boolean;
  alumni_total: number;
  alumni_tagged: number;
  matches: AlumniMatch[];
  setup: {
    fellowsPolicyAreas: boolean;
    fellowsTargetPathways: boolean;
    alumniPolicyAreas: boolean;
    alumniRealizedPathway: boolean;
    careerHistoryTab: boolean;
  };
}

export function FellowPathwayTab({
  fellow,
  senderName = '',
  onFellowUpdate,
}: {
  fellow: Fellow;
  senderName?: string;
  onFellowUpdate?: (updated: Fellow) => void;
}) {
  const [data, setData] = useState<PathwayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [areas, setAreas] = useState<string[]>(fellow.policy_areas || []);
  const [targets, setTargets] = useState<string[]>(fellow.target_pathways || []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fellows/${encodeURIComponent(fellow.id)}/pathway`);
      if (!res.ok) throw new Error('failed');
      const json: PathwayResponse = await res.json();
      setData(json);
      setAreas(json.policy_areas || []);
      setTargets(json.target_pathways || []);
    } catch {
      setLoadError('Could not load pathway data.');
    }
    setLoading(false);
  }, [fellow.id]);

  useEffect(() => { load(); }, [load]);

  const savePathway = useCallback(
    async (nextAreas: string[], nextTargets: string[]): Promise<string | null> => {
      try {
        const res = await fetch('/api/pathway', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'fellow', id: fellow.id, policy_areas: nextAreas, target_pathways: nextTargets }),
        });
        const json = await res.json();
        if (!res.ok) return json.error || 'Failed to save.';
        setAreas(nextAreas);
        setTargets(nextTargets);
        onFellowUpdate?.({ ...fellow, policy_areas: nextAreas, target_pathways: nextTargets });
        load();
        return null;
      } catch {
        return 'Network error. Please try again.';
      }
    },
    [fellow, onFellowUpdate, load]
  );

  if (fellow.status === 'Withdrew') {
    return <p className="text-sm text-gray-400">This fellow withdrew from the program — pathway tracking is not applicable.</p>;
  }

  const setup = data?.setup;
  const canEditAreas = setup ? setup.fellowsPolicyAreas : false;
  const canEditTargets = setup ? setup.fellowsTargetPathways : false;

  return (
    <div className="space-y-6">
      {loadError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>}

      <TagBlock
        title="Policy Issue Areas"
        hint={`up to ${MAX_POLICY_AREAS}`}
        tags={areas}
        kind="policy"
        empty="Not tagged yet. These are typically captured shortly after a fellow settles into their office."
        editable={canEditAreas}
        disabledNote={setup && !canEditAreas ? <div className="mb-2"><SetupNote tab="Fellows" column="Policy Issue Areas" /></div> : null}
        max={MAX_POLICY_AREAS}
        onSave={(next) => savePathway(next, targets)}
      />

      <TagBlock
        title="Target Post-Fellowship Pathways"
        hint={`up to ${MAX_TARGET_PATHWAYS}`}
        tags={targets}
        kind="pathway"
        empty="No target pathways recorded yet."
        editable={canEditTargets}
        disabledNote={setup && !canEditTargets ? <div className="mb-2"><SetupNote tab="Fellows" column="Target Pathways" /></div> : null}
        max={MAX_TARGET_PATHWAYS}
        onSave={(next) => savePathway(areas, next)}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recommended Alumni Connections</h3>
          {data && <span className="text-xs text-gray-400">{data.matches.length} match{data.matches.length === 1 ? '' : 'es'}</span>}
        </div>

        {loading && <p className="text-sm text-gray-400">Scoring alumni…</p>}

        {!loading && data && !data.tagged && (
          <p className="text-sm text-gray-400">
            Matching starts once this fellow has policy issue areas or target pathways recorded.
          </p>
        )}

        {!loading && data && data.tagged && data.matches.length === 0 && (
          <p className="text-sm text-gray-400">
            No strong matches yet. {data.alumni_tagged} of {data.alumni_total} alumni are tagged — matching improves as more
            alumni get policy areas and a realized pathway.
          </p>
        )}

        {!loading && data && data.matches.length > 0 && (
          <div className="space-y-2.5">
            {data.matches.map((m) => <MatchCard key={m.alumni.id} fellow={fellow} match={m} senderName={senderName} />)}
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Scored on shared policy areas (+2 each), an exact realized-pathway match (+3), and a sector match (+2).
              Alumni marked &ldquo;do not contact&rdquo; are excluded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alumni pathway tab ───────────────────────────────────────────────────────

export function AlumniPathwayTab({
  alumni,
  onAlumniUpdate,
}: {
  alumni: Alumni;
  onAlumniUpdate?: (updated: Alumni) => void;
}) {
  const [areas, setAreas] = useState<string[]>(alumni.policy_areas || []);
  const [realized, setRealized] = useState<string>(alumni.realized_pathway || '');
  const [setup, setSetup] = useState<PathwayResponse['setup'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pathway')
      .then((r) => r.json())
      .then((s) => { if (!cancelled) setSetup(s); })
      .catch(() => { /* leave editing disabled */ });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(
    async (nextAreas: string[], nextRealized: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/pathway', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'alumni', id: alumni.id, policy_areas: nextAreas, realized_pathway: nextRealized }),
        });
        const json = await res.json();
        if (!res.ok) return json.error || 'Failed to save.';
        setAreas(nextAreas);
        setRealized(nextRealized);
        onAlumniUpdate?.({ ...alumni, policy_areas: nextAreas, realized_pathway: nextRealized });
        return null;
      } catch {
        return 'Network error. Please try again.';
      }
    },
    [alumni, onAlumniUpdate]
  );

  return (
    <div className="space-y-6">
      <TagBlock
        title="Policy Issue Areas"
        hint={`up to ${MAX_POLICY_AREAS}`}
        tags={areas}
        kind="policy"
        empty="Not tagged yet. Tagging alumni is what makes fellow↔alumni matching work."
        editable={!!setup?.alumniPolicyAreas}
        disabledNote={setup && !setup.alumniPolicyAreas ? <div className="mb-2"><SetupNote tab="Alumni" column="Policy Issue Areas" /></div> : null}
        max={MAX_POLICY_AREAS}
        onSave={(next) => save(next, realized)}
      />

      <TagBlock
        title="Realized Pathway"
        hint="pick one"
        tags={realized ? [realized] : []}
        kind="pathway"
        empty="No realized pathway recorded yet."
        editable={!!setup?.alumniRealizedPathway}
        disabledNote={setup && !setup.alumniRealizedPathway ? <div className="mb-2"><SetupNote tab="Alumni" column="Realized Pathway" /></div> : null}
        max={1}
        singleSelect
        onSave={(next) => save(areas, next[0] || '')}
      />

      <p className="text-[11px] text-gray-400 leading-relaxed">
        These tags feed the alumni recommendations on each current fellow&rsquo;s Career Pathway tab. The more alumni are
        tagged, the better those recommendations get.
      </p>
    </div>
  );
}
