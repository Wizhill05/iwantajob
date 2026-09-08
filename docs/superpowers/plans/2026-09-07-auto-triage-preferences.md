# Auto-Triage Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-sort unified jobs into saved/archived on demand using user-configurable taste preferences.

**Architecture:** Single-row `user_preferences` table + pure-Python strict rules engine (`AutoTriageService`) + 3 REST endpoints + `/settings` page linked from bottom of `/jobs`.

**Tech Stack:** FastAPI + SQLAlchemy async (NullPool) + Postgres; Next.js App Router + TypeScript + fetch ApiClient.

**Spec:** `docs/superpowers/specs/2026-09-07-auto-triage-design.md`

## Global Constraints

- DB URL `postgresql+asyncpg://postgres:postgres@localhost:5432/iwantajob_db`, NullPool engine stays.
- New table created via `Base.metadata.create_all` in `init_db` (import entity in `init_db`).
- Pydantic v2 for request/response models in `main.py`.
- Frontend `API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''`, keep `request()` error handling.
- TDD: failing test first per task, then minimal implementation, then commit per task.

---

### Task 1: `UserPreference` model + defaults

**Files:**
- Modify: `backend/src/models/db_entities.py`
- Test: `backend/tests/test_auto_triage.py`

**Interfaces:**
- Consumes: `Base` from `src.core.database`, `JSONB` dialect.
- Produces: `UserPreference` ORM class + `DEFAULT_PREFS: dict` consumed by Task 2/3.

- [ ] **Step 1: Write the failing test**

```python
def test_default_prefs_shape():
    from src.models.db_entities import DEFAULT_PREFS
    assert DEFAULT_PREFS["id"] == "default"
    assert DEFAULT_PREFS["allow_international"] is False
    assert DEFAULT_PREFS["max_experience_years"] == 2
    assert "ai engineer" in DEFAULT_PREFS["preferred_title_keywords"]
    assert "senior" in DEFAULT_PREFS["blocked_title_keywords"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py::test_default_prefs_shape -v`
Expected: FAIL with "No module named src.models.db_entities.DEFAULT_PREFS" / collection error.

- [ ] **Step 3: Write minimal implementation**

```python
class UserPreference(Base):
    __tablename__ = "user_preferences"
    id = Column(String, primary_key=True, default="default")
    allow_international = Column(Boolean, default=False, nullable=False)
    max_experience_years = Column(Integer, default=2, nullable=False)
    require_fresher_friendly = Column(Boolean, default=False, nullable=False)
    preferred_title_keywords = Column(JSONB, default=list, nullable=False)
    blocked_title_keywords = Column(JSONB, default=list, nullable=False)
    preferred_cities = Column(JSONB, default=list, nullable=False)
    min_salary_inr_year = Column(BigInteger, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

DEFAULT_PREFS: dict = {
    "id": "default",
    "allow_international": False,
    "max_experience_years": 2,
    "require_fresher_friendly": False,
    "preferred_title_keywords": ["ai engineer", "genai", "gen ai", "agentic", "prompt engineer", "python", "intern"],
    "blocked_title_keywords": ["senior", "staff", "lead", "principal", "manager", "architect", "qa", "asic", "snowflake"],
    "preferred_cities": [],
    "min_salary_inr_year": None,
}
```

Place after `UnifiedJob` in `backend/src/models/db_entities.py`. Needs imports already present: `String, Boolean, BigInteger, Integer, DateTime, func`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py::test_default_prefs_shape -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/db_entities.py backend/tests/test_auto_triage.py
git commit -m "feat: add UserPreference model with taste defaults"
```

### Task 2: `AutoTriageService.classify` strict rules engine

**Files:**
- Create: `backend/src/services/auto_triage.py`
- Test: `backend/tests/test_auto_triage.py` (append)

**Interfaces:**
- Consumes: `DEFAULT_PREFS` dict shape from Task 1.
- Produces: `AutoTriageService.classify(job: dict, prefs: dict) -> tuple[str, str]` where action in `{"save","archive","none"}` consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```python
def test_classify_archives_international():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "AI Engineer", "is_international": True, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, reason = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "archive" and "intl" in reason or "non-india" in reason

