export interface Fellow {
  id: string;
  name: string;
  email: string;
  congressional_email: string;
  phone: string;
  linkedin: string;
  fellow_type: string;
  party: string;
  office: string;
  supervisor_email: string;
  chamber: string;
  cohort: string;
  status: string;
  start_date: string;
  end_date: string;
  last_check_in: string;
  prior_role: string;
  education: string;
  notes: string;
  requires_monthly_reports: boolean;
  report_start_date: string;
  report_end_month: string;
  onboarding_completed?: string;   // comma-separated completed task indices e.g. "0,1,2,3"
  offboarding_completed?: string;  // comma-separated completed task indices e.g. "0,1,2,3,4"
  // ── Career Pathway Engine ──────────────────────────────────────────────────
  // Parsed from the "Policy Issue Areas" multi-select column (up to 3 tags,
  // Career Pathway taxonomy — NOT the Accomplishments Matrix taxonomy).
  policy_areas: string[];
  // Parsed from the "Target Pathways" multi-select column (up to 2 tags).
  target_pathways: string[];
}

export interface Checkin {
  id: string;
  fellow_id: string;
  date: string;
  check_in_type: string;
  notes: string;
  staff_member: string;
}

export interface StatusReport {
  id: string;
  fellow_id: string;
  fellow_name: string;
  month: string;
  submitted: boolean;
  date_submitted: string;
  notes: string;
  late: boolean;
}

export interface Alumni {
  id: string;
  name: string;
  email: string;
  phone: string;
  cohort: string;
  fellow_types: string[];       // parsed from comma-separated string in sheet
  office_served: string;
  chamber: string;
  party: string;
  current_role: string;
  sector: string;
  location: string;
  contact: boolean;             // OK to contact?
  linkedin: string;
  last_engaged: string;
  engagement_notes: string;
  notes: string;
  prior_role: string;
  education: string;
  served_on_hill: boolean;
  currently_on_hill: boolean;
  // ── Career Pathway Engine ──────────────────────────────────────────────────
  // Same 37-tag taxonomy as Fellows (up to 3 tags).
  policy_areas: string[];
  // Single-select — the pathway this alum actually landed in.
  realized_pathway: string;
}

/**
 * One role in a person's career trajectory. Long/tidy format: one row per
 * role on the "Alumni Career History" sheet tab, many rows per person.
 */
export interface CareerHistoryEntry {
  person_id: string;      // joins to Alumni.id / Fellow.id (column A: "ID")
  person_name: string;    // readability only when scanning the sheet
  order: number;          // internal same-month tie-breaker; never user-entered
  phase: CareerPhase;
  org: string;
  title: string;
  sector: string;
  start: string;          // "YYYY-MM", or "YYYY" when the exact month isn't known
  end: string;            // "YYYY-MM"/"YYYY", or '' when ongoing (Phase = Current)
  notes: string;
}

export type CareerPhase = 'Pre-Fellowship' | 'Fellowship' | 'Post-Fellowship' | 'Current';

/**
 * One row on the "Career Pathways Engine" tab — a person's tagging record.
 * Fellows and alumni share this tab; a person keeps the same row when they
 * graduate, which is what makes "did stated intent predict the outcome?"
 * answerable later.
 */
export interface PathwayRecord {
  id: string;                    // joins to Fellow.id / Alumni.id
  name: string;                  // readability only, never used to match
  record_type: string;           // 'Current Fellow' | 'Alumni'
  cohort: string;
  policy_areas: string[];        // up to 3
  target_pathways: string[];     // up to 2 — what a fellow says they want
  pathway_override: string;      // usually blank; overrides the derived pathway
  last_updated: string;          // normalised to YYYY-MM-DD on read
  notes: string;
  /**
   * Fields whose sheet cell held more values than the cap allows. The extras are
   * ignored rather than deleted — the cell keeps them, scoring doesn't see them —
   * and the dashboard says so instead of silently disagreeing with the sheet.
   */
  over_cap: ('policy_areas' | 'target_pathways')[];
}

/** A ranked alumni recommendation for a given fellow. */
export interface AlumniMatch {
  alumni: Alumni;
  score: number;
  overlap: string[];        // shared policy issue areas
  pathwayMatch: boolean;    // a current pathway is one of the fellow's targets
  sectorMatch: boolean;     // alum's (matching-only) sector is a target-pathway sector
  priorMatch: boolean;      // a PAST post-fellowship pathway is one of the targets
  reason: string;           // human-readable one-liner
  pathways?: string[];      // derived current pathways
  priorPathways?: string[]; // derived past post-fellowship pathways
  provenance?: string;      // "From “OSTP”, matched on “Office of”."
  overridden?: boolean;     // the pathway came from the Pathway Override column
  priorRoles?: { title: string; org: string; pathway: string; range: string }[];
}

export interface TCEvent {
  id: string;
  name: string;
  date: string;
  type: string;
  location: string;
  venue: string;
  cohort: string;
  quarter: string;
  description: string;
  required: boolean;
  staffed_by: string;
}

export interface EventAttendance {
  id: string;
  event_id: string;
  fellow_id: string;
  fellow_name: string;
  attended: boolean;
  notes: string;
}

export interface Accomplishment {
  id: string;
  cohort: string;
  fellow_name: string;
  linkedin: string;
  office: string;
  date: string;
  type: string;
  description: string;
  description_html: string;  // rich HTML from Excel (underlines mark linked text)
  source_link: string;       // primary hyperlink from the description cell
  source_links: string[];    // all hyperlinks embedded in the description cell
  links: string;             // Links/Evidence column
  policy_tags: string[];
  traffic_light: string;   // 'Green' | 'Yellow' | 'Red'
  content_framework: string; // 'Tier 1' | 'Tier 2' | 'Tier 3'
  tab: string;             // 'Master' | 'AISF'
}
