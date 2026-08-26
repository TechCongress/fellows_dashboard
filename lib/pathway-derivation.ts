/**
 * Deriving an alum's realized pathway from their career history.
 * ──────────────────────────────────────────────────────────────
 * A hand-maintained "realized pathway" field goes stale every time someone
 * changes jobs. The career history is already kept current, so the pathway is
 * read from it instead: sector narrows the answer to a family, then keywords in
 * the organization and title pick the member.
 *
 * Every result carries its provenance — which rung matched and on what text —
 * so the UI can show "Executive Branch (from *Office of Science and Technology
 * Policy*)" rather than an unexplained label. A wrong derivation you can see is
 * a five-second fix; a wrong one you can't is silently bad matching.
 *
 * Keyword matching will be wrong sometimes. That is what the `Pathway Override`
 * column is for, and why it is checked first and short-circuits everything.
 */

import { CareerHistoryEntry } from '@/types';
import { SECTOR_POLICY, normalizeSector, sortHistory } from '@/lib/career-pathway';

// ── Patterns ─────────────────────────────────────────────────────────────────

/**
 * The person IS the elected official, rather than staff to one. Anchored to the
 * start of the title so "Legislative Assistant to Senator Peters" — staff — does
 * not read as a senator. Checked before sector, because an elected official's
 * sector is Government and would otherwise look like Hill staff.
 */
const ELECTED_TITLE = [
  /^(u\.?s\.?\s+)?(senator|representative|congressman|congresswoman|governor|mayor|delegate|assemblymember|assemblywoman|assemblyman|councilmember|councilwoman|councilman|alderman|alderwoman|state (senator|representative))\b/i,
  /\bcandidate for\b/i,
  /\bcampaign for\b/i,
];

/**
 * State, city, and county government. Checked BEFORE the congressional and
 * executive patterns, because almost every marker of sub-national government
 * collides with a federal one: "California State Senate" contains "Senate",
 * "Office of the Governor" contains "Office of", and "NYC Tech Transition
 * Committee" contains "Committee". Federal wins those words only after this
 * list has had its say.
 *
 * Elected office is NOT here. A state senator holds office rather than works
 * for one, and ELECTED_TITLE catches them one rung earlier — this list is for
 * the staff, agency, and appointed roles around them.
 */
const STATE_LOCAL_ORG = [
  // Legislatures. "State Senate"/"State Assembly" can't be federal.
  /\bstate (senate|assembly|house|legislature|capitol)\b/i,
  /\bgeneral assembly\b/i, /\bstate legislature\b/i,
  // Executives.
  /\b(office of the |)governor'?s? office\b/i, /\boffice of the governor\b/i,
  /\blieutenant governor\b/i,
  /\b(office of the |)mayor'?s? office\b/i, /\boffice of the mayor\b/i,
  // Whole-jurisdiction phrasing.
  /\bstate of (?!the union\b)[a-z]/i, /\bcommonwealth of\b/i,
  /\bcity of\b/i, /\bcounty of\b/i,
  /\b(city|county|municipal|township|borough) (council|government|hall|attorney|clerk)\b/i,
  /\bnew york city\b/i, /\bnyc\b/i,
  /\bschool district\b/i, /\bboard of education\b/i,
  // A named state next to a government word. This is what catches the common
  // real-world form, e.g. "Washington State Department of Transportation",
  // which would otherwise read as a federal department.
  new RegExp(String.raw`\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|puerto rico|district of columbia)\s+(state\s+)?(department|dept\.?|agency|office|commission|board|authority|division|bureau)\b`, 'i'),
];

/**
 * Legislative branch. Checked BEFORE the executive patterns because
 * "Office of Senator Peters" contains both "Office of" and "Senator" — the
 * congressional signal has to win.
 */
