/**
 * Career Pathway Engine
 * ─────────────────────
 * Policy issue areas, target/realized post-fellowship pathways, and the
 * alumni-matching logic that ranks alumni against a given fellow.
 *
 * IMPORTANT — two separate taxonomies, do not conflate:
 *   • The Accomplishments Matrix has its own 11-tag policy taxonomy. It is a
 *     different system with a different owner. Nothing here reads from it.
 *   • POLICY_AREAS below (32 tags, 8 categories) is the Career Pathway
 *     taxonomy, used for Fellows and Alumni tagging only. It is backed by its
 *     own Google Sheets column and its own dropdown source range.
 */

import { Alumni, Fellow, CareerPhase, AlumniMatch } from '@/types';

// ── Tag limits ───────────────────────────────────────────────────────────────

export const MAX_POLICY_AREAS = 3;      // fellows and alumni both capped at 3
export const MAX_TARGET_PATHWAYS = 2;

// ── Sectors ──────────────────────────────────────────────────────────────────
// Declared up here because PATHWAY_TO_SECTORS below is initialised at module
// load and references SECTOR_POLICY — a `const` declared further down would
// still be in its temporal dead zone at that point and throw.

/**
 * The user-visible Sector taxonomy, shared by the spreadsheet and the app.
 * Import SECTOR_POLICY rather than writing the string literal anywhere — the
 * label has been reworded twice, and every hardcoded copy is a place the next
 * rewording can silently miss.
 */
export const SECTOR_POLICY = 'Policy/Think Tank/Nonprofit';
// "Other" is a real, selectable sector — a catch-all for roles that genuinely
// don't fit the four. It deliberately has no entry in PATHWAY_TO_SECTORS below,
// so it never contributes a sector bonus to matching: "unclassifiable" isn't
// evidence of a fit with any particular target pathway.
export const CAREER_SECTORS = ['Government', SECTOR_POLICY, 'Private', 'Academia', 'Other'];

/**
 * Sector labels that have been renamed. Values already sitting in the
 * spreadsheet are mapped to the current label on read, so a rename doesn't
 * require migrating the sheet before the dashboard is correct — and
 * half-migrated data behaves the same as fully-migrated data.
 */
const LEGACY_SECTORS: Record<string, string> = {
  'Policy/Think Tank': SECTOR_POLICY,            // the original label
  'Policy/Nonprofit/Think Tank': SECTOR_POLICY,  // briefly used on 2026-08-18
};

export function normalizeSector(value: string): string {
  const v = (value || '').trim();
  return LEGACY_SECTORS[v] || v;
}

/**
 * Pathway tags that have been renamed. Same contract as LEGACY_SECTORS: a value
 * already in the spreadsheet reads as the current label, so the sheet and the
 * dropdown can be migrated whenever it's convenient rather than in lockstep
 * with the code.
 */
const LEGACY_PATHWAYS: Record<string, string> = {
  'Civil Society / Nonprofit': 'Civil Society/Nonprofit',  // spaced form, used until 2026-08-26
};

export function normalizePathway(value: string): string {
  const v = (value || '').trim();
  return LEGACY_PATHWAYS[v] || v;
}

// ── Policy issue areas (34 tags / 8 categories) ────────────────────────────────────

export const POLICY_AREA_CATEGORIES: { group: string; tags: string[] }[] = [
  { group: 'Technology & Innovation', tags: ['Artificial Intelligence', 'Algorithmic Bias & Accountability', 'Cybersecurity', 'Data Privacy', 'Telecommunications & Broadband', 'Semiconductor & Supply Chain', 'Quantum Computing', 'Digital Infrastructure', 'Open Source & Software Policy'] },
  { group: 'Health & Science', tags: ['Digital Health & Wearables', 'Biotech & Life Sciences', 'Public Health', 'Science Policy & R&D Funding', 'Space Policy'] },
  { group: 'National Security & Defense', tags: ['Defense Technology', 'Intelligence & Surveillance', 'Election Security', 'Critical Infrastructure Protection'] },
  { group: 'Economy & Labor', tags: ['Future of Work & Automation', 'Financial Technology', 'Antitrust & Big Tech Accountability', 'Workforce Development'] },
  // Broad catch-alls have been deliberately pruned ("Climate Technology",
  // "Emerging Technologies"): a tag sitting above its own subsets splits tagging
  // between the general and the specific, so two fellows doing the same work end
  // up tagged differently and never match each other.
  { group: 'Environment & Energy', tags: ['Clean Energy', 'Nuclear Energy', 'Energy & Grid Infrastructure'] },
  { group: 'Governance & Democracy', tags: ['Government Innovation', 'Disinformation & Media Policy'] },
  { group: 'Social Policy', tags: ['Education Technology', 'Criminal Justice & Technology', 'Accessibility & Disability Policy', 'Children\'s Safety & Social Media'] },
  { group: 'International', tags: ['US-China Tech Competition', 'Trade & Export Controls', 'International Cyber Policy'] },
];

