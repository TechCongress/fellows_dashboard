# Career Pathway Engine — spreadsheet setup

The code is live on the `career-pathway-engine` branch and runs fine right now.
Each item below turns on one more piece of it. Nothing breaks while an item is
outstanding — the dashboard shows an amber note naming the exact column to add,
and the feature stays read-only until it exists.

Column order doesn't matter anywhere. Everything is looked up by header name at
request time, so **no redeploy is needed** after you edit the sheet.

---

## 1. Fellows tab — two new columns

| Header (exact text) | Type | Cap | Source list |
|---|---|---|---|
| `Policy Issue Areas` | Multi-select dropdown (chips) | 3 | The 37 tags in §4 |
| `Target Pathways` | Multi-select dropdown (chips) | 2 | The 8 tags in §5 |

Turns on: the tag editors on each fellow's **Career Pathway** tab, and their
half of the alumni matching.

## 2. Alumni tab — two new columns

| Header (exact text) | Type | Cap | Source list |
|---|---|---|---|
| `Policy Issue Areas` | Multi-select dropdown (chips) | 3 | The same 37 tags — must be the identical list as the Fellows tab |
| `Realized Pathway` | Single-select dropdown | 1 | The 8 tags in §5 |

Turns on: the tag editors on each alum's **Career Pathway** tab, and the other
half of matching. No changes needed to `Sector`, `Currently on the Hill?`, or
`Contact?` — the matching logic reuses all three as they are.

Match quality is bounded entirely by how many alumni get tagged here. The
fellow's Career Pathway tab reports the count ("12 of 84 alumni are tagged") so
you can see that ratio improving.

## 3. Alumni Career History tab — already created ✅

The code reads and writes it as-is. It expects these headers (row 1 or row 2 —
a "do not edit" banner row above them is fine and gets skipped automatically):

`ID · Name · Order · Phase · Organization · Title · Sector · Start Date · End Date · Notes`

Accepted alternates if yours differ slightly: `Start`/`End` for the date columns,
`Org`/`Employer` for Organization, `Role`/`Position` for Title.

Notes on the columns:

- **ID** — must match the alum's `ID` on the Alumni tab. This is the join key;
  Name is there only so the tab is readable when you scan it.
- **Order** — leave it alone. The dashboard sorts by Start Date and rewrites
  Order as 1, 2, 3… on every save, purely as a same-month tie-breaker. There is
  no Order field in the editing UI and you never need to type one.
- **Phase** — dropdown: `Pre-Fellowship` / `Fellowship` / `Post-Fellowship` /
  `Current`. "Current" is explicit, not inferred from a blank end date. Only one
  row per person should carry it; the editor warns you if a second one appears.
- **Start Date / End Date** — `2024-09` is the canonical format. `2024-09-01`,
  `9/2024`, and `Sep 2024` are all read correctly too. A Current-phase row's end
  date is cleared automatically.

`Prior Role` and `Current Role` on the main tabs can stay for now. Once this tab
is populated, treat them as a hand-maintained snapshot rather than the source of
truth — current role is the `Phase = Current` row, prior role is the row just
before the Fellowship row.

---

## 4. Policy Issue Areas — the 37-tag source list

Paste this column into a hidden source range and point both multi-select
dropdowns at it. **This list is completely separate from the Accomplishments
Matrix's 11 policy tags** — different system, different owner, no reconciliation
between them, ever.

```
Artificial Intelligence
Cybersecurity
Data Privacy
Telecommunications & Broadband
Semiconductor & Supply Chain
Emerging Technologies
Digital Infrastructure
Open Source & Software Policy
Digital Health & Health IT
Biotech & Life Sciences
Public Health
Science Policy & R&D Funding
Space Policy
Nuclear Policy
Defense Technology
Intelligence & Surveillance
Election Security
Critical Infrastructure Protection
Future of Work & Automation
Financial Technology
Antitrust & Competition Policy
Workforce Development
Climate Technology
Clean Energy
Energy Grid & Infrastructure
Government Technology
Election Administration
Disinformation & Media Policy
Open Government & Transparency
Education Technology
Housing & Urban Tech
Criminal Justice & Technology
Accessibility & Disability Policy
Immigration & Technology
Tech Diplomacy
Trade & Technology Policy
International Cyber Policy
```

The API rejects anything not on this list, so a typo in the sheet reads as
"untagged" rather than silently creating a 38th category.

## 5. Pathway tags — the 8-tag source list

```
Stay in Congress
Think Tank
Executive Branch
Law School
Private Sector
Academia
Elected Office
Civil Society / Nonprofit
```

---

## How matching scores

Every alum is scored against a fellow; the top 4 are shown. Alumni marked "do
not contact" are excluded outright.

| Signal | Points |
|---|---|
| Each shared policy issue area | +2 |
| Alum's realized pathway is one of the fellow's 2 targets | +3 |
| Alum's sector maps to a target-pathway sector | +2 |

The pathway and sector bonuses **stack** — an alum matching on both gets 5, and
still appears exactly once in the list.

For scoring only, "Government" is split into Congress vs. Executive Branch using
the existing `Currently on the Hill?` flag, so a fellow targeting "Stay in
Congress" and one targeting "Executive Branch" get different recommendations.
**This split never surfaces in the UI** — badges, filters, and the By Sector pie
chart all keep the single "Government" bucket.

## What's deliberately not built yet

- **LLM-written intro emails.** The draft is a fixed template filled from the
  fellow, alum, and the specific overlap. Copy-to-clipboard or open-in-mail —
  nothing is ever sent automatically.
- **A Connections/outreach log.** Worth adding once you want to track whether a
  recommended intro actually led to a conversation, which is also what would let
  you tune the scoring weights against real outcomes.
