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
- Sector tracking: Government, Policy/Think Tank/Nonprofit, Private, Academia, Other
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

### Career Pathway Engine
Connects each current fellow to the alumni most worth talking to, based on what
the fellow wants to do after the fellowship and what alumni have actually gone on
to do.

Tagging lives on its own **Career Pathways Engine** sheet tab — one row per
person, fellows and alumni together — rather than as columns on the Fellows and
Alumni tabs. Every field is looked up by header name at request time, so columns
can be reordered freely and no redeploy is needed after editing the sheet.

#### Career Pathway tab (fellows)
- **Policy Issue Areas** — up to 3 from a fixed 33-tag taxonomy
- **Target Post-Fellowship Pathways** — up to 2 from a fixed 9-tag list
- **Recommended Alumni Connections** — the top-scoring alumni, each with the
  overlap that earned the match and a fixed-template intro email draft
- Policy area badges also appear on the fellow's card on the main Fellows page

#### Career Pathway tab (alumni)
- **Realized pathway, derived** — read from the alum's career history rather than
  maintained by hand, so it can't go stale when someone changes jobs. The tab
  shows what was derived and the evidence for it
- **Pathway Override** — a single-select for the rare case where the derivation
  is wrong. Setting it shows what *would* have been derived, so an override is
  never silently masking a bad rule
- **Past post-fellowship roles** earn partial credit, so an alum who has since
  moved on still surfaces for the path they took earlier

#### How matching scores
| Signal | Points |
|---|---|
| Each shared policy issue area | +2 |
| Alum's current pathway is one of the fellow's targets | +3 |
| Alum's sector maps to a target-pathway sector | +2 |
| A past post-fellowship pathway matches a target | +1 |

Alumni marked "do not contact" are excluded outright. For scoring only,
"Government" is split into Congress vs. Executive Branch using the existing
`Currently on the Hill?` flag — **this split never surfaces in the UI**; badges,
filters, and the By Sector chart all keep a single Government bucket.

#### Notes
A free-text note per person, saved to the `Notes` column of their row on the
Career Pathways Engine tab. Appears on the Career Pathway tab for both fellows
and alumni.

### Alumni career history
A long-format **Alumni Career History** tab — one row per role — replaces the
single "Current Role" snapshot as the source of truth.

- Full editor on each alum's profile: add, edit, reorder, and delete roles
- Each role carries a phase: Pre-Fellowship, Fellowship, Post-Fellowship, or
  Current. A person can hold more than one Current role; concurrent positions
  are normal and aren't treated as an error
- **Consecutive roles at the same organization are grouped** into a single block,
  listed oldest-first inside it, so a promotion reads as one tenure rather than
  three unrelated jobs
- Start and end dates display as `MM/YYYY`
- This history is what the pathway derivation reads


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
│       ├── fellows/route.ts        # GET / POST / DELETE fellows
│       ├── fellows/onboarding/     # PATCH onboarding checklist state
│       ├── fellows/offboarding/    # PATCH offboarding checklist state
│       ├── fellows/[id]/pathway/   # GET ranked alumni matches for one fellow
│       ├── pathway/route.ts        # GET / PATCH pathway tagging + notes
│       ├── career-history/route.ts # Alumni career history CRUD
│       ├── checkins/route.ts       # Check-in CRUD
│       ├── status-reports/         # Status report CRUD
│       ├── alumni/route.ts         # Alumni CRUD
│       ├── events/route.ts         # Events CRUD
│       ├── attendance/route.ts     # Attendance batch save
│       └── accomplishments/        # Accomplishments (read-only)
├── components/
│   ├── pathway-ui.tsx              # Career Pathway tabs, tag pickers, match cards
│   └── career-history.tsx          # Career timeline + history editor
├── lib/
│   ├── sheets.ts                   # All Google Sheets read/write logic
│   ├── career-pathway.ts           # Taxonomies, sectors, and match scoring
│   ├── pathway-derivation.ts       # Derives an alum's pathway from career history
│   ├── reference-data.ts           # Shared reference lists
│   └── helpers.ts                  # Shared utilities
├── types/
│   └── index.ts                    # TypeScript interfaces
├── CAREER_PATHWAY_SETUP.md         # Sheet setup + the full tag taxonomies
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

The dashboard reads from and writes to a single Google Spreadsheet with the following tabs: **Fellows**, **Check-ins**, **Status Reports**, **Alumni**, **Events**, **Event Attendance**, **Career Pathways Engine**, and **Alumni Career History**.

