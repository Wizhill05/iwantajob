# Cron Jobs Scheduling System Design

**Date:** 2026-09-07  
**Status:** Approved  
**Branch:** feature/cron-jobs  

---

## 1. Overview
The platform needs an autonomous scheduling subsystem ("Cron Jobs") allowing users to configure when job scraping pipelines run for different providers (`indeed`, `linkedin`, `wellfound`).
The user can:
- Schedule scraper runs at specific times of the day (e.g. Indeed at 6 AM, LinkedIn at 7 AM, Wellfound at 8 AM).
- Select which days of the week scraping occurs (e.g. exclude Saturday & Sunday, or run only Mon-Fri).
- Specify custom search parameters per job (keywords, location, limit).
- Toggle whether newly scraped jobs should also be auto-parsed immediately into `unified_jobs`.
- Enable/disable jobs with an on/off switch, trigger instant executions ("Run Now"), and view last run timestamps and results.
- Experience a clean, unboxed, and simple UI consistent with the existing aesthetic (similar to the Pipelines page).

---

## 2. Architecture & Data Model

### 2.1 Database Schema: `cron_jobs`
PostgreSQL table managed by SQLAlchemy in `src/models/db_entities.py`:

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique cron identifier (`uuid4`) |
| `name` | `TEXT` | NOT NULL | Readable schedule label (e.g., "Daily Indeed Morning Ingest") |
| `provider` | `TEXT` | NOT NULL | Aggregator target: `'indeed'`, `'linkedin'`, `'wellfound'`, or `'all'` |
| `hour` | `INTEGER` | NOT NULL | Hour of day (0-23) in local system time |
| `minute` | `INTEGER` | NOT NULL | Minute of hour (0-59) |
| `days_of_week` | `JSONB` | NOT NULL, DEFAULT `[0,1,2,3,4,5,6]` | List of integer active weekdays (`0`=Monday, `6`=Sunday) |
| `search_params`| `JSONB` | NOT NULL, DEFAULT `{}` | Scraper params (`what`, `where`, `limit`, etc.) |
| `auto_parse` | `BOOLEAN` | NOT NULL, DEFAULT FALSE | Whether to immediately normalize scraped raw rows into `unified_jobs` |
| `is_enabled` | `BOOLEAN` | NOT NULL, DEFAULT TRUE | Active/paused status |
| `last_run_at` | `TIMESTAMPTZ` | NULLABLE | Timestamp of the most recent execution |
| `last_status` | `TEXT` | NULLABLE | `'success'`, `'failed'`, `'running'` |
| `last_result_summary` | `TEXT` | NULLABLE | Human-readable outcome (e.g., "Scraped 25 jobs") |
| `created_at` | `TIMESTAMPTZ` | SERVER_DEFAULT NOW() | Created timestamp |
| `updated_at` | `TIMESTAMPTZ` | SERVER_DEFAULT NOW() | Updated timestamp |

### 2.2 In-Process Asynchronous Background Scheduler (`src/services/scheduler.py`)
- Uses Python `asyncio` task started and cleanly cancelled during FastAPI's lifespan.
- Runs every 30 seconds. Checks active enabled cron jobs where `hour == current_hour` and `minute == current_minute` and `current_weekday in days_of_week`.
- Compares `last_run_at` to ensure the same job is not run more than once within the target minute.
- Runs the job:
  - Invokes `IndeedClient`, `LinkedInClient`, or `WellfoundClient` with `persist=True`.
  - If `auto_parse=True`, invokes `ParserService.parse_indeed()`, `parse_linkedin()`, or `parse_wellfound()`.
  - Updates `last_run_at`, `last_status`, and `last_result_summary` in the database.

---

## 3. Backend REST APIs (`/api/cron`)

1. `GET /api/cron`: Return list of all cron schedules sorted by creation time.
2. `POST /api/cron`: Create a new schedule.
3. `PUT /api/cron/{id}`: Update schedule (name, provider, hour, minute, days_of_week, search_params, auto_parse, is_enabled).
4. `DELETE /api/cron/{id}`: Remove a schedule.
5. `PATCH /api/cron/{id}/toggle`: Toggle `is_enabled` boolean.
6. `POST /api/cron/{id}/run`: Manually trigger immediate execution in background.

---

## 4. Frontend UI / UX ("Cron Jobs" Page at `/cron`)

- **Sidebar & Mobile Navigation:**
  - Added to `NAV_ITEMS` in `DesktopSidebar.tsx` and `MobileBottomNav.tsx` with icon `Clock`.
- **Page Layout (`/app/cron/page.tsx`):**
  - Standard `PageHero title="Cron Jobs"`.
  - Top action bar: Summary stats ("N active jobs • Next run in X mins") + "Quick Presets" button + "+ Add Cron Job" button.
  - Preset Bar / Defaults:
    - Indeed at 06:00 AM (Mon-Fri)
    - LinkedIn at 07:00 AM (Mon-Fri)
    - Wellfound at 08:00 AM (Mon-Fri)
  - Clean Schedule Cards:
    - Provider badge & icon, title, active toggle.
    - Large time display: `06:00 AM` with time zone indicator.
    - 7-day pill bar (`M`, `T`, `W`, `T`, `F`, `S`, `S`).
    - Query summary chip & auto-parse badge.
    - Last run status badge and execution summary.
    - Action buttons: "Run Now" (with loading state), "Edit", "Delete".
  - Clean Add/Edit Modal:
    - Minimalist modal matching existing styling (`#181818` background, `#262626` borders, `#3ecf8e` accents).
