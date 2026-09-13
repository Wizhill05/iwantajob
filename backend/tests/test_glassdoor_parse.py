import pytest
from sqlalchemy import select, delete
from src.core.database import async_session_maker, init_db
from src.models.db_entities import RawGlassdoorJob, UnifiedJob
from src.services.parser_service import ParserService
from src.services.raw_ingestion import save_raw_glassdoor_job


@pytest.fixture(autouse=True)
async def setup_test_db():
    await init_db()
    async with async_session_maker() as session:
        await session.execute(delete(RawGlassdoorJob).where(RawGlassdoorJob.external_id.like("gd_%")))
        await session.execute(delete(UnifiedJob).where(UnifiedJob.external_id.like("gd_%")))
        await session.commit()
    yield
    async with async_session_maker() as session:
        await session.execute(delete(RawGlassdoorJob).where(RawGlassdoorJob.external_id.like("gd_%")))
        await session.execute(delete(UnifiedJob).where(UnifiedJob.external_id.like("gd_%")))
        await session.commit()


@pytest.mark.asyncio
async def test_parse_glassdoor_jobs_promotion():
    # Insert 2 raw glassdoor jobs
    job1 = {
        "external_id": "gd_test_201",
        "title": "Lead Software Engineer",
        "company_name": "GDCorp",
        "location_raw": "Bengaluru, Karnataka, India",
        "city": "bengaluru",
        "is_remote": False,
        "is_international": False,
        "url": "https://www.glassdoor.com/job-listing/-jl.htm?jl=gd_test_201",
        "salary_raw": "₹20L - ₹30L",
        "easy_apply_available": True,
        "description_text": "We need 3-5 years of experience in Python and FastAPI.",
        "raw_payload": {},
    }
    job2 = {
        "external_id": "gd_test_202",
        "title": "Fresher AI Intern",
        "company_name": "GDCorp",
        "location_raw": "Remote, India",
        "city": None,
        "is_remote": True,
        "is_international": False,
        "url": "https://www.glassdoor.com/job-listing/-jl.htm?jl=gd_test_202",
        "salary_raw": "$50k - $70k",
        "easy_apply_available": False,
        "description_text": "Recent college graduate, fresher internship.",
        "raw_payload": {},
    }

    await save_raw_glassdoor_job(job1)
    await save_raw_glassdoor_job(job2)

    # Status before parse
    status_before = await ParserService.get_parsing_status()
    assert "glassdoor" in status_before
    assert status_before["glassdoor"]["unparsed"] >= 2

    # Trigger manual parse with use_llm=False (regex path)
    res = await ParserService.parse_glassdoor_jobs(batch_size=50, use_llm=False)
    assert res["source"] == "glassdoor"
    assert res["promoted_to_unified"] >= 2

    # Verify silver records
    async with async_session_maker() as session:
        promoted_jobs = (
            await session.execute(
                select(UnifiedJob).where(UnifiedJob.source == "glassdoor", UnifiedJob.external_id.like("gd_%"))
            )
        ).scalars().all()
        assert len(promoted_jobs) == 2

        p1 = next(j for j in promoted_jobs if j.external_id == "gd_test_201")
        assert p1.salary_min_inr_year == 2000000
        assert p1.salary_max_inr_year == 3000000
        assert p1.easy_apply_available is True
        assert p1.experience_min_years == 3

        p2 = next(j for j in promoted_jobs if j.external_id == "gd_test_202")
        assert p2.is_fresher_friendly is True
        assert p2.is_remote is True

    # Rerun parse — should process 0 new items
    rerun_res = await ParserService.parse_glassdoor_jobs(batch_size=50, use_llm=False)
    assert rerun_res["promoted_to_unified"] == 0