def test_classify_archives_senior_over_limit():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "Senior AI Engineer", "is_international": False, "experience_min_years": 6, "is_fresher_friendly": False, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "archive"

def test_classify_saves_junior_ai_india():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "AI Engineer", "is_international": False, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "save"

def test_classify_leaves_unmatched_active():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "Accountant", "is_international": False, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "none"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py -v`
Expected: FAIL with "No module named src.services.auto_triage".

- [ ] **Step 3: Write minimal implementation**

```python
class AutoTriageService:
    @staticmethod
    def classify(job: dict, prefs: dict) -> tuple[str, str]:
        title = (job.get("title") or "").lower()
        if job.get("is_international") and not prefs.get("allow_international", False):
            return ("archive", "non-india")
        exp_min = job.get("experience_min_years")
        max_exp = prefs.get("max_experience_years", 2)
        if exp_min is not None and max_exp is not None and exp_min > max_exp:
            return ("archive", f"experienced-{exp_min}y-over-limit")
        for kw in prefs.get("blocked_title_keywords") or []:
            if kw.lower() in title:
                return ("archive", f"blocked-title:{kw}")
        if prefs.get("require_fresher_friendly") and not job.get("is_fresher_friendly"):
            return ("none", "not-fresher")
        min_sal = prefs.get("min_salary_inr_year")
        if min_sal is not None and (job.get("salary_min_inr_year") or 0) < min_sal:
            return ("none", "below-min-salary")
        cities = prefs.get("preferred_cities") or []
        if cities and (job.get("city") or "") not in [c.lower() for c in cities]:
            return ("none", "city-not-preferred")
        for kw in prefs.get("preferred_title_keywords") or []:
            if kw.lower() in title:
                return ("save", f"matched:{kw}")
        return ("none", "no-match")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auto_triage.py backend/tests/test_auto_triage.py
git commit -m "feat: add strict auto-triage rules engine"
```

### Task 3: Backend API — GET/PUT /api/preferences + POST /api/jobs/auto-triage

**Files:**
- Modify: `backend/src/main.py`
- Modify: `backend/src/core/database.py` (import db_entities for create_all — add `import src.models.db_entities` already present; ensure UserPreference registered)
- Test: `backend/tests/test_auto_triage.py` (append API tests)

**Interfaces:**
- Consumes: `UserPreference`, `DEFAULT_PREFS`, `AutoTriageService.classify`, `UnifiedJob`, `async_session_maker`.
- Produces: `GET /api/preferences`, `PUT /api/preferences`, `POST /api/jobs/auto-triage` consumed by Task 4.

- [ ] **Step 1: Write the failing API tests**

```python
import pytest
@pytest.mark.asyncio
async def test_prefs_roundtrip_and_dry_run():
    from src.core.database import init_db
    await init_db()
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    r = c.get("/api/preferences")
    assert r.status_code == 200 and r.json()["max_experience_years"] == 2
    r = c.put("/api/preferences", json={"max_experience_years": 1})
    assert r.json()["max_experience_years"] == 1
    r = c.put("/api/preferences", json={"max_experience_years": 2})
    assert r.json()["max_experience_years"] == 2
    r = c.post("/api/jobs/auto-triage?dry_run=true&limit=5")
    assert r.status_code == 200 and "evaluated" in r.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py::test_prefs_roundtrip_and_dry_run -v`
Expected: FAIL with 404 (no such route).

- [ ] **Step 3: Write minimal implementation** in `backend/src/main.py` (append before triage section):

```python
class PreferencesUpdateRequest(BaseModel):
    allow_international: bool | None = None
    max_experience_years: int | None = None
    require_fresher_friendly: bool | None = None
    preferred_title_keywords: list[str] | None = None
    blocked_title_keywords: list[str] | None = None
    preferred_cities: list[str] | None = None
    min_salary_inr_year: int | None = None

