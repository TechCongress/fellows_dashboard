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

/**
 * One free-text note per person, stored in the Notes column of their row on the
 * Career Pathways Engine tab. Deliberately an explicit Edit/Save rather than
 * save-on-blur: every save is a write to the spreadsheet, and Google's per-user
 * quota is low enough that autosaving each keystroke pause would burn it.
 */
function NotesBlock({
  notes,
  editable,
  onSave,
}: {
  notes: string;
  editable: boolean;
  onSave: (next: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The note can arrive after first render (the tab fetches), and can change
  // when another save reloads the record — keep the field in step unless the
  // user is mid-edit, where clobbering their typing would be worse.
  useEffect(() => { if (!editing) setDraft(notes); }, [notes, editing]);

  async function save() {
    setSaving(true);
    setError('');
    const err = await onSave(draft.trim());
    setSaving(false);
    if (err) { setError(err); return; }
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Notes
          <span className="ml-2 normal-case tracking-normal font-normal text-gray-300">career conversations, goals, context</span>
        </h3>
        {editable && !editing && (
          <button onClick={() => { setDraft(notes); setError(''); setEditing(true); }}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            {notes ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {!editing ? (
        notes ? (
          // whitespace-pre-wrap so paragraph breaks typed into the box survive.
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{notes}</p>
        ) : (
          <p className="text-sm text-gray-400">No notes yet.</p>
        )
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            placeholder="What are they hoping to do next? Who have they talked to? Anything worth remembering before the next check-in."
            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">{draft.length}/5000</span>
            <div className="flex gap-2">
              <button onClick={() => { setDraft(notes); setEditing(false); }}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
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
  const current = match.pathways || (a.realized_pathway ? [a.realized_pathway] : []);

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
          {current.map((p) => <PathwayChip key={p} tag={p} />)}
          <span className="text-[11px] text-gray-400 tabular-nums">match score {match.score}</span>
        </div>
      </div>

      {/* Where the pathway came from. A wrong derivation you can see is a quick
          fix; a wrong one you can't is silently bad matching. */}
      {match.provenance && (
        <p className="text-[11px] text-gray-400 leading-relaxed">
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${match.overridden ? 'bg-amber-500' : 'bg-blue-500'}`} />
          {match.overridden ? 'Pathway set by staff.' : match.provenance}
        </p>
      )}

      {a.policy_areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.policy_areas.map((t) => <PolicyAreaChip key={t} tag={t} />)}
        </div>
      )}

      {/* Past post-fellowship roles that match a target the current role doesn't.
          This is what the +1 partial credit is paying for, so it's named. */}
      {match.priorRoles && match.priorRoles.length > 0 && (
        <div className="text-xs text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-2">
          <span className="font-semibold text-gray-700">Prior roles include</span>{' '}
          {match.priorRoles.map((r, i) => (
            <span key={`${r.org}-${i}`}>
              {i > 0 && '; '}
              {r.title}{r.org ? ` at ${r.org}` : ''}
              {r.range ? ` (${r.range})` : ''}
              <span className="text-gray-400"> — {r.pathway}</span>
            </span>
          ))}
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

// ── Shared setup notice ──────────────────────────────────────────────────────

interface PathwaySetup {
  pathwayTab: boolean;
  careerHistoryTab?: boolean;
  missingColumns: string[];
  sheetName: string;
}

function SetupNotice({ setup }: { setup: PathwaySetup }) {
  if (!setup.pathwayTab) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        No <strong>{setup.sheetName}</strong> tab found in the spreadsheet. Add a tab with that exact name and the
        columns <em>ID, Name, Record Type, Cohort, Policy Issue Areas, Target Pathways, Pathway Override,
        Last Updated, Notes</em> to turn tagging on.
      </p>
    );
  }
  if (setup.missingColumns.length > 0) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        Missing column{setup.missingColumns.length > 1 ? 's' : ''} on <strong>{setup.sheetName}</strong>:{' '}
        <strong>{setup.missingColumns.join(', ')}</strong>. Add {setup.missingColumns.length > 1 ? 'them' : 'it'} to
        enable everything here.
      </p>
    );
  }
  return null;
}

/**
 * The sheet's multi-select dropdowns have no maximum of their own, so someone
 * can pick more than the cap. Saying which ones count beats letting the sheet
 * and the dashboard quietly disagree.
 */
function OverCapNotice({ fields }: { fields?: ('policy_areas' | 'target_pathways')[] }) {
  if (!fields || fields.length === 0) return null;
  const label = (f: string) =>
    f === 'policy_areas'
      ? `the first ${MAX_POLICY_AREAS} policy issue areas`
      : `the first ${MAX_TARGET_PATHWAYS} target pathways`;
  return (
    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      The sheet has more values selected than this dashboard uses. Only{' '}
      {fields.map(label).join(' and ')} count toward matching — the rest stay in the
      cell, untouched.
    </p>
  );
}

// ── Fellow pathway tab ───────────────────────────────────────────────────────

interface PathwayResponse {
  policy_areas: string[];
  target_pathways: string[];
  tagged: boolean;
  last_updated: string;
  notes: string;
  over_cap?: ('policy_areas' | 'target_pathways')[];
  alumni_total: number;
  alumni_tagged: number;
  alumni_with_history: number;
  matches: AlumniMatch[];
  setup: PathwaySetup;
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
      if (res.status === 429) {
        // Google's per-minute quota. Say what it is and what to do, rather than
        // "could not load", which reads like the data is missing.
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || 'Google is rate-limiting the spreadsheet. Wait about a minute and reopen this tab.');
        setLoading(false);
        return;
      }
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
          body: JSON.stringify({ id: fellow.id, policy_areas: nextAreas, target_pathways: nextTargets }),
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

  const saveNotes = useCallback(
    async (next: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/pathway', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fellow.id, notes: next }),
        });
        const json = await res.json();
        if (!res.ok) return json.error || 'Failed to save.';
        // Reflect it immediately rather than waiting on the reload, so the note
        // doesn't blink back to its old text for a beat.
        setData((cur) => (cur ? { ...cur, notes: next } : cur));
        load();
        return null;
      } catch {
        return 'Network error. Please try again.';
      }
    },
    [fellow.id, load]
  );

  if (fellow.status === 'Withdrew') {
    return <p className="text-sm text-gray-400">This fellow withdrew from the program — pathway tracking is not applicable.</p>;
  }

  const setup = data?.setup;
  const canEdit = !!setup?.pathwayTab && setup.missingColumns.length === 0;

  return (
    <div className="space-y-6">
      {loadError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>}
      {setup && <SetupNotice setup={setup} />}

      <TagBlock
        title="Policy Issue Areas"
        hint={`up to ${MAX_POLICY_AREAS}`}
        tags={areas}
        kind="policy"
        empty="Not tagged yet. These are typically captured shortly after a fellow settles into their office."
        editable={canEdit}
        max={MAX_POLICY_AREAS}
        onSave={(next) => savePathway(next, targets)}
      />

      <TagBlock
        title="Target Post-Fellowship Pathways"
        hint={`up to ${MAX_TARGET_PATHWAYS}`}
        tags={targets}
        kind="pathway"
        empty="No target pathways recorded yet."
        editable={canEdit}
        max={MAX_TARGET_PATHWAYS}
        onSave={(next) => savePathway(areas, next)}
      />

      <NotesBlock notes={data?.notes || ''} editable={canEdit} onSave={saveNotes} />

      <OverCapNotice fields={data?.over_cap} />

      {data?.last_updated && (
        <p className="text-[11px] text-gray-400 -mt-4">Tagging last updated {data.last_updated}</p>
      )}

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
            No strong matches yet. {data.alumni_tagged} of {data.alumni_total} alumni are tagged and{' '}
            {data.alumni_with_history} have career history — matching improves as both grow.
          </p>
        )}

        {!loading && data && data.matches.length > 0 && (
          <div className="space-y-2.5">
            {data.matches.map((m) => <MatchCard key={m.alumni.id} fellow={fellow} match={m} senderName={senderName} />)}
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Scored on shared policy areas (+2 each), a current pathway matching a target (+3), a sector match (+2),
              and a past post-fellowship pathway matching a target (+1). Alumni marked &ldquo;do not contact&rdquo; are
              excluded. Pathways are read from each alum&rsquo;s career history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alumni pathway tab ───────────────────────────────────────────────────────

interface AlumniPathwayResponse {
  setup: PathwaySetup;
  record: {
    policy_areas: string[];
    pathway_override: string;
    last_updated: string;
    notes: string;
    over_cap?: ('policy_areas' | 'target_pathways')[];
  } | null;
  person_type?: 'alumni' | 'unknown';
  has_history?: boolean;
  careerHistoryAvailable: boolean;
  derivation: {
    pathways: string[];
    priorPathways: string[];
    overridden: boolean;
    explanation: string;
    wouldHaveBeen: { pathway: string; why: string } | null;
    prior: { pathway: string; title: string; org: string }[];
  } | null;
}

export function AlumniPathwayTab({
  alumni,
  onAlumniUpdate,
}: {
  alumni: Alumni;
  onAlumniUpdate?: (updated: Alumni) => void;
}) {
  const [data, setData] = useState<AlumniPathwayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<string[]>(alumni.policy_areas || []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pathway?id=${encodeURIComponent(alumni.id)}`);
      const json: AlumniPathwayResponse = await res.json();
      setData(json);
      if (json.record) setAreas(json.record.policy_areas || []);
    } catch {
      /* leave editing disabled */
    }
    setLoading(false);
  }, [alumni.id]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(
    async (patch: { policy_areas?: string[]; pathway_override?: string; notes?: string }): Promise<string | null> => {
      try {
        const res = await fetch('/api/pathway', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: alumni.id, ...patch }),
        });
        const json = await res.json();
        if (!res.ok) return json.error || 'Failed to save.';
        if (patch.policy_areas) {
          setAreas(patch.policy_areas);
          onAlumniUpdate?.({ ...alumni, policy_areas: patch.policy_areas });
        }
        load();
        return null;
      } catch {
        return 'Network error. Please try again.';
      }
    },
    [alumni, onAlumniUpdate, load]
  );

  const setup = data?.setup;
  const canEdit = !!setup?.pathwayTab && setup.missingColumns.length === 0;
  const d = data?.derivation;

  return (
    <div className="space-y-6">
      {setup && <SetupNotice setup={setup} />}

      <TagBlock
        title="Policy Issue Areas"
        hint={`up to ${MAX_POLICY_AREAS}`}
        tags={areas}
        kind="policy"
        empty="Not tagged yet. Tagging alumni is what makes fellow↔alumni matching work."
        editable={canEdit}
        max={MAX_POLICY_AREAS}
        onSave={(next) => save({ policy_areas: next })}
      />

      {/* Realized pathway is DERIVED, never stored — it can't go stale, because
          it's read from the career history that's already kept current. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Realized Pathway</h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
            d?.overridden ? 'text-amber-700 border-amber-200 bg-amber-50' : 'text-gray-400 border-gray-200'}`}>
            {d?.overridden ? 'override' : 'derived'}
          </span>
        </div>

        {loading && <p className="text-sm text-gray-400">Reading career history…</p>}

        {!loading && d && d.pathways.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {d.pathways.map((p) => <PathwayChip key={p} tag={p} />)}
            </div>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              {d.overridden
                ? <>Set by staff.{d.wouldHaveBeen?.pathway ? <> Would have derived <strong>{d.wouldHaveBeen.pathway}</strong> — {d.wouldHaveBeen.why}</> : ' Nothing would have derived automatically.'}</>
                : d.explanation}
            </p>
          </>
        )}

        {!loading && d && d.pathways.length === 0 && !data?.has_history && (
          <p className="text-sm text-gray-400">
            No career history recorded yet. Add their roles on the <em>Background &amp; Career History</em> tab
            and their pathway will be read from those.
          </p>
        )}

        {!loading && d && d.pathways.length === 0 && data?.has_history && (
          <p className="text-sm text-gray-400">
            No pathway could be read from their career history. Add a role marked <em>Current</em> on the
            Background &amp; Career History tab, or set an override below.
          </p>
        )}

        {!loading && !d && (
          <p className="text-sm text-gray-400">
            Couldn&rsquo;t find this person on the Alumni tab, so there&rsquo;s nothing to derive a pathway
            from. Check that their <strong>ID</strong> on the Alumni tab hasn&rsquo;t changed or been
            duplicated.
          </p>
        )}
      </div>

      {!loading && d && d.prior.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Also held since the fellowship</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {d.priorPathways.map((p) => <PathwayChip key={p} tag={p} />)}
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            {d.prior.map((p, i) => (
              <span key={`${p.org}-${i}`}>{i > 0 && '; '}{p.title}{p.org ? ` at ${p.org}` : ''} — {p.pathway}</span>
            ))}
            . These earn partial credit when a fellow targets one of them.
          </p>
        </div>
      )}

      <TagBlock
        title="Pathway Override"
        hint="usually blank"
        tags={data?.record?.pathway_override ? [data.record.pathway_override] : []}
        kind="pathway"
        empty="Blank — the pathway above is read from their career history. Set this only to correct a wrong derivation."
        editable={canEdit}
        max={1}
        singleSelect
        onSave={(next) => save({ pathway_override: next[0] || '' })}
      />

      <NotesBlock
        notes={data?.record?.notes || ''}
        editable={canEdit}
        onSave={(next) => save({ notes: next })}
      />

      <OverCapNotice fields={data?.record?.over_cap} />

      {data?.record?.last_updated && (
        <p className="text-[11px] text-gray-400 -mt-4">Tagging last updated {data.record.last_updated}</p>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed">
        These tags feed the alumni recommendations on each current fellow&rsquo;s Career Pathway tab. The more alumni
        are tagged — and the more complete their career history — the better those recommendations get.
      </p>
    </div>
  );
}
