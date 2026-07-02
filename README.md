# TechCongress Fellows & Alumni Dashboard

An internal staff tool for monitoring and managing TechCongress fellows throughout their fellowship placement. Built with Next.js 15, TypeScript, Tailwind CSS, and Google Sheets as the data backend.

---

## Features

### Current Fellows
- **Fellow profiles** — Add, edit, and view fellows with fields for contact info, placement details, background, and notes
- **Status tracking** — Fellows can be marked Active, Flagged, Ending Soon, or Withdrawn; withdrawn fellows are excluded from stats and charts
- **Filtering & search** — Filter by status, fellow type, party, chamber, and cohort; search by name, office, or email
- **Dashboard stats** — Header cards show real-time counts for Total Fellows, Active, Onboarding, Offboarding, Needs Check-in, Flagged, and Ending Soon

#### Onboarding checklist (13 tasks)
Tracks each onboarding step per fellow with a progress bar and completion badge. Includes a "Check all" option for bulk completion. State is persisted to a dedicated column in Google Sheets.

#### Offboarding checklist (5 tasks)
Tracks each offboarding step per fellow. The "Move to Alumni" button is gated — it will not proceed until all offboarding tasks are marked complete.

#### Check-ins
Log and track all fellow check-ins over time (Email, Phone, Zoom, In-person, Slack, Text). Saving a check-in automatically updates the fellow's "Last Check-in" date.

#### Monthly Status Reports
Track monthly report submissions with on-time/late flags and streak counters. Reports can be synced automatically from Google Form responses via the `sync_status_reports.py` script, or marked manually from the fellow's modal.

- 3 consecutive on-time submissions → $50 restaurant gift card
- 2+ missed reports → reimbursements paused

### Alumni
- Add, edit, and view alumni profiles with career and engagement tracking
- Multi-select fellow type support (fellows can hold multiple designations)
- **On the Hill** tab — alumni currently working in Congress, with Senate/House breakdown
- **Served on Hill Post-fellowship** tab — alumni who worked on the Hill at any point after their fellowship
- Sector tracking: Government, Nonprofit/Think Tank, Academia, Private
- Engagement tracking via "Last Engaged" date and engagement notes
- Filter by fellow type, sector, party, chamber, and cohort

### Events & Attendance
- Add and manage fellowship events with name, date, type, venue, cohort, and required status
- Quarter is calculated automatically from the event date
- Record attendance in batches per event
- **Quarter compliance tracking** — fellows must attend at least one event per quarter; non-compliance is flagged
- Attendance tracking scoped to 2026 CIF/SCIF cohort and later (AISF excluded)

### Accomplishments
- Read-only view of fellow accomplishments synced from the Accomplishments spreadsheet
- Filter by cohort, traffic light rating (Green / Yellow / Red), content framework tier (Tier 1–3), and policy tag
- Each accomplishment links to source material where available

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data | Google Sheets API v4 |
| Auth | Password-gated cookie session |
| Deployment | Vercel |

---

## Project Structure

```
fellows_dashboard/
├── app/
│   ├── page.tsx                    # Login page
│   ├── fellows/page.tsx            # Current Fellows page
│   ├── alumni/page.tsx             # Alumni page
│   ├── events/page.tsx             # Events & Attendance page
│   ├── accomplishments/page.tsx    # Accomplishments page
│   └── api/
│       ├── auth/route.ts           # Password auth endpoint
│       ├── fellows/route.ts        # GET / POST fellows
│       ├── fellows/[id]/route.ts   # DELETE fellow
│       ├── fellows/onboarding/     # PATCH onboarding checklist state
│       ├── fellows/offboarding/    # PATCH offboarding checklist state
│       ├── checkins/route.ts       # Check-in CRUD
│       ├── status-reports/         # Status report CRUD
│       ├── alumni/route.ts         # Alumni CRUD
│       ├── events/route.ts         # Events CRUD
│       └── event-attendance/       # Attendance batch save
├── lib/
│   └── sheets.ts                   # All Google Sheets read/write logic
├── types/
│   └── index.ts                    # TypeScript interfaces
├── sync_status_reports.py          # Standalone monthly report sync script
└── middleware.ts                   # Auth middleware (protects all routes)
```

---

## Local Setup

**Prerequisites:** Node.js 18+, a Google Cloud service account with Sheets API enabled, Editor access granted to the service account on the Fellows spreadsheet.

**1. Clone and install**
```bash
git clone <repo-url>
cd fellows_dashboard
npm install
```

**2. Create `.env.local`**
```
SPREADSHEET_ID=your_spreadsheet_id_here
GCP_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FORM_RESPONSES_URL=https://docs.google.com/spreadsheets/d/...
DASHBOARD_PASSWORD=your_password_here
```

**3. Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Syncing Monthly Status Reports

The `sync_status_reports.py` script reads Google Form responses and marks each fellow's report as on-time or late. Run it from the `fellows_dashboard` directory:

```bash
python sync_status_reports.py        # syncs the previous month
python sync_status_reports.py 3      # syncs a specific month (March)
```

The script includes a 7-day grace period — submissions from the 1st through the 7th are attributed to the previous month and marked Late.

---

## Deployment

Deployed on Vercel. Pushing to the `main` branch triggers an automatic redeployment.

Environment variables are managed in the Vercel project dashboard under **Settings → Environment Variables**. Changes to env vars require a manual redeploy to take effect.

To work on a new feature without affecting the live site:
```bash
git checkout -b feature-name
git push --set-upstream origin feature-name
# open a pull request → merge into main when ready
```

---

## Google Sheets Structure

The dashboard reads from and writes to a single Google Spreadsheet with the following tabs: **Fellows**, **Check-ins**, **Status Reports**, **Alumni**, **Events**, **Event Attendance**.

Column A in every tab is the ID column. Records added through the dashboard receive an auto-generated UUID. If adding rows directly in the sheet, you must supply a unique ID — duplicate or missing IDs will cause errors. Do not hide, delete, or reorder columns in any tab.

The Fellows tab includes two dedicated checklist columns:
- **Column X** — Onboarding Completed Tasks (comma-separated task indices)
- **Column Y** — Offboarding Completed Tasks (comma-separated task indices)

These columns are updated via single-cell writes to avoid overwriting other fellow data.
