# Centralised Database & Decoupled Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PostgreSQL raw staging tables, unified clean jobs table, pay & experience extraction engines, manual parsing endpoints for Indeed, LinkedIn, and Wellfound, and a unified jobs query endpoint.

**Architecture:** Two-tier Bronze-Silver storage model. Scraping endpoints store 100% raw data into provider-specific tables (`raw_indeed_jobs`, `raw_linkedin_jobs`, `raw_wellfound_jobs`). Decoupled manual parsing endpoints (`/api/parse/{provider}`) read unparsed raw rows, run regex and LLM fallback enrichment for INR/year integer pay and experience, and write clean rows to `unified_jobs`.

**Tech Stack:** Python 3.12, FastAPI, PostgreSQL (asyncpg + SQLAlchemy 2.0 async), curl_cffi, Pydantic v2.

**Spec:** `docs/superpowers/specs/2026-09-04-centralised-database-design.md`

## Global Constraints
- Database: PostgreSQL running on `localhost:5432/iwantajob_db` (credentials `postgres:postgres`).
- Parsing APIs must remain completely separate for Indeed, LinkedIn, and Wellfound, and manually triggered.
- All salaries must be normalized to annual INR integer (`BIGINT`).
- Zero loss of raw scraping data.

---

### Task 1: Database Engine, Base Models, and Async Session Management

**Files:**
- Create: `backend/src/core/database.py`
- Create: `backend/src/models/db_entities.py`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Produces: `async_session_maker`, `Base`, `init_db()`, `RawIndeedJob`, `RawLinkedInJob`, `RawWellfoundJob`, `UnifiedJob`

- [ ] **Step 1: Write the failing test for DB connection and table creation**

```python
# backend/tests/test_database.py
import pytest
from sqlalchemy import text
from src.core.database import async_session_maker, init_db, engine

@pytest.mark.asyncio
async def test_init_db_creates_tables():
    await init_db()
    async with async_session_maker() as session:
        result = await session.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        )
        tables = [row[0] for row in result.fetchall()]
        assert "raw_indeed_jobs" in tables
        assert "raw_linkedin_jobs" in tables
        assert "raw_wellfound_jobs" in tables
        assert "unified_jobs" in tables
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_database.py -v`
Expected: FAIL (cannot import `src.core.database`)

- [ ] **Step 3: Implement database connection and SQLAlchemy models**

Create `backend/src/core/database.py` and `backend/src/models/db_entities.py`.
Define `RawIndeedJob`, `RawLinkedInJob`, `RawWellfoundJob`, and `UnifiedJob` matching the spec.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_database.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/database.py backend/src/models/db_entities.py backend/tests/test_database.py
git commit -m "feat(db): add database setup and raw/unified SQLAlchemy entities"
```

---

### Task 2: Pay Normalizer & Experience Extractor Engine

**Files:**
- Create: `backend/src/services/pay_normalizer.py`
- Create: `backend/src/services/experience_extractor.py`
- Test: `backend/tests/test_enrichment_services.py`

**Interfaces:**
- Produces: `PayNormalizer.normalize(raw_str, min_val, max_val, currency, description_text) -> (min_inr, max_inr, currency, method)`
- Produces: `ExperienceExtractor.extract(native_min, native_max, description_text, attributes) -> (min_years, max_years, is_fresher_friendly, method)`

- [ ] **Step 1: Write test cases covering LPA, USD, monthly pay, and fresher experience**

```python
# backend/tests/test_enrichment_services.py
from src.services.pay_normalizer import PayNormalizer
from src.services.experience_extractor import ExperienceExtractor

def test_pay_normalizer_lpa():
    res = PayNormalizer.normalize(raw_salary="₹25L – ₹45L", s_min=None, s_max=None, currency="INR", description="")
    assert res["min_inr"] == 2500000
    assert res["max_inr"] == 4500000
    assert res["currency"] == "INR"
    assert res["method"] == "regex"

def test_pay_normalizer_usd():
    res = PayNormalizer.normalize(raw_salary="$25k – $50k", s_min=25000, s_max=50000, currency="USD", description="")
    assert res["min_inr"] == 25000 * 85
    assert res["max_inr"] == 50000 * 85
    assert res["currency"] == "USD"

