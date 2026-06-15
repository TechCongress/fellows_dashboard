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