export const POLICY_AREAS: string[] = POLICY_AREA_CATEGORIES.flatMap((c) => c.tags);

/** Rotating chip palette, keyed by the tag's index in the flat taxonomy. */
const TAG_PALETTE = [
  { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  { bg: 'bg-teal-100', text: 'text-teal-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
  { bg: 'bg-pink-100', text: 'text-pink-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-lime-100', text: 'text-lime-800' },
  { bg: 'bg-violet-100', text: 'text-violet-800' },
  { bg: 'bg-sky-100', text: 'text-sky-800' },
  { bg: 'bg-rose-100', text: 'text-rose-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
];

export function policyAreaColors(tag: string): { bg: string; text: string } {
  const i = POLICY_AREAS.indexOf(tag);
  if (i < 0) return { bg: 'bg-gray-100', text: 'text-gray-700' };
  return TAG_PALETTE[i % TAG_PALETTE.length];
}

// ── Target / realized pathways (8 fixed tags) ────────────────────────────────

export interface PathwayTag {
  tag: string;
  definition: string;
  bg: string;
  text: string;
}

export const PATHWAY_TAGS: PathwayTag[] = [
  { tag: 'Stay in Congress', definition: 'Continues on the Hill — personal office, committee, or leadership staff.', bg: 'bg-blue-100', text: 'text-blue-800' },
  { tag: 'Think Tank', definition: 'Policy research role at a think tank or research institute.', bg: 'bg-purple-100', text: 'text-purple-800' },
  { tag: 'Executive Branch', definition: 'Agency role, political appointment, or detail in the executive branch.', bg: 'bg-cyan-100', text: 'text-cyan-800' },
  { tag: 'Law School', definition: 'Pursuing a JD or other graduate legal study.', bg: 'bg-amber-100', text: 'text-amber-800' },
  { tag: 'Private Sector', definition: 'Industry role — engineering, product, or government affairs at a company.', bg: 'bg-orange-100', text: 'text-orange-800' },
  { tag: 'Academia', definition: 'Faculty, research, or graduate study track.', bg: 'bg-teal-100', text: 'text-teal-800' },
  { tag: 'Elected Office', definition: 'Running for or serving in elected office.', bg: 'bg-rose-100', text: 'text-rose-800' },
  { tag: 'Civil Society/Nonprofit', definition: 'Advocacy, civic tech, or nonprofit policy role.', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  { tag: 'State & Local Government', definition: 'Non-elected role in state, city, or county government \u2014 agency, governor\u2019s or mayor\u2019s office, or legislative staff.', bg: 'bg-indigo-100', text: 'text-indigo-800' },
];

export const PATHWAY_NAMES: string[] = PATHWAY_TAGS.map((p) => p.tag);

export function pathwayColors(tag: string): { bg: string; text: string } {
  const p = PATHWAY_TAGS.find((x) => x.tag === tag);
  return p ? { bg: p.bg, text: p.text } : { bg: 'bg-gray-100', text: 'text-gray-700' };
}

// ── Matching ─────────────────────────────────────────────────────────────────

/**
 * A target pathway implies a broad sector, used as a second matching signal
 * that STACKS with an exact realized-pathway match.
 *
 * The Congress-vs-Executive-Branch split below exists ONLY inside this scoring
 * logic. It is derived on the fly from the existing `currently_on_hill` flag
 * and must never surface in the UI — badges, filters, and the "By Sector" pie
 * chart all keep a single "Government" bucket. (Explicit product decision.)
 */
const PATHWAY_TO_SECTORS: Record<string, string[]> = {
  'Stay in Congress': ['Government: Congress'],
  'Executive Branch': ['Government: Executive Branch'],
  'Elected Office': ['Government: Congress'],
  'Think Tank': [SECTOR_POLICY],
  'Civil Society/Nonprofit': [SECTOR_POLICY],
  'Private Sector': ['Private'],
  'Academia': ['Academia'],
  'Law School': [],
  // Deliberately empty, for the same reason as Law School. The Sector taxonomy
  // has no state/local bucket: a state or city employee is recorded as
  // "Government", which the scoring split reads as federal Executive Branch
  // because they aren't on the Hill. Awarding the sector bonus here would hand
  // +2 to every federal agency alum for a fellow aiming at city hall. An exact
  // pathway match still scores +3, which is the signal that actually means
  // something.
  'State & Local Government': [],
};

function targetSectorsOf(targetPathways: string[]): string[] {
  const set = new Set<string>();
  for (const p of targetPathways) {
    for (const s of PATHWAY_TO_SECTORS[p] || []) set.add(s);
  }
  return [...set];
}

/**
 * Matching-only sector refinement. Does not change `alumni.sector` anywhere.
 * Normalises first so a renamed label reaching this function from anywhere —
 * not just via fetchAlumni — still scores correctly.
 */
function effectiveSector(a: Alumni): string {
  const sector = normalizeSector(a.sector);
  if (sector === 'Government') {
    return a.currently_on_hill ? 'Government: Congress' : 'Government: Executive Branch';
  }
  return sector;
}

export const SCORE_WEIGHTS = { policyArea: 2, exactPathway: 3, sector: 2, priorPathway: 1 };

/**
 * Score one alum against one fellow. Three independent signals, summed:
 *   +2 per shared policy issue area
 *   +3 for an exact realized-pathway ↔ target-pathway match
 *   +2 for a sector match (stacks with the pathway match; the alum still
 *      appears exactly once in the ranked list)
 * Alumni marked "do not contact" are excluded entirely.
 */
/**
 * Score one alum against one fellow. Four independent signals, summed:
 *   +2 per shared policy issue area
 *   +3 a current pathway is one of the fellow's targets
 *   +2 sector match (stacks with the pathway match)
 *   +1 a PAST post-fellowship pathway is one of the targets
 *
 * The +1 is partial credit: an alum who spent two years at CISA before moving
 * to a think tank is still worth meeting for a fellow targeting the executive
 * branch — just not as much as someone there now. Pre-fellowship history never
 * counts; it describes who someone was before TechCongress.
 *
 * `resolved` carries pathways derived from career history. When omitted the
 * function falls back to the alum's stored `realized_pathway`, so callers that
 * haven't been migrated still work.
 */
export function matchScore(
  fellowAreas: string[],
  fellowTargets: string[],
  a: Alumni,
  resolved?: { pathways?: string[]; priorPathways?: string[] }
): Omit<AlumniMatch, 'alumni' | 'reason'> {
  if (a.contact === false) {
    return { score: -1, overlap: [], pathwayMatch: false, sectorMatch: false, priorMatch: false };
  }
  const targets = fellowTargets || [];
  const current = resolved?.pathways?.length
    ? resolved.pathways
    : (a.realized_pathway ? [a.realized_pathway] : []);
  const prior = (resolved?.priorPathways || []).filter((p) => !current.includes(p));

  const overlap = (fellowAreas || []).filter((t) => (a.policy_areas || []).includes(t));
  const pathwayMatch = current.some((p) => targets.includes(p));
  const sectorMatch = !!a.sector && targetSectorsOf(targets).includes(effectiveSector(a));
  // Only pays out when the current role didn't already match — otherwise an alum
  // would be paid twice for the same target.
  const priorMatch = !pathwayMatch && prior.some((p) => targets.includes(p));

  const score =
    overlap.length * SCORE_WEIGHTS.policyArea +
    (pathwayMatch ? SCORE_WEIGHTS.exactPathway : 0) +
    (sectorMatch ? SCORE_WEIGHTS.sector : 0) +
    (priorMatch ? SCORE_WEIGHTS.priorPathway : 0);
  return { score, overlap, pathwayMatch, sectorMatch, priorMatch };
}

function matchReason(
  m: Omit<AlumniMatch, 'alumni' | 'reason'>,
  a: Alumni,
  resolved?: { pathways?: string[]; priorPathways?: string[] }
): string {
  const bits: string[] = [];
  if (m.overlap.length) bits.push(`shares ${m.overlap.join(' & ')}`);
  const current = resolved?.pathways?.length ? resolved.pathways : (a.realized_pathway ? [a.realized_pathway] : []);
  if (m.pathwayMatch) bits.push(`now in ${current.join(' & ')}`);
  if (m.sectorMatch) bits.push(`same sector: ${a.sector}`);
  if (m.priorMatch) bits.push(`previously in ${(resolved?.priorPathways || []).join(' & ')}`);
  return bits.join(' · ') || 'shared policy interest';
}

/** Rank alumni for a fellow, highest score first. Returns [] if untagged. */
export function rankAlumni(
  fellowAreas: string[],
  fellowTargets: string[],
  alumni: Alumni[],
  limit = 4,
  resolve?: (a: Alumni) => { pathways?: string[]; priorPathways?: string[] } | undefined
): AlumniMatch[] {
  if (!fellowAreas?.length && !fellowTargets?.length) return [];
  return alumni
    .map((a) => {
      const resolved = resolve?.(a);
      const m = matchScore(fellowAreas, fellowTargets, a, resolved);
      return {
        alumni: a,
        ...m,
        reason: matchReason(m, a, resolved),
        pathways: resolved?.pathways,
        priorPathways: resolved?.priorPathways,
      };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.alumni.name.localeCompare(y.alumni.name))
    .slice(0, limit);
}

// ── Intro email draft ────────────────────────────────────────────────────────

/**
 * Deterministic template — nothing is auto-sent. The UI surfaces this as a
 * copy-to-clipboard draft for a staff member to review and send manually.
 */
export function introDraft(
  fellow: Pick<Fellow, 'name' | 'office' | 'policy_areas' | 'target_pathways'>,
  alum: Pick<Alumni, 'name' | 'current_role'>,
  overlap: string[],
  senderName = ''
): { subject: string; body: string } {
  const topic = overlap[0] || (fellow.policy_areas || [])[0] || 'tech policy';
  const target = (fellow.target_pathways || [])[0] || 'their next step';
  const firstName = alum.name.split(' ')[0];
  const subject = `Introduction — ${fellow.name} (current TC Fellow) x ${alum.name}`;
  const body = [
    `Hi ${firstName},`,
    ``,
    `Hope you're doing well! I wanted to connect you with ${fellow.name}, a current TechCongress fellow placed at ${fellow.office || 'the Hill'}, who's exploring a path toward ${target} after the fellowship and is especially focused on ${topic}.`,
    ``,
    `Given your work as ${alum.current_role || 'a TechCongress alum'}, I thought the two of you would have a lot to talk about. Would you be open to a short call in the next few weeks?`,
    ``,
    `Thanks so much,`,
    senderName || '',
  ].join('\n');
  return { subject, body };
}

export function draftAsText(d: { subject: string; body: string }): string {
  return `Subject: ${d.subject}\n\n${d.body}`;
}

export function mailtoHref(email: string, d: { subject: string; body: string }): string {
  return `mailto:${email}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}

// ── Career history ───────────────────────────────────────────────────────────

export const CAREER_PHASES: CareerPhase[] = ['Pre-Fellowship', 'Fellowship', 'Post-Fellowship', 'Current'];

// (Sector constants are declared near the top of this file — see the note there.)

export const PHASE_STYLES: Record<CareerPhase, { dot: string; chipBg: string; chipText: string; cardBg: string; cardBorder: string }> = {
  'Pre-Fellowship':  { dot: 'bg-gray-400',    chipBg: 'bg-gray-200',   chipText: 'text-gray-600',   cardBg: 'bg-gray-50',  cardBorder: 'border-gray-200' },
  'Fellowship':      { dot: 'bg-violet-600',  chipBg: 'bg-violet-100', chipText: 'text-violet-700', cardBg: 'bg-gray-50',  cardBorder: 'border-gray-200' },
  'Post-Fellowship': { dot: 'bg-blue-500',    chipBg: 'bg-blue-100',   chipText: 'text-blue-700',   cardBg: 'bg-gray-50',  cardBorder: 'border-gray-200' },
  'Current':         { dot: 'bg-green-600',   chipBg: 'bg-green-100',  chipText: 'text-green-800',  cardBg: 'bg-green-50', cardBorder: 'border-green-200' },
};

export function phaseStyle(phase: string) {
  return PHASE_STYLES[(phase as CareerPhase)] || PHASE_STYLES['Post-Fellowship'];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-09" → "Sep 2024". Empty end date renders as "Present". */
export function formatMonth(value: string, emptyLabel = 'Present'): string {
  if (!value) return emptyLabel;
  const [y, m] = value.split('-');
  const idx = parseInt(m, 10) - 1;
  if (!y || isNaN(idx) || idx < 0 || idx > 11) return value;
  return `${MONTH_NAMES[idx]} ${y}`;
}

export function dateRangeLabel(start: string, end: string): string {
  return `${formatMonth(start, '—')} – ${formatMonth(end, 'Present')}`;
}

/**
 * Display order is derived from Start Date, ascending — always. `order` is
 * only ever an internal tie-breaker for same-month starts and is recomputed on
 * every write, so nobody has to maintain it by hand.
 */
export function sortHistory<T extends { start: string; order?: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const cmp = (a.start || '9999-99').localeCompare(b.start || '9999-99');
    if (cmp !== 0) return cmp;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

/**
 * The rows tagged Phase = "Current" are the person's present roles — plural on
 * purpose. People hold concurrent positions (a Hill role plus an adjunct
 * appointment, say), so more than one Current row is valid data rather than
 * something to correct. Anything consuming this should handle a list.
 */
export function currentRolesOf<T extends { phase: string }>(entries: T[]): T[] {
  return entries.filter((e) => e.phase === 'Current');
}

/** A run of consecutive roles at one organization — a single tenure. */
export interface OrgTenure<T> {
  org: string;
  sector: string;    // a property of the organization, so taken once from the run
  roles: T[];        // ascending by start date, same direction as the timeline
  start: string;
  end: string;       // '' when any role in the run is ongoing
}

/**
 * Collapse a career history into tenures, so a promotion chain at one employer
 * reads as one block rather than several unrelated jobs.
 *
 * The rule is **consecutive**, not "same name". Only entries adjacent in date
 * order merge, so someone who leaves an organization and returns later gets two
 * separate tenures — collapsing those would claim an unbroken stint that never
 * happened. This is the one piece of this function worth being careful about.
 *
 * Grouping is per-organization, so concurrent roles at different employers stay
 * in separate blocks.
 */
export function groupByOrganization<T extends { org: string; sector: string; start: string; end: string; order?: number }>(
  entries: T[]
): OrgTenure<T>[] {
  const out: OrgTenure<T>[] = [];
  for (const entry of sortHistory(entries)) {
    const last = out[out.length - 1];
    const sameOrg = last && last.org.trim().toLowerCase() === (entry.org || '').trim().toLowerCase();
    if (sameOrg) {
      last.roles.push(entry);
      // An ongoing role anywhere in the run leaves the whole tenure open-ended.
      last.end = last.roles.some((r) => !r.end) ? '' : entry.end;
      if (!last.sector && entry.sector) last.sector = entry.sector;
    } else {
      out.push({
        org: entry.org,
        sector: entry.sector,
        roles: [entry],
        start: entry.start,
        end: entry.end,
      });
    }
  }
  return out;
}

/**
 * Human-readable length of a role or tenure, e.g. "2 yrs 5 mos". A blank end
 * date means "through today". Inclusive of both endpoints, so a single month
 * reads as "1 mo" rather than "0 mos".
 */
export function durationLabel(start: string, end: string): string {
  if (!start) return '';
  const [sy, sm] = start.split('-').map(Number);
  if (!sy || !sm) return '';
  let ey: number, em: number;
  if (end) {
    [ey, em] = end.split('-').map(Number);
    if (!ey || !em) return '';
  } else {
    const now = new Date();
    ey = now.getFullYear();
    em = now.getMonth() + 1;
  }
  const months = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (rem) parts.push(`${rem} mo${rem > 1 ? 's' : ''}`);
  return parts.join(' ');
}
