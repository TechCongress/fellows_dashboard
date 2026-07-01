"""
sync_status_reports.py — Standalone monthly status report sync

Run this script on the 1st of each month to automatically log whether fellows
submitted their monthly status report on time, based on Google Form responses.

Grace period: submissions up to GRACE_DAYS into the following month are
attributed to the target month and flagged as late=TRUE. This prevents
double-counting when a fellow submits late (e.g. April 3rd for their March
report) and later submits their actual April report.

Usage:
    python sync_status_reports.py               # syncs previous month
    python sync_status_reports.py 2026 3        # syncs a specific year/month

Credentials are read from the .env.local file in this folder (same file
the Next.js app uses). You must also add FORM_RESPONSES_URL to .env.local
pointing to the Google Sheet linked to your status report Google Form.

Output: prints a summary to stdout and exits 0 on success, 1 on error.
"""

import sys
import os
import calendar
import uuid
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path


# ── Load credentials from .env.local ─────────────────────────────────────────

def load_env(path: Path) -> dict:
    """Parse a .env / .env.local file into a dict."""
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, _, val = line.partition('=')
        # Strip optional surrounding quotes
        val = val.strip().strip('"').strip("'")
        env[key.strip()] = val
    return env

ENV_PATH = Path(__file__).parent / ".env.local"
env = load_env(ENV_PATH)

# Fall back to real environment variables if not in .env.local
def get_env(key: str, required: bool = True) -> str:
    val = env.get(key) or os.environ.get(key, "")
    if required and not val:
        print(f"ERROR: Missing required variable '{key}' in .env.local")
        sys.exit(1)
    return val

SPREADSHEET_ID       = get_env("SPREADSHEET_ID")
GCP_CLIENT_EMAIL     = get_env("GCP_CLIENT_EMAIL")
GCP_PRIVATE_KEY_RAW  = get_env("GCP_PRIVATE_KEY")
FORM_RESPONSES_URL   = get_env("FORM_RESPONSES_URL", required=False)

# The private key in .env.local has literal \n — convert to real newlines
GCP_PRIVATE_KEY = GCP_PRIVATE_KEY_RAW.replace("\\n", "\n")


# ── Google Sheets connection ──────────────────────────────────────────────────

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

service_account_info = {
    "type": "service_account",
    "client_email": GCP_CLIENT_EMAIL,
    "private_key": GCP_PRIVATE_KEY,
    "token_uri": "https://oauth2.googleapis.com/token",
}

creds  = Credentials.from_service_account_info(service_account_info, scopes=SCOPES)
client = gspread.authorize(creds)

spreadsheet = client.open_by_key(SPREADSHEET_ID)

# The form responses live in a separate spreadsheet (linked from the Google Form).
# Set FORM_RESPONSES_URL in .env.local to the URL of that spreadsheet.
if FORM_RESPONSES_URL and "/spreadsheets/d/" in FORM_RESPONSES_URL:
    _form_id = FORM_RESPONSES_URL.split("/spreadsheets/d/")[1].split("/")[0]
    form_spreadsheet = client.open_by_key(_form_id)
else:
    print("WARNING: FORM_RESPONSES_URL not set in .env.local — looking for form responses in the main spreadsheet.")
    form_spreadsheet = spreadsheet

FELLOWS_SHEET        = "Fellows"
REPORTS_SHEET        = "Status Reports"
FORM_RESPONSES_SHEET = "Form Responses 1"

# Number of days into the next month that still count as a late submission
# for the current month. e.g. GRACE_DAYS=7 means April 1–7 submissions
# can be attributed to March as late.
GRACE_DAYS = 7


def _ws(name: str) -> gspread.Worksheet:
    return spreadsheet.worksheet(name)


def _form_ws(name: str) -> gspread.Worksheet:
    return form_spreadsheet.worksheet(name)


def _new_id() -> str:
    return str(uuid.uuid4())


def _to_bool(val) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().upper() in ("TRUE", "1", "YES")


# ── Timezone setup ────────────────────────────────────────────────────────────

try:
    import pytz
    EST = pytz.timezone("America/New_York")
    def _localize(dt):
        return EST.localize(dt)
    def _to_est(dt):
        return dt.astimezone(EST)
except ImportError:
    from datetime import timezone, timedelta
    print("WARNING: pytz not installed. Using fixed UTC-5 offset (no DST correction).")
    _EST_OFFSET = timezone(timedelta(hours=-5))
    def _localize(dt):
        return dt.replace(tzinfo=_EST_OFFSET)
    def _to_est(dt):
        return dt.astimezone(_EST_OFFSET)


# ── Core sync logic ───────────────────────────────────────────────────────────