Missing tabs and missing columns degrade gracefully: the feature goes read-only
and the dashboard shows an amber note naming the exact column to add, rather than
erroring.

Column A in every tab is the ID column. Records added through the dashboard receive an auto-generated UUID. If adding rows directly in the sheet, you must supply a unique ID — duplicate or missing IDs will cause errors. Do not hide, delete, or reorder columns in any tab.

The Fellows tab includes two dedicated checklist columns:
- **Column W** — Onboarding Completed Tasks (comma-separated task indices)
- **Column X** — Offboarding Completed Tasks (comma-separated task indices)

These columns are updated via single-cell writes to avoid overwriting other fellow data.

### Career Pathways Engine tab

One row per person, fellows and alumni together. Expected headers:

`ID · Name · Record Type · Cohort · Policy Issue Areas · Target Pathways · Pathway Override · Last Updated · Notes`

- **Record Type** — `Current Fellow` or `Alumni`
- **Policy Issue Areas / Target Pathways** — multi-select dropdowns. Google
  writes multiple picks as `A, B`, which is exactly what the dashboard reads and
  writes. Google's multi-select enforces no maximum, so if a cell exceeds the cap
  (3 areas, 2 pathways) the extras are **ignored, not deleted** — the cell keeps
  them and the person's Career Pathway tab shows an amber note saying which ones
  count
- **Last Updated** — stamped automatically as `MM/DD/YYYY` on every write
- A person's row is **created automatically** the first time they're tagged

### Alumni Career History tab

One row per role. Expected headers:

`ID · Name · Order · Phase · Organization · Title · Sector · Start Date · End Date · Notes`

- **ID** must match the alum's ID on the Alumni tab — this is the join key
- **Order** is rewritten as 1, 2, 3… on every save as a same-month tie-breaker;
  there's no Order field in the UI and you never need to type one
- **Start / End Date** — `2024-09` is canonical; `2024-09-01`, `9/2024`, and
  `Sep 2024` all read correctly. A Current-phase row's end date is cleared

### Who owns sheet formatting

You do. The code writes **data** and one thing about presentation: it pins the
career-history date columns to an `MM/YYYY` display format. Dropdowns, colours,
fills, and conditional formatting are yours and won't be overwritten.

That's deliberate. The Sheets API has no colour field on a data-validation rule,
so if the code set the dropdowns it would silently wipe any colours assigned to
them. Set the dropdowns yourself over a generous row range (say `D3:D1000`), and
note that valid values are guaranteed regardless — the API clamps every write to
the fixed taxonomies, so nothing off-list can reach the sheet even without
validation enforcing it.

### Renamed labels

Renames are handled with back-compat aliases: an old value is mapped to the
current one whenever it's read, and rewritten whenever that row is saved. Nothing
breaks while the spreadsheet still holds the old label, and rows migrate
themselves as they're edited.

| Old | Current |
|---|---|
| `Policy/Think Tank`, `Policy/Nonprofit/Think Tank` | `Policy/Think Tank/Nonprofit` |
| `Civil Society / Nonprofit` | `Civil Society/Nonprofit` |
---

## Google Sheets API quota

Google allows **60 read requests per minute per user**. A single interaction used
to cost far more than it looks: opening a fellow's Career Pathway tab reads four
tabs, and the pathway join happens inside `fetchFellows`/`fetchAlumni`, so those
reads multiplied. A few quick edits in a row were enough to hit the ceiling and
fail a save with a 429.

Four things keep it under the limit:

1. **Reads collapse within a burst.** Identical reads of the same tab inside a
   3-second window share one request. The *promise* is cached, not just the
   result, so concurrent callers join a request already in flight.
2. **Any write clears that cache**, so a save is always followed by a genuine
   re-read rather than pre-write rows.
3. **429s retry** up to three times with exponential backoff and jitter.
4. **The identity lookup is lazy.** Filling name and cohort on a new Career
   Pathways Engine row only reads the Fellows and Alumni tabs when a row actually
   has to be created.

Measured effect: opening the tab went 6 reads → 4, saving tags 6 → 2.

The caching window is deliberately short — it exists to collapse the reads of one
interaction, not to cache the spreadsheet. Edits made directly in Google Sheets
still appear on the next page load. Set `SHEETS_READ_WINDOW_MS=0` to disable it
entirely (the test suite does this).

If the limit is still hit, both pathway routes return a plain-language message
rather than a generic failure.