def test_experience_extractor_fresher():
    res = ExperienceExtractor.extract(native_min=None, native_max=None, description="Looking for a fresh graduate with 0-1 years experience", attributes=[])
    assert res["min_years"] == 0
    assert res["is_fresher_friendly"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_enrichment_services.py -v`
Expected: FAIL

- [ ] **Step 3: Implement PayNormalizer and ExperienceExtractor**

Implement regex parser for Lakhs, K, ranges, currencies (USD, EUR, GBP, INR), monthly/hourly conversions, and fresher detection. Wire in optional LLM fallback using `freeapiforme.aryansingh.space/v1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_enrichment_services.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pay_normalizer.py backend/src/services/experience_extractor.py backend/tests/test_enrichment_services.py
git commit -m "feat(services): add PayNormalizer and ExperienceExtractor engines"
```

---

### Task 3: Raw Persistence for Ingestion Clients

**Files:**
- Create: `backend/src/services/raw_ingestion.py`
- Modify: `backend/src/clients/indeed.py` (add `apply_url` and `easy_apply_available`)
- Modify: `backend/src/main.py` (add `persist=True` option to `/api/scrape/*`)
- Test: `backend/tests/test_raw_ingestion.py`

**Interfaces:**
- Produces: `save_raw_indeed_jobs(jobs, raw_results)`
- Produces: `save_raw_linkedin_jobs(jobs, raw_items)`
- Produces: `save_raw_wellfound_jobs(jobs, raw_nodes)`

- [ ] **Step 1: Write test for saving raw jobs**

```python
# backend/tests/test_raw_ingestion.py
import pytest
from src.core.database import async_session_maker, init_db
from src.services.raw_ingestion import save_raw_indeed_job, save_raw_linkedin_job, save_raw_wellfound_job
from sqlalchemy import select
from src.models.db_entities import RawIndeedJob

@pytest.mark.asyncio
async def test_save_raw_indeed():
    await init_db()
    test_job = {
        "external_id": "test_jk_123",
        "title": "Software Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru",
        "apply_url": "http://in.indeed.com/job/123",
        "easy_apply_available": True,
        "description_text": "Fresher role",
        "raw_payload": {"test": 1}
    }
    await save_raw_indeed_job(test_job)
    async with async_session_maker() as session:
        res = await session.execute(select(RawIndeedJob).where(RawIndeedJob.external_id == "test_jk_123"))
        job = res.scalar_one_or_none()
        assert job is not None
        assert job.easy_apply_available is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_raw_ingestion.py -v`
Expected: FAIL

- [ ] **Step 3: Implement raw ingestion functions and indeed client adjustments**

Implement `save_raw_*` using PostgreSQL `ON CONFLICT (external_id) DO UPDATE`. Update `indeed.py` to populate `apply_url` and evaluate `easy_apply_available`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_raw_ingestion.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/raw_ingestion.py backend/src/clients/indeed.py backend/src/main.py backend/tests/test_raw_ingestion.py
git commit -m "feat(ingestion): implement raw staging persistence for Indeed, LinkedIn, Wellfound"
```

---

### Task 4: Separate Manual Parsing Endpoints & Unified Job Querying

**Files:**
- Create: `backend/src/services/parser_service.py`
- Modify: `backend/src/main.py`
- Test: `backend/tests/test_manual_parsers.py`

**Interfaces:**
- Produces: `POST /api/parse/indeed`
- Produces: `POST /api/parse/linkedin`
- Produces: `POST /api/parse/wellfound`
- Produces: `GET /api/status/parsing`
- Produces: `GET /api/jobs/unified`

- [ ] **Step 1: Write test verifying manual parsing moves rows from raw to unified**

```python
# backend/tests/test_manual_parsers.py
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import init_db

@pytest.mark.asyncio
async def test_parse_indeed_endpoint():
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/parse/indeed", params={"batch_size": 10, "use_llm": False})
        assert resp.status_code == 200
        data = resp.json()
        assert "processed" in data
        assert "promoted_to_unified" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_manual_parsers.py -v`
Expected: FAIL (route 404)

- [ ] **Step 3: Implement manual parsing services and endpoints**

Implement `ParserService.parse_indeed()`, `parse_linkedin()`, `parse_wellfound()`.
Wire endpoints in `backend/src/main.py`:
- `POST /api/parse/indeed`
- `POST /api/parse/linkedin`
- `POST /api/parse/wellfound`
- `GET /api/status/parsing`
- `GET /api/jobs/unified` with query filters for freshers, salary floor, city, and easy apply.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=/home/azureuser/iwantajob/backend /home/azureuser/iwantajob/backend/.venv/bin/pytest backend/tests/test_manual_parsers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/parser_service.py backend/src/main.py backend/tests/test_manual_parsers.py
git commit -m "feat(api): add separate manual parsing endpoints and unified jobs query route"
```

---

### Task 5: End-to-End Live Verification with Real Scrapes

**Files:**
- Create: `backend/tests/test_e2e_live_pipeline.py`

- [ ] **Step 1: Scrape real jobs from Indeed, LinkedIn, and Wellfound with `persist=True`**
- [ ] **Step 2: Verify rows are inserted into `raw_indeed_jobs`, `raw_linkedin_jobs`, and `raw_wellfound_jobs`**
- [ ] **Step 3: Query `/api/status/parsing` and verify unparsed counts**
- [ ] **Step 4: Trigger manual parsing via `POST /api/parse/indeed`, `/api/parse/wellfound`, `/api/parse/linkedin`**
- [ ] **Step 5: Query `/api/jobs/unified?is_fresher_friendly=true` and verify normalized INR/year integers and experience fields**
- [ ] **Step 6: Commit all passing tests and implementation**