def sync(year: int, month: int) -> dict:
    """
    Sync status report submissions from the form responses sheet for the
    given year and month (including a GRACE_DAYS grace period into the
    following month for late submissions).

    Conflict prevention: any form submission whose (fellow_id, date) is
    already recorded in the Status Reports sheet as a late submission for a
    DIFFERENT month is skipped. This means April 3rd submissions that were
    already attributed to March will not be double-counted as April reports.

    Returns:
      synced             — list of {fellow_name, month, on_time, date_submitted}
      flagged_duplicates — list of {email, name, count}
      unmatched          — list of {email, first_name, last_name}
      errors             — list of error strings
    """
    result = {"synced": [], "flagged_duplicates": [], "unmatched": [], "errors": []}

    last_day    = calendar.monthrange(year, month)[1]
    month_label = datetime(year, month, 1).strftime("%b %Y")

    # Deadline: 8:59:59 AM on the 1st of the following month.
    # Submissions up to 9 AM on the 1st count as on time.
    if month == 12:
        deadline = _localize(datetime(year + 1, 1, 1, 8, 59, 59))
    else:
        deadline = _localize(datetime(year, month + 1, 1, 8, 59, 59))

    # Window start: day (GRACE_DAYS + 1) of the target month.
    # Days 1–GRACE_DAYS of month M belong exclusively to month M-1's grace
    # period, so the April sync starts April 8 and never touches April 1–7.
    window_start = _localize(datetime(year, month, GRACE_DAYS + 1, 0, 0, 0))

    # Grace period: include submissions up to GRACE_DAYS into the next month
    if month == 12:
        grace_end = _localize(datetime(year + 1, 1, GRACE_DAYS, 23, 59, 59))
    else:
        grace_end = _localize(datetime(year, month + 1, GRACE_DAYS, 23, 59, 59))

    print(f"\nSyncing status reports for {month_label}")
    print(f"Window           : {window_start.strftime('%Y-%m-%d')} – {grace_end.strftime('%Y-%m-%d')}")
    print(f"On-time deadline : {deadline.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    print(f"Grace period ends: {grace_end.strftime('%Y-%m-%d %H:%M:%S %Z')} (submissions after deadline flagged as late)")

    # ── 1. Read form responses ────────────────────────────────────────────────
    try:
        rows = _form_ws(FORM_RESPONSES_SHEET).get_all_records()
    except Exception as e:
        result["errors"].append(f"Failed to read form responses: {e}")
        return result

    # ── 2. Parse timestamps; collect responses in the full window ─────────────
    def _parse_ts(ts_str: str):
        for fmt in ("%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%-m/%-d/%Y %H:%M:%S"):
            try:
                return _localize(datetime.strptime(ts_str.strip(), fmt))
            except ValueError:
                continue
        return None

    all_responses = []
    for row in rows:
        ts = _parse_ts(str(row.get("Timestamp", "")))
        if ts:
            in_month = (window_start <= ts <= deadline)
            in_grace = (deadline < ts <= grace_end)
            if in_month or in_grace:
                all_responses.append({
                    "email":      str(row.get("Email Address", "")).strip().lower(),
                    "first_name": str(row.get("First Name", "")).strip(),
                    "last_name":  str(row.get("Last Name", "")).strip(),
                    "timestamp":  ts,
                    "on_time":    ts <= deadline,
                    "late":       ts > deadline,
                })

    print(f"Found {len(all_responses)} form response(s) in window for {month_label}")

    if not all_responses:
        result["errors"].append(f"No form responses found for {month_label} (including {GRACE_DAYS}-day grace period).")
        return result

    # ── 3. Fetch fellows and build lookup indexes ─────────────────────────────
    try:
        fellows_rows = _ws(FELLOWS_SHEET).get_all_records()
    except Exception as e:
        result["errors"].append(f"Failed to fetch fellows: {e}")
        return result

    fellows = [
        {
            "id":    str(r.get("ID", "")),
            "name":  str(r.get("Name", "")),
            "email": str(r.get("Email", "")),
        }
        for r in fellows_rows
    ]
    email_to_fellow = {f["email"].strip().lower(): f for f in fellows if f.get("email")}
    name_to_fellow  = {f["name"].strip().lower():  f for f in fellows if f.get("name")}

    # ── 4. Load existing Status Report records ────────────────────────────────
    try:
        all_reports = _ws(REPORTS_SHEET).get_all_records()
    except Exception as e:
        result["errors"].append(f"Failed to fetch status reports: {e}")
        return result

    existing = {
        (str(r.get("Fellow ID", "")), str(r.get("Month", ""))): str(r.get("ID", ""))
        for r in all_reports
    }

    report_id_to_row = {
        str(r.get("ID", "")): idx + 2
        for idx, r in enumerate(all_reports)
    }

    consumed_late = defaultdict(set)
    for r in all_reports:
        if _to_bool(r.get("Late", "FALSE")):
            fid = str(r.get("Fellow ID", ""))
            ds  = str(r.get("Date Submitted", ""))
            if fid and ds:
                consumed_late[fid].add(ds)

    # ── 5. Preliminary fellow-matching ────────────────────────────────────────
    for r in all_responses:
        email  = r["email"]
        fellow = email_to_fellow.get(email) if email else None
        if not fellow:
            full_name = f"{r['first_name']} {r['last_name']}".strip().lower()
            fellow = name_to_fellow.get(full_name)
        r["fellow_id"]   = fellow["id"]   if fellow else None
        r["fellow_name"] = fellow["name"] if fellow else None

    # ── 6. Filter consumed-late, then dedup ───────────────────────────────────
    by_fellow        = defaultdict(list)
    unmatched_by_key = defaultdict(list)

    for i, r in enumerate(all_responses):
        date_str = _to_est(r["timestamp"]).strftime("%Y-%m-%d")
        if r["fellow_id"]:
            if date_str in consumed_late.get(r["fellow_id"], set()):
                print(f"   ↩ Skipping {r['first_name']} {r['last_name']} ({date_str}) — already attributed to a prior month as late")
                continue
            by_fellow[r["fellow_id"]].append(r)
        else:
            key = r["email"] if r["email"] else f"__nomail_{i}__"
            unmatched_by_key[key].append(r)

    deduped_fellows = {}
    for fellow_id, responses in by_fellow.items():
        if len(responses) > 1:
            r = responses[0]
            result["flagged_duplicates"].append({
                "email": r["email"],
                "name":  f"{r['first_name']} {r['last_name']}",
                "count": len(responses),
            })
        deduped_fellows[fellow_id] = sorted(responses, key=lambda r: r["timestamp"])[0]

    for key, responses in unmatched_by_key.items():
        if len(responses) > 1 and not key.startswith("__nomail_"):
            r = responses[0]
            result["flagged_duplicates"].append({
                "email": key,
                "name":  f"{r['first_name']} {r['last_name']}",
                "count": len(responses),
            })
        r = sorted(responses, key=lambda r: r["timestamp"])[0]
        result["unmatched"].append({
            "email":      r["email"],
            "first_name": r["first_name"],
            "last_name":  r["last_name"],
        })

    # ── 7. Upsert Status Report records (batched) ─────────────────────────────
    ws_reports  = _ws(REPORTS_SHEET)
    new_rows    = []
    batch_cells = []

    for fellow_id, response in deduped_fellows.items():
        fellow_name    = response["fellow_name"]
        date_submitted = _to_est(response["timestamp"]).strftime("%Y-%m-%d")
        is_late        = response["late"]
        notes          = "" if not is_late else "⚠️ Submitted after month-end deadline (11:59 PM EST)"
        late_str       = "TRUE" if is_late else "FALSE"

        report_key = (fellow_id, month_label)

        if report_key in existing:
            report_id = existing[report_key]
            row_num   = report_id_to_row.get(report_id)
            if row_num:
                batch_cells.append({
                    "range":  f"E{row_num}:H{row_num}",
                    "values": [["TRUE", date_submitted, notes, late_str]],
                })
        else:
            new_rows.append([
                _new_id(),      # A: ID
                fellow_id,      # B: Fellow ID
                fellow_name,    # C: Fellow Name
                month_label,    # D: Month
                "TRUE",         # E: Submitted
                date_submitted, # F: Date Submitted
                notes,          # G: Notes
                late_str,       # H: Late
            ])

        result["synced"].append({
            "fellow_name":    fellow_name,
            "month":          month_label,
            "on_time":        not is_late,
            "date_submitted": date_submitted,
            "late":           is_late,
        })

    if new_rows:
        try:
            ws_reports.append_rows(new_rows, value_input_option="USER_ENTERED")
        except Exception as e:
            result["errors"].append(f"Failed to append new records: {e}")
            result["synced"] = [s for s in result["synced"]
                                 if (s["fellow_name"],) not in
                                 {(r[2],) for r in new_rows}]

    if batch_cells:
        try:
            ws_reports.batch_update(batch_cells)
        except Exception as e:
            result["errors"].append(f"Failed to batch-update existing records: {e}")

    return result


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) == 3:
        try:
            year  = int(sys.argv[1])
            month = int(sys.argv[2])
        except ValueError:
            print("Usage: python sync_status_reports.py [year] [month]")
            print("  e.g. python sync_status_reports.py 2026 3")
            sys.exit(1)
    else:
        today = datetime.now()
        if today.month == 1:
            year, month = today.year - 1, 12
        else:
            year, month = today.year, today.month - 1

    result = sync(year, month)

    month_label = datetime(year, month, 1).strftime("%b %Y")
    print(f"\n{'='*50}")
    print(f"SYNC SUMMARY — {month_label}")
    print(f"{'='*50}")

    print(f"\n✅ Synced ({len(result['synced'])}):")
    for r in result["synced"]:
        status = "LATE" if r["late"] else "on time"
        print(f"   {r['fellow_name']} — {r['date_submitted']} ({status})")

    if result["flagged_duplicates"]:
        print(f"\n⚠️  Duplicate submissions flagged ({len(result['flagged_duplicates'])}):")
        for d in result["flagged_duplicates"]:
            print(f"   {d['name']} ({d['email']}) submitted {d['count']} times — used earliest")

    if result["unmatched"]:
        print(f"\n❌ Unmatched submissions ({len(result['unmatched'])}) — no fellow found:")
        for u in result["unmatched"]:
            print(f"   {u['first_name']} {u['last_name']} ({u['email']})")

    if result["errors"]:
        print(f"\n🔴 Errors ({len(result['errors'])}):")
        for e in result["errors"]:
            print(f"   {e}")
        sys.exit(1)

    print()
    sys.exit(0)
