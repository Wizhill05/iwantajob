import pytest
import time
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import init_db
from src.services.raw_ingestion import (
    save_raw_indeed_job,
    save_raw_linkedin_job,
    save_raw_wellfound_job,
)

@pytest.mark.asyncio
async def test_manual_parsers_and_status():
    await init_db()
    suffix = f"_{int(time.time() * 1000)}"

    # Seed 1 of each raw with unique IDs
    await save_raw_indeed_job({
        "external_id": f"test_parse_ind{suffix}",
        "title": "Junior Python Engineer",
        "company_name": "Tech Corp",
        "location_raw": "Bengaluru, Karnataka",
        "location_city": "bengaluru",
        "location_country": "India",
        "apply_url": f"http://in.indeed.com/job/test_parse_ind{suffix}",
        "easy_apply_available": True,
        "attributes": [{"label": "Fresher"}],
        "salary_raw": "10 - 15 LPA",
        "description_html": "<p>Great job</p>",
        "description_text": "Looking for freshers with 0 to 1 years experience.",
        "date_published": None,
        "raw_payload": {"id": f"test_parse_ind{suffix}"},
    })

    await save_raw_linkedin_job({
        "external_id": f"test_parse_li{suffix}",
        "title": "Backend Developer",
        "company_name": "LinkedIn Co",
        "company_logo_url": None,
        "company_website": None,
        "location_raw": "Pune, India",
        "city": "pune",
        "is_remote": True,
        "is_international": False,
        "url": f"https://linkedin.com/jobs/view/test_parse_li{suffix}",
        "salary_raw": None,
        "description_html": "<p>Work</p>",
        "description_text": "Candidate should have 2 to 4 years experience in Python.",
        "posted_at": None,
        "raw_payload": {"id": f"test_parse_li{suffix}"},
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Check status
        status_resp = await client.get("/api/status/parsing")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert "indeed" in status_data
        assert "linkedin" in status_data
        assert "wellfound" in status_data

        # 2. Parse Indeed manually
        ind_resp = await client.post("/api/parse/indeed?batch_size=10&use_llm=false")
        assert ind_resp.status_code == 200
        ind_data = ind_resp.json()
        assert ind_data["promoted_to_unified"] >= 1

        # 3. Parse LinkedIn manually
        li_resp = await client.post("/api/parse/linkedin?batch_size=10&use_llm=false")
        assert li_resp.status_code == 200
        li_data = li_resp.json()
        assert li_data["promoted_to_unified"] >= 1

        # 4. Query unified jobs with fresher filter
        uni_resp = await client.get("/api/jobs/unified?is_fresher_friendly=true")
        assert uni_resp.status_code == 200
        uni_jobs = uni_resp.json()
        assert len(uni_jobs) >= 1
        found_fresher = next((j for j in uni_jobs if j["external_id"] == f"test_parse_ind{suffix}"), None)
        assert found_fresher is not None
        assert found_fresher["salary_min_inr_year"] == 1000000
        assert found_fresher["easy_apply_available"] is True
        assert found_fresher["is_saved"] is False
        assert found_fresher["is_archived"] is False

        fresher_id = found_fresher["id"]

        # 5. Test PATCH /api/jobs/unified/{job_id}/triage (save job)
        save_resp = await client.patch(f"/api/jobs/unified/{fresher_id}/triage", json={"is_saved": True})
        assert save_resp.status_code == 200
        assert save_resp.json()["is_saved"] is True
        assert save_resp.json()["is_archived"] is False

        # Verify in query with filter is_saved=true
        saved_resp = await client.get("/api/jobs/unified?is_saved=true")
        assert saved_resp.status_code == 200
        assert any(j["id"] == fresher_id for j in saved_resp.json())

        # 6. Test Archive overrides saved
        arch_resp = await client.patch(f"/api/jobs/unified/{fresher_id}/triage", json={"is_archived": True})
        assert arch_resp.status_code == 200
        assert arch_resp.json()["is_archived"] is True
        assert arch_resp.json()["is_saved"] is False

        # 7. Test Batch Triage Update
        batch_resp = await client.patch("/api/jobs/unified/triage", json={"job_ids": [fresher_id], "is_saved": True})
        assert batch_resp.status_code == 200
        assert batch_resp.json()["updated_count"] == 1

        # Check that it's saved again
        check_resp = await client.get(f"/api/jobs/unified?is_saved=true")
        assert any(j["id"] == fresher_id for j in check_resp.json())
