"""RED test: blocked companies never promote bronze -> silver."""

import time
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import init_db


def _suffix(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000)}"


def test_normalize_company_name():
    from src.services.blocked_companies import normalize_company_name

    assert normalize_company_name("  Acme   Corp ") == "acme corp"
    assert normalize_company_name("Google") == "google"
    # normalized-exact: 'Google India' must NOT equal 'google'
    assert normalize_company_name("Google India Pvt Ltd") != "google"


async def test_blocked_company_skips_parse_and_unblock_repromotes():
    from src.services.blocked_companies import normalize_company_name  # noqa: F401
    from src.services.raw_ingestion import save_raw_indeed_job

    await init_db()
    suffix = _suffix("test_block")
    company = f"Test Blocked Co {suffix}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # block the company
        resp = await client.post("/api/companies/block", json={"company_name": company})
        assert resp.status_code == 200, resp.text

        listed = await client.get("/api/companies/blocked")
        assert listed.status_code == 200
        names = [r["company_name_normalized"] for r in listed.json()]
        assert normalize_company_name(company) in names

        # seed a bronze row for the blocked company
        await save_raw_indeed_job({
            "external_id": f"test_block_ind_{suffix}",
            "title": "Junior Python Engineer",
            "company_name": company,
            "location_raw": "Bengaluru, Karnataka",
            "location_city": "bengaluru",
            "location_country": "India",
            "apply_url": f"http://in.indeed.com/job/test_block_ind_{suffix}",
            "easy_apply_available": True,
            "attributes": [],
            "salary_raw": "10 - 15 LPA",
            "description_html": "<p>hi</p>",
            "description_text": "Looking for freshers with 0 to 1 years experience.",
            "date_published": None,
            "raw_payload": {"id": suffix},
        })

        # parse directly (bypass background queue for determinism)
        from src.services.parser_service import ParserService
        result = await ParserService.parse_indeed_jobs(batch_size=50, use_llm=False)
        assert result.get("skipped_blocked", 0) >= 1

        # blocked row must NOT be in silver
        search = await client.get("/api/jobs/unified", params={"limit": 200})
        assert search.status_code == 200
        items = search.json() if isinstance(search.json(), list) else search.json().get("items", search.json())
        assert all(j.get("external_id") != f"test_block_ind_{suffix}" for j in items)

        # unblock -> re-parse promotes
        unblock = await client.request("DELETE", "/api/companies/block", json={"company_name": company})
        assert unblock.status_code == 200, unblock.text
        result2 = await ParserService.parse_indeed_jobs(batch_size=50, use_llm=False)
        assert result2.get("promoted_to_unified", 0) >= 1

        search2 = await client.get("/api/jobs/unified", params={"limit": 200})
        items2 = search2.json() if isinstance(search2.json(), list) else search2.json().get("items", search2.json())
        assert any(j.get("external_id") == f"test_block_ind_{suffix}" for j in items2)


async def test_blocked_skip_hides_from_status_and_counts_once():
    """Blocked rows must not show as pending; each hit ticks the red counter exactly once."""
    from src.services.raw_ingestion import save_raw_indeed_job
    from src.services.parser_service import ParserService

    await init_db()
    suffix = _suffix("test_blockcnt")
    company = f"Test Blocked Counter {suffix}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        status_before = (await client.get("/api/status/parsing")).json()
        baseline_unparsed = status_before["indeed"]["unparsed"]

        resp = await client.post("/api/companies/block", json={"company_name": company})
        assert resp.status_code == 200, resp.text

        await save_raw_indeed_job({
            "external_id": f"test_blockcnt_ind_{suffix}",
            "title": "Junior Python Engineer",
            "company_name": company,
            "location_raw": "Bengaluru, Karnataka",
            "location_city": "bengaluru",
            "location_country": "India",
            "apply_url": f"http://in.indeed.com/job/test_blockcnt_ind_{suffix}",
            "easy_apply_available": True,
            "attributes": [],
            "salary_raw": "10 - 15 LPA",
            "description_html": "<p>hi</p>",
            "description_text": "Looking for freshers with 0 to 1 years experience.",
            "date_published": None,
            "raw_payload": {"id": suffix},
        })

        result = await ParserService.parse_indeed_jobs(batch_size=50, use_llm=False)
        assert result.get("skipped_blocked", 0) >= 1

        # red counter ticked to 1
        listed = (await client.get("/api/companies/blocked")).json()
        row = next(r for r in listed if r["company_name_normalized"] == company.lower())
        assert row["blocked_attempts"] == 1

        # pending swallows the blocked row again
        status_after = (await client.get("/api/status/parsing")).json()
        assert status_after["indeed"]["unparsed"] == baseline_unparsed

        # second parse must NOT double-count (row already handled)
        result2 = await ParserService.parse_indeed_jobs(batch_size=50, use_llm=False)
        assert result2.get("skipped_blocked", 0) == 0
        listed2 = (await client.get("/api/companies/blocked")).json()
        row2 = next(r for r in listed2 if r["company_name_normalized"] == company.lower())
        assert row2["blocked_attempts"] == 1

        # cleanup: unblock resets the flag so the row becomes parseable again
        unblock = await client.request("DELETE", "/api/companies/block", json={"company_name": company})
        assert unblock.status_code == 200, unblock.text
        result3 = await ParserService.parse_indeed_jobs(batch_size=50, use_llm=False)
        assert result3.get("promoted_to_unified", 0) >= 1