const CONGRESS_ORG = [
  /\bsen\.\s/i, /\brep\.\s/i, /\bsenator\b/i, /\brepresentative\b/i,
  /\bsenate\b/i, /\bhouse of representatives\b/i, /\bcongress(ional)?\b/i,
  /\bcommittee\b/i, /\bsubcommittee\b/i, /\bcaucus\b/i,
  /\b(majority|minority) (leader|whip)\b/i, /\bspeaker\b/i, /\bwhip\b/i,
  /\bcongressional research service\b/i, /\bgovernment accountability office\b/i,
  /\bcongressional budget office\b/i, /\blibrary of congress\b/i,
  /\b(crs|gao|cbo)\b/i,
  // Legislative-branch commissions. Named explicitly because EXECUTIVE_ORG
  // matches a bare "Commission" for the independent agencies (FCC, FTC, SEC),
  // and these would otherwise be misread as executive branch.
  /\bhelsinki commission\b/i,
  /\bcommission on security and cooperation in europe\b/i,
  /\bu\.?s\.?-?china economic and security review commission\b/i,
];

/** Executive branch: departments, agencies, the EOP, and common acronyms. */
const EXECUTIVE_ORG = [
  /\boffice of\b/i, /\bdepartment of\b/i, /\bdept\.? of\b/i,
  /\bwhite house\b/i, /\bexecutive office of the president\b/i,
  /\bagency\b/i, /\badministration\b/i, /\bbureau\b/i,
  // Independent agencies are usually "…Commission" spelled out (FCC, FTC, SEC,
  // NRC). Safe here because the congressional patterns are checked first.
  /\bcommission\b/i,
  // Federal research bodies: "National Institute of Standards and Technology"
  // has no "Department"/"Agency"/"Office of" in it. Safe to match a bare
  // "Institute" because this list is only consulted for the Government sector —
  // a think tank is never Government.
  /\bnational institute/i, /\binstitute\b/i, /\bnational laborator/i,
  // Cabinet departments as people actually write them, without "Department of".
  /\b(veterans affairs|health and human services|homeland security|housing and urban development)\b/i,
  /\b(state department|treasury|the interior)\b/i,
  /\bthe pentagon\b/i, /\bnational laboratory\b/i,
  /\b(ostp|omb|usds|gsa|nist|nsf|nasa|cisa|dhs|doe|dot|hhs|nih|cdc|fda|epa|fcc|ftc|sec|fda|dod|darpa|arpa-h|nsa|cia|odni|fbi|doj|uspto|noaa)\b/i,
  /\b18f\b/i, /\bpresidential innovation fellow/i,
];

/** Research institutions within the policy/nonprofit sector. */
const THINK_TANK = [
  /\binstitute\b/i, /\bcenter for\b/i, /\bcentre for\b/i, /\bthink tank\b/i,
  /\bRAND\b/, /\bbrookings\b/i, /\bcsis\b/i, /\bcarnegie\b/i, /\bcato\b/i,
  /\bheritage foundation\b/i, /\bnew america\b/i, /\burban institute\b/i,
  /\bpew\b/i, /\bchatham house\b/i, /\bbelfer\b/i,
];
const THINK_TANK_TITLE = [
  /\bresearch(er)?\b/i, /\bscholar\b/i, /\bfellow\b/i, /\banalyst\b/i,
];

/** Advocacy and civic organisations within the same sector. */
const CIVIL_SOCIETY = [
  /\badvocacy\b/i, /\bcoalition\b/i, /\balliance\b/i, /\bunion\b/i,
  /\bassociation\b/i, /\bcivic\b/i, /\bnonprofit\b/i, /\bnon-profit\b/i,
  /\brights\b/i, /\bjustice\b/i, /\bliberties\b/i, /\bsociety\b/i,
  /\bfoundation\b/i, /\bcharit(y|able)\b/i, /\bnetwork\b/i, /\bfederation\b/i,
];

/** Enrolled in legal study, as opposed to working at a law school. */
const LAW_STUDENT_TITLE = [
  /\bj\.?d\.?\s*(candidate|student)?\b/i, /\bll\.?m\.?\b/i,
  /\blaw student\b/i, /\b[123]l\b/i,
];

// ── Result shape ─────────────────────────────────────────────────────────────

export type DerivationSource = 'override' | 'title' | 'organization' | 'sector' | 'none';

