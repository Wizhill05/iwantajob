# Cron Jobs Subsystem & UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust in-process PostgreSQL-backed scraper scheduling engine and a clean, responsive "Cron Jobs" UI page with day-of-week and time-of-day configuration, manual triggering, and optional auto-parsing.

**Architecture:** A SQLAlchemy `CronJob` entity in PostgreSQL stores schedules. An asynchronous background scheduler runs inside FastAPI lifespan, polling schedules every 30s and executing scrapers with `persist=True` (and optional `auto_parse`). FastAPI exposes CRUD + execution endpoints under `/api/cron`. A Next.js page at `/cron` provides a clean dashboard to manage schedules, view last run results, toggle days, and run jobs instantly.

**Tech Stack:** Python (FastAPI, SQLAlchemy, asyncio), Next.js 14 (React, TypeScript, TailwindCSS, iconoir-react), PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-07-cron-jobs-design.md`

## Global Constraints
- Minimalist dark aesthetic matching `#131313` background, `#262626` borders, `#3ecf8e` emerald accents.
- Direct execution safety: Prevent overlapping duplicate runs in the same minute window.
- All code strictly typed with TypeScript interfaces in `lib/types.ts` and Pydantic models in FastAPI.

---

### Task 1: Database Model & Migration for `cron_jobs`

**Files:**
- Modify: `backend/src/models/db_entities.py`
- Test: `backend/tests/test_cron_model.py`

**Interfaces:**
- Consumes: SQLAlchemy Base from `src.core.database`
- Produces: `CronJob` model with `id`, `name`, `provider`, `hour`, `minute`, `days_of_week`, `search_params`, `auto_parse`, `is_enabled`, `last_run_at`, `last_status`, `last_result_summary`, `created_at`, `updated_at`.

- [ ] **Step 1: Write failing test for `CronJob` entity**

```python
# backend/tests/test_cron_model.py
import pytest
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob
from sqlalchemy import select

@pytest.mark.asyncio
async def test_cron_job_create_and_query():
    await init_db()
    async with async_session_maker() as session:
        job = CronJob(
            name="Test Daily Indeed",
            provider="indeed",
            hour=6,
            minute=0,
            days_of_week=[0, 1, 2, 3, 4],
            search_params={"what": "engineer", "where": "India"},
            auto_parse=True,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()

        result = await session.execute(select(CronJob).where(CronJob.id == job.id))
        queried = result.scalar_one_or_none()
        assert queried is not None
        assert queried.name == "Test Daily Indeed"
        assert queried.hour == 6
        assert queried.days_of_week == [0, 1, 2, 3, 4]
```

- [ ] **Step 2: Run test to verify it fails**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_cron_model.py -v`

- [ ] **Step 3: Implement `CronJob` entity in `backend/src/models/db_entities.py`**
Add `CronJob` model definition to `backend/src/models/db_entities.py`.

- [ ] **Step 4: Run test to verify it passes**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_cron_model.py -v`

- [ ] **Step 5: Commit**
```bash
git add backend/src/models/db_entities.py backend/tests/test_cron_model.py
git commit -m "feat(backend): add CronJob database entity"
```

---

### Task 2: Background Scheduler Service & Execution Runner

**Files:**
- Create: `backend/src/services/scheduler.py`
- Test: `backend/tests/test_scheduler.py`

**Interfaces:**
- Consumes: `CronJob`, `IndeedClient`, `LinkedInClient`, `WellfoundClient`, `ParserService`
- Produces:
  - `execute_cron_job(job_id: UUID) -> dict`
  - `check_and_run_due_jobs() -> int` (returns number of triggered jobs)
  - `start_scheduler_loop() -> asyncio.Task`
  - `stop_scheduler_loop()`

- [ ] **Step 1: Write failing test for scheduler execution logic**
Test that `execute_cron_job` handles provider calls and updates `last_run_at`, `last_status`, `last_result_summary`.

- [ ] **Step 2: Run test to verify it fails**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_scheduler.py -v`

- [ ] **Step 3: Implement `scheduler.py`**
Write job checking against current time, day of week matching, error handling, client dispatch with `persist=True`, and auto-parse execution.

- [ ] **Step 4: Run test to verify it passes**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_scheduler.py -v`

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/scheduler.py backend/tests/test_scheduler.py
git commit -m "feat(backend): implement scheduler service and cron execution runner"
```

---

### Task 3: REST API Endpoints for Cron Schedules & Lifespan Integration

**Files:**
- Create: `backend/src/api/cron_router.py` (or endpoints in `backend/src/main.py`)
- Modify: `backend/src/main.py`
- Test: `backend/tests/test_cron_api.py`

**Interfaces:**
- Consumes: FastAPI app, `scheduler.py`, `async_session_maker`
- Produces:
  - `GET /api/cron`
  - `POST /api/cron`
  - `PUT /api/cron/{id}`
  - `DELETE /api/cron/{id}`
  - `PATCH /api/cron/{id}/toggle`
  - `POST /api/cron/{id}/run`
  - Lifespan background task runner hook

- [ ] **Step 1: Write failing tests for cron REST endpoints**
Test CRUD lifecycle, toggle endpoint, and immediate run endpoint.

- [ ] **Step 2: Run test to verify it fails**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_cron_api.py -v`

