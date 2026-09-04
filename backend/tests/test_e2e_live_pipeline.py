import pytest
import time
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import init_db
from src.services.raw_ingestion import save_raw_wellfound_job

@pytest.mark.asyncio
async def test_live_scraping_persists_raw_and_manual_parsing():
    await init_db()
    suffix = str(int(time.time()))
    # Seed a fresh raw wellfound job
    await save_raw_wellfound_job({
        "external_id": f"wf_test_{suffix}",
        "job_slug": "backend-engineer",
        "title": "Backend Engineer",
        "company_name": "Startup Alpha",
        "company_slug": "startup-alpha",
        "company_logo_url": None,
        "company_website": None,
        "location_raw": "Bengaluru",
        "locations_list": ["Bengaluru"],
        "is_remote": True,
        "is_international": False,
        "salary_raw": "₹15L – ₹25L",
        "native_years_min": 0,
        "native_years_max": 2,
        "live_start_at": int(time.time()),
        "url": f"https://wellfound.com/jobs/wf_test_{suffix}-backend-engineer",
        "description_html": "<p>Fast growing startup</p>",
        "description_text": "Looking for fresh graduates with 0-2 years experience.",
        "posted_at": None,
        "raw_payload": {"test": suffix},
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Check parsing status shows raw records
        status_resp = await client.get("/api/status/parsing")
        assert status_resp.status_code == 200
        st = status_resp.json()
        assert st["wellfound"]["total_raw"] >= 1

        # 2. Trigger manual parsing for Wellfound
        parse_wf = await client.post("/api/parse/wellfound?batch_size=5&use_llm=false")
        assert parse_wf.status_code == 200
        p_data = parse_wf.json()
        assert p_data["promoted_to_unified"] >= 1

        # 3. Check unified jobs endpoint returns parsed records
        uni_resp = await client.get("/api/jobs/unified?source=wellfound")
        assert uni_resp.status_code == 200
        jobs = uni_resp.json()
        assert len(jobs) >= 1
        target_job = next((j for j in jobs if j["external_id"] == f"wf_test_{suffix}"), None)
        assert target_job is not None
        assert target_job["salary_min_inr_year"] == 1500000
        assert target_job["salary_max_inr_year"] == 2500000
        assert target_job["is_fresher_friendly"] is True