export interface PathwayDerivation {
  /** One of the 8 pathway tags, or '' when nothing matched. */
  pathway: string;
  source: DerivationSource;
  /** The text that decided it — a keyword, or the sector name. */
  matchedOn: string;
  /** The role this was read from, for the provenance line. */
  role?: { title: string; org: string };
}

function firstMatch(patterns: RegExp[], value: string): string | null {
  const v = value || '';
  for (const p of patterns) {
    const m = v.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

const NONE: PathwayDerivation = { pathway: '', source: 'none', matchedOn: '' };

// ── One role → one pathway ───────────────────────────────────────────────────

/**
 * Derive a pathway from a single role. First rung that matches wins; the order
 * of the checks below is the specification, not an implementation detail.
 */
export function derivePathwayFromRole(role: {
  title?: string;
  org?: string;
  sector?: string;
}): PathwayDerivation {
  const title = (role.title || '').trim();
  const org = (role.org || '').trim();
  const sector = normalizeSector(role.sector || '');
  const at = { title, org };

  // 1. They hold the office themselves — before sector, since their sector is
  //    Government and would otherwise read as Hill staff.
  const elected = firstMatch(ELECTED_TITLE, title);
  if (elected) return { pathway: 'Elected Office', source: 'title', matchedOn: elected, role: at };

  // 2. Law study is a title signal that overrides the Academia sector.
  const student = firstMatch(LAW_STUDENT_TITLE, title);
  if (student) return { pathway: 'Law School', source: 'title', matchedOn: student, role: at };

  if (sector === 'Government') {
    // Sub-national first — see the note on STATE_LOCAL_ORG. Almost every state
    // or city marker also matches a federal pattern.
    const local = firstMatch(STATE_LOCAL_ORG, org) || firstMatch(STATE_LOCAL_ORG, title);
    if (local) return { pathway: 'State & Local Government', source: 'organization', matchedOn: local, role: at };
    const congress = firstMatch(CONGRESS_ORG, org) || firstMatch(CONGRESS_ORG, title);
    if (congress) return { pathway: 'Stay in Congress', source: 'organization', matchedOn: congress, role: at };
    const exec = firstMatch(EXECUTIVE_ORG, org) || firstMatch(EXECUTIVE_ORG, title);
    if (exec) return { pathway: 'Executive Branch', source: 'organization', matchedOn: exec, role: at };
    return NONE;  // Government, but unrecognisable — a prompt to set the override
  }

  if (sector === SECTOR_POLICY) {
    const tank = firstMatch(THINK_TANK, org);
    if (tank) return { pathway: 'Think Tank', source: 'organization', matchedOn: tank, role: at };
    const civil = firstMatch(CIVIL_SOCIETY, org);
    if (civil) return { pathway: 'Civil Society/Nonprofit', source: 'organization', matchedOn: civil, role: at };
    // Organisation name gave nothing; a research-flavoured title is weak
    // evidence of a think tank, checked last so org names always win.
    const byTitle = firstMatch(THINK_TANK_TITLE, title);
    if (byTitle) return { pathway: 'Think Tank', source: 'title', matchedOn: byTitle, role: at };
    return NONE;
  }

  if (sector === 'Academia') return { pathway: 'Academia', source: 'sector', matchedOn: 'Academia', role: at };
  if (sector === 'Private') return { pathway: 'Private Sector', source: 'sector', matchedOn: 'Private', role: at };

  // "Other", blank, or anything unrecognised earns no pathway. Deliberate:
  // "doesn't fit a category" is not evidence of a fit with any target.
  return NONE;
}

// ── A whole history → current + prior pathways ───────────────────────────────

export interface AlumniPathways {
  /** One derivation per current role — plural, because concurrent roles happen. */
  current: PathwayDerivation[];
  /** Post-fellowship roles they have since left. */
  prior: PathwayDerivation[];
  /** Deduped pathway names from `current`. Earns the +3 exact-match bonus. */
  pathways: string[];
  /** Deduped from `prior`, excluding anything already current. Earns +1. */
  priorPathways: string[];
  /** True when the answer came from the Pathway Override column. */
  overridden: boolean;
  /** What would have been derived, when an override is in play. */
  wouldHaveBeen?: PathwayDerivation;
}

const EMPTY: AlumniPathways = { current: [], prior: [], pathways: [], priorPathways: [], overridden: false };

/**
 * Derive an alum's pathways from their full career history.
 *
 * - The override short-circuits everything, but the derivation still runs so the
 *   UI can show what it *would* have said and why that was wrong.
 * - Roles marked `Current` define the present. If none is marked, falls back to
 *   the most recently started role: a missing flag is far likelier to be an
 *   oversight than a statement that someone is unemployed.
 * - Only post-fellowship roles earn prior credit. Pre-fellowship history
 *   describes who someone was before TechCongress, not a pathway the program
 *   helped them reach.
 */
export function deriveAlumniPathways(
  history: CareerHistoryEntry[],
  override?: string,
  /**
   * Last resort from the Alumni tab, for alumni whose career history hasn't
   * been backfilled yet. `Current Role` is already maintained there, so it's
   * better evidence than nothing — and far better than falling through to a
   * fellowship row.
   */
  fallback?: { current_role?: string; sector?: string }
): AlumniPathways {
  const sorted = sortHistory(history || []);
  const currentRoles = sorted.filter((r) => r.phase === 'Current');

  // A missing `Current` flag is usually an oversight, so fall back to the most
  // recent role — but ONLY among post-fellowship roles. Deriving from a
  // Fellowship or Pre-Fellowship row would report the placement TechCongress
  // made as the pathway they went on to choose, which is exactly backwards:
  // every alum would look like they "stayed in Congress".
  const postFellowship = sorted.filter((r) => r.phase === 'Post-Fellowship');
  const basis = currentRoles.length > 0
    ? currentRoles
    : postFellowship.length > 0
      ? postFellowship.slice(-1)
      : [];

  const current = basis.map(derivePathwayFromRole).filter((d) => d.pathway);
  const pathways = [...new Set(current.map((d) => d.pathway))];

  const priorRoles = postFellowship.filter((r) => !basis.includes(r));
  const prior = priorRoles.map(derivePathwayFromRole).filter((d) => d.pathway);
  const priorPathways = [...new Set(prior.map((d) => d.pathway))].filter((p) => !pathways.includes(p));

  const cleanOverride = (override || '').trim();
  if (cleanOverride) {
    return {
      current: [{ pathway: cleanOverride, source: 'override', matchedOn: cleanOverride }],
      prior,
      pathways: [cleanOverride],
      priorPathways: priorPathways.filter((p) => p !== cleanOverride),
      overridden: true,
      wouldHaveBeen: current[0],
    };
  }

  // Nothing usable in the career history — try the Alumni tab's own fields.
  if (pathways.length === 0 && fallback?.current_role) {
    // The whole string is searched as both title and organization: entries read
    // like "Professor of Public Policy @ RAND", with no reliable separator.
    const fromTab = derivePathwayFromRole({
      title: fallback.current_role,
      org: fallback.current_role,
      sector: fallback.sector || '',
    });
    if (fromTab.pathway) {
      return { current: [fromTab], prior, pathways: [fromTab.pathway], priorPathways, overridden: false };
    }
  }

  if (current.length === 0 && prior.length === 0) return EMPTY;
  return { current, prior, pathways, priorPathways, overridden: false };
}

/** "Executive Branch — from “Office of Science and Technology Policy”" */
export function derivationExplanation(d: PathwayDerivation): string {
  if (!d.pathway) return 'No pathway could be read from their career history.';
  switch (d.source) {
    case 'override':
      return 'Set by staff.';
    case 'sector':
      return `From their current role's sector, ${d.matchedOn}.`;
    case 'title':
      return `From their title, matched on “${d.matchedOn}”.`;
    case 'organization':
      return `From ${d.role?.org ? `“${d.role.org}”` : 'their organization'}, matched on “${d.matchedOn}”.`;
    default:
      return '';
  }
}