- [ ] **Step 3: Implement cron API router and wire into `backend/src/main.py`**

- [ ] **Step 4: Run test to verify it passes**
Run: `/home/azureuser/iwantajob/backend/.venv/bin/pytest tests/test_cron_api.py -v`

- [ ] **Step 5: Commit**
```bash
git add backend/src/main.py backend/src/api/cron_router.py backend/tests/test_cron_api.py
git commit -m "feat(backend): add cron management REST API and startup lifespan scheduler"
```

---

### Task 4: Frontend API Client & TypeScript Interfaces

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

**Interfaces:**
- Consumes: Backend `/api/cron` contracts
- Produces:
  - `CronJob` type:
    ```ts
    export interface CronJob {
      id: string;
      name: string;
      provider: 'indeed' | 'linkedin' | 'wellfound' | 'all';
      hour: number;
      minute: number;
      days_of_week: number[]; // [0,1,2,3,4,5,6]
      search_params: Record<string, any>;
      auto_parse: boolean;
      is_enabled: boolean;
      last_run_at: string | null;
      last_status: 'success' | 'failed' | 'running' | null;
      last_result_summary: string | null;
      created_at: string;
      updated_at: string;
    }
    ```
  - API methods: `getCronJobs()`, `createCronJob()`, `updateCronJob()`, `deleteCronJob()`, `toggleCronJob()`, `runCronJob()`

- [ ] **Step 1: Update `frontend/lib/types.ts` with `CronJob` and request payloads**
- [ ] **Step 2: Update `frontend/lib/api.ts` with the 6 cron API client methods**
- [ ] **Step 3: Verify TypeScript builds without error**
Run: `npm run build` in `frontend` directory.
- [ ] **Step 4: Commit**
```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(frontend): add cron TypeScript definitions and API client methods"
```

---

### Task 5: Frontend UI — Navigation Links & Cron Jobs Dashboard Page

**Files:**
- Modify: `frontend/components/layout/DesktopSidebar.tsx`
- Modify: `frontend/components/layout/MobileBottomNav.tsx`
- Create: `frontend/components/cron/CronJobCard.tsx`
- Create: `frontend/components/cron/CronModal.tsx`
- Create: `frontend/app/cron/page.tsx`

**Features:**
- Clean navigation link: "Cron Jobs" with Clock icon in Sidebar and Mobile Nav.
- Page layout:
  - `PageHero title="Cron Jobs"` with subtitle.
  - Top action bar: Quick status count + "Quick Presets" (1-click to set Indeed 6am, LinkedIn 7am, Wellfound 8am) + "+ New Schedule" button.
  - Schedule list cards:
    - Time display (e.g., `06:00 AM`), enabled toggle switch, provider badge with branding color.
    - Day-of-week interactive/display pills (Mon-Sun) highlighting active run days.
    - Query summary (`what: software engineer, where: India, limit: 25`).
    - Auto-parse badge (`Auto-parse: ON/OFF`).
    - Last run status (timestamp + badge + outcome text).
    - Functional buttons: **Run Now** (instant execution with loading spinner), **Edit**, **Delete** (with confirmation).
  - Add/Edit Modal dialog: Clean, minimalist modal with form fields for provider, name, hour/minute, days-of-week toggles, query params, and auto-parse toggle.

- [ ] **Step 1: Add "Cron Jobs" to `DesktopSidebar.tsx` and `MobileBottomNav.tsx`**
- [ ] **Step 2: Build `CronJobCard.tsx` and `CronModal.tsx` components**
- [ ] **Step 3: Build `frontend/app/cron/page.tsx`**
- [ ] **Step 4: Verify frontend build passes cleanly**
Run: `npm run build` in `frontend` directory.
- [ ] **Step 5: Commit**
```bash
git add frontend/components/layout/DesktopSidebar.tsx frontend/components/layout/MobileBottomNav.tsx frontend/components/cron/ frontend/app/cron/
git commit -m "feat(frontend): create Cron Jobs page and navigation"
```

---

### Task 6: End-to-End Verification

**Files:**
- Test: `backend/tests/test_cron_e2e.py`
- Browser verification using preview / curl

- [ ] **Step 1: Write and run end-to-end integration test verifying full backend cron flow**
- [ ] **Step 2: Start backend and frontend, verify browser UI rendered correctly**
- [ ] **Step 3: Commit and summarize**
