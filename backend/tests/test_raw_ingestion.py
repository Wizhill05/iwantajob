import pytest
from sqlalchemy import select
from src.core.database import async_session_maker, init_db
from src.services.raw_ingestion import (
    save_raw_indeed_job,
    save_raw_linkedin_job,
    save_raw_wellfound_job,
)
from src.models.db_entities import RawIndeedJob, RawLinkedInJob, RawWellfoundJob

@pytest.mark.asyncio
async def test_save_raw_indeed():
    await init_db()
    data = {
        "external_id": "test_jk_123",
        "tracking_key": "track_123",
        "title": "Software Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru, India",
        "location_city": "bengaluru",
        "location_country": "India",
        "is_remote": False,
        "apply_url": "http://in.indeed.com/job/test_jk_123",
        "easy_apply_available": True,
        "attributes": [{"label": "Fresher"}],
        "salary_raw": "₹12L - ₹18L",
        "description_html": "<p>Job</p>",
        "description_text": "Job text",
        "date_published": None,
        "raw_payload": {"key": "test_jk_123"},
    }
    await save_raw_indeed_job(data)
    async with async_session_maker() as session:
        res = await session.execute(
            select(RawIndeedJob).where(RawIndeedJob.external_id == "test_jk_123")
        )
        job = res.scalar_one_or_none()
        assert job is not None
        assert job.easy_apply_available is True
        assert job.company_name == "TestCorp"

    # Test fallback when company_name is None
    data_none_company = dict(data)
    data_none_company["external_id"] = "test_jk_none_company"
    data_none_company["company_name"] = None
    data_none_company["title"] = None
    await save_raw_indeed_job(data_none_company)
    async with async_session_maker() as session:
        res = await session.execute(
            select(RawIndeedJob).where(RawIndeedJob.external_id == "test_jk_none_company")
        )
        job = res.scalar_one_or_none()
        assert job is not None
        assert job.company_name == "Unknown"
        assert job.title == "Unknown"

@pytest.mark.asyncio
async def test_save_raw_linkedin():
    await init_db()
    data = {
        "external_id": "li_4430825",
        "title": "AI Engineer",
        "company_name": "Shamrock AI",
        "company_logo_url": "https://media.licdn.com/logo.png",
        "company_website": "https://linkedin.com/company/shamrock",
        "location_raw": "Bengaluru, India",
        "city": "bengaluru",
        "is_remote": True,
        "is_international": False,
        "url": "https://linkedin.com/jobs/view/li_4430825",
        "salary_raw": None,
        "description_html": "<p>Desc</p>",
        "description_text": "Desc text",
        "posted_at": None,
        "raw_payload": {"id": "li_4430825"},
    }
    await save_raw_linkedin_job(data)
    async with async_session_maker() as session:
        res = await session.execute(
            select(RawLinkedInJob).where(RawLinkedInJob.external_id == "li_4430825")
        )
        job = res.scalar_one_or_none()
        assert job is not None
        assert job.is_remote is True
        assert job.company_name == "Shamrock AI"

@pytest.mark.asyncio
async def test_save_raw_wellfound():
    await init_db()
    data = {
        "external_id": "wf_4666122",
        "job_slug": "ai-engineer",
        "title": "AI Engineer",
        "company_name": "GoComet",
        "company_slug": "gocomet",
        "company_logo_url": "https://photos.wellfound.com/logo.jpg",
        "company_website": "https://wellfound.com/company/gocomet",
        "location_raw": "Bengaluru",
        "locations_list": ["Bengaluru"],
        "is_remote": False,
        "is_international": False,
        "salary_raw": "₹25L – ₹45L",
        "native_years_min": 3,
        "native_years_max": 8,
        "live_start_at": 1788428419,
        "url": "https://wellfound.com/jobs/wf_4666122-ai-engineer",
        "description_html": "<p>Desc</p>",
        "description_text": "Desc text",
        "posted_at": None,
        "raw_payload": {"id": "wf_4666122"},
    }
    await save_raw_wellfound_job(data)
    async with async_session_maker() as session:
        res = await session.execute(
            select(RawWellfoundJob).where(RawWellfoundJob.external_id == "wf_4666122")
        )
        job = res.scalar_one_or_none()
        assert job is not None
        assert job.native_years_min == 3
        assert job.native_years_max == 8
