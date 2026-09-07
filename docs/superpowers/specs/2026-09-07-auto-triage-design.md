# Auto-Triage Preferences Design

Approved choices: on-demand endpoint, single-user DB table, manual-wins, strict rules.

## 1. Data model — `user_preferences` (single row, id='default')

Columns: `id TEXT PK DEFAULT 'default'`, `allow_international BOOL DEFAULT FALSE`,
`max_experience_years INT DEFAULT 2`, `require_fresher_friendly BOOL DEFAULT FALSE`,
`preferred_title_keywords JSONB DEFAULT [...]`, `blocked_title_keywords JSONB DEFAULT [...]`,
`preferred_cities JSONB DEFAULT []` (empty = all India), `min_salary_inr_year BIGINT NULL`,
`updated_at TIMESTAMPTZ DEFAULT NOW()`.

Defaults seeded from taste report:
- preferred: `["ai engineer","genai","gen ai","agentic","prompt engineer","python","intern"]`
- blocked: `["senior","staff","lead","principal","manager","architect","qa","asic","snowflake","sap","account"]`
- India-only (`allow_international=false`), `max_experience_years=2`.

## 2. Classifier — `AutoTriageService.classify(job, prefs) -> (action, reason)`

Strict order, first match wins:
1. `is_international and not allow_international` → archive `non-india`
2. `exp_min is not None and exp_min > max_exp` → archive `experienced-{n}y-over-limit`
3. title contains blocked keyword → archive `blocked-title:{kw}`
4. title contains preferred keyword AND passes 1-2 (+ fresher/salary if configured) → save `matched:{kw}`
5. else → none `no-match` (stays active).

Manual-wins: caller skips rows where `is_saved or is_archived` unless `force=true`.

## 3. Backend API

- `GET /api/preferences` → returns prefs (creates defaults if missing).
- `PUT /api/preferences` → partial update, returns updated prefs.
- `POST /api/jobs/auto-triage?dry_run=false&limit=200&force=false` → classifies active
  (or all if force) jobs, writes `is_saved/is_archived` unless dry_run.
  Response: `{dry_run, evaluated, saved, archived, left_active, skipped_manual, details:[{id,action,reason}]}`.

## 4. Frontend

- `GET/PUT` + `POST auto-triage` added to `lib/api.ts`; `UserPreferences` + `AutoTriageResult` in `lib/types.ts`.
- New page `app/settings/page.tsx`: sections Location / Experience / Roles / Salary + Save + Dry-run preview.
- Bottom of `app/jobs/page.tsx`: single button `Job preferences` (Link to `/settings`).

## 5. Testing

- `backend/tests/test_auto_triage.py`: pure classifier unit tests (no DB) + API tests for prefs round-trip and dry_run classification.
- Frontend: `tsc --noEmit` passes.