def _prefs_to_dict(p) -> dict: ...
@app.get("/api/preferences", tags=["System"])
async def get_preferences(): ...  # select id='default', insert DEFAULT_PREFS if missing
@app.put("/api/preferences", tags=["System"])
async def update_preferences(payload: PreferencesUpdateRequest): ...  # partial update + commit
@app.post("/api/jobs/auto-triage", tags=["System"])
async def auto_triage_jobs(dry_run: bool = True, limit: int = 200, force: bool = False): ...
```

Full bodies: get-or-create; put applies only non-None fields; post loads prefs, selects UnifiedJob ordered by parsed_at desc limit N (all when force else filter `is_saved==False AND is_archived==False`), classifies each, bulk-updates via `update()` unless dry_run, returns counts + details (cap details at limit).

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.py backend/tests/test_auto_triage.py
git commit -m "feat: add preferences and auto-triage endpoints"
```

### Task 4: Frontend — api client, types, /settings page, jobs bottom button

**Files:**
- Modify: `frontend/lib/types.ts` (append `UserPreferences`, `AutoTriageResult`)
- Modify: `frontend/lib/api.ts` (append `getPreferences`, `updatePreferences`, `autoTriage`)
- Create: `frontend/app/settings/page.tsx`
- Modify: `frontend/app/jobs/page.tsx` (bottom button linking to `/settings`)

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces: `/settings` UI driving classification.

- [ ] **Step 1: Write failing type check** — add types + client methods + page, then run `npx tsc --noEmit`; missing pieces = fail.

```typescript
export interface UserPreferences {
  id: string;
  allow_international: boolean;
  max_experience_years: number;
  require_fresher_friendly: boolean;
  preferred_title_keywords: string[];
  blocked_title_keywords: string[];
  preferred_cities: string[];
  min_salary_inr_year: number | null;
}
export interface AutoTriageResult {
  dry_run: boolean; evaluated: number; saved: number;
  archived: number; left_active: number; skipped_manual: number;
  details: { id: string; action: string; reason: string }[];
}
```

Client:

```typescript
async getPreferences(): Promise<UserPreferences> {
  return this.request<UserPreferences>('/api/preferences');
}
async updatePreferences(payload: Partial<UserPreferences>): Promise<UserPreferences> {
  return this.request<UserPreferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(payload) });
}
async autoTriage(params: { dry_run?: boolean; limit?: number; force?: boolean } = {}): Promise<AutoTriageResult> {
  const sp = new URLSearchParams();
  if (params.dry_run !== undefined) sp.set('dry_run', String(params.dry_run));
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.force !== undefined) sp.set('force', String(params.force));
  const qs = sp.toString();
  return this.request<AutoTriageResult>(`/api/jobs/auto-triage${qs ? `?${qs}` : ''}`, { method: 'POST' });
}
```

`/settings` page: client component loading prefs via `api.getPreferences()`, sections Location (`allow_international` checkbox, `preferred_cities` comma input), Experience (`max_experience_years` number, `require_fresher_friendly` checkbox), Roles (two comma inputs for keywords), Salary (`min_salary_lpa` number → `*100000`), Save button (`PUT`), Dry-run preview button (`POST dry_run=true limit=50`, show counts).

Jobs page bottom (after pagination, before modals): single button:

```tsx
<div className="flex justify-center pt-8">
  <Link href="/settings" className="...">Job preferences</Link>
</div>
```

- [ ] **Step 2: Run type check to verify it fails first** (before adding page), then passes after.

Run: `npx tsc --noEmit`
Expected first: FAIL (missing exports); after: PASS.

- [ ] **Step 3: Implement** per snippets above.

- [ ] **Step 4: Re-run type check**

Run: `npx tsc --noEmit`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts frontend/app/settings/page.tsx frontend/app/jobs/page.tsx
git commit -m "feat: add settings page and jobs preferences button"
```

### Task 5: Full verification

- [ ] **Step 1: Backend tests**

Run: `.venv/bin/python -m pytest tests/test_auto_triage.py tests/test_database.py -v`
Expected: PASS

- [ ] **Step 2: Frontend check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Manual dry-run vs real DB** (read-only check, optional): `POST /api/jobs/auto-triage?dry_run=true&limit=200` returns plausible saved/archived split resembling taste report (majority of saves fresher AI-India, archives senior/intl).

- [ ] **Step 4: Commit docs**

```bash
git add docs/superpowers/specs/2026-09-07-auto-triage-design.md docs/superpowers/plans/2026-09-07-auto-triage-preferences.md
git commit -m "docs: auto-triage preferences spec and plan"
```
