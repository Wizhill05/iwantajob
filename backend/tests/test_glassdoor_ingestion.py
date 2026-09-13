import pytest
from sqlalchemy import select, delete
from src.core.database import async_session_maker, init_db
from src.models.db_entities import RawGlassdoorJob, UnifiedJob
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
async def test_save_raw_glassdoor_job_dedup():
    job_data = {
        "external_id": "gd_test_101",
        "title": "Staff AI Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru, India",
        "city": "bengaluru",
        "is_remote": False,
        "is_international": False,
        "url": "https://www.glassdoor.com/job-listing/-jl.htm?jl=gd_test_101",
        "salary_raw": "₹30L - ₹50L",
        "easy_apply_available": True,
        "description_text": "Building advanced LLM autonomous agents.",
        "raw_payload": {"id": "gd_test_101"},
    }

    # 1. First insert should succeed
    inserted = await save_raw_glassdoor_job(job_data)
    assert inserted is True

    # 2. Second insert with same external_id should be skipped
    inserted_again = await save_raw_glassdoor_job(job_data)
    assert inserted_again is False

    # 3. If present in unified_jobs, also skip
    async with async_session_maker() as session:
        raw_row = (
            await session.execute(select(RawGlassdoorJob).where(RawGlassdoorJob.external_id == "gd_test_101"))
        ).scalar_one()

        unified_job = UnifiedJob(
            source="glassdoor",
            external_id="gd_test_102",
            raw_ref_id=raw_row.id,
            url="https://www.glassdoor.com/job-listing/-jl.htm?jl=gd_test_102",
            title="Senior Engineer",
            company_name="TestCorp",
            location_raw="Bengaluru, India",
            description_text="Desc",
        )
        session.add(unified_job)
        await session.commit()

    # Attempting to save raw job matching unified job should be skipped
    job_data_unified = {
        "external_id": "gd_test_102",
        "title": "Senior Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru, India",
        "url": "https://www.glassdoor.com/job-listing/-jl.htm?jl=gd_test_102",
        "description_text": "Desc",
    }
    inserted_unified = await save_raw_glassdoor_job(job_data_unified)
    assert inserted_unified is False
