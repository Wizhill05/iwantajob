"""
Tests for POST /api/db/clear-bronze.

Bronze deletion must never destroy silver (unified_jobs) data:
- raw rows that have a silver counterpart (referenced via UnifiedJob.raw_ref_id
  or matching (source, external_id)) must survive,
- raw rows not yet parsed must be removed,
- unified_jobs rows must never be touched.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.core.database import async_session_maker, init_db
from src.main import app
from src.models.db_entities import (
    RawIndeedJob,
    RawLinkedInJob,
    RawWellfoundJob,
    UnifiedJob,
)


def _raw_indeed(external_id: str) -> dict:
    return {
        "external_id": external_id,
        "title": "Backend Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru, India",
        "location_city": "bengaluru",
        "location_country": "India",
        "is_remote": False,
        "apply_url": f"https://www.indeed.com/viewjob?jk={external_id}",
        "easy_apply_available": False,
        "attributes": [],
        "salary_raw": None,
        "description_html": None,
        "description_text": "desc",
        "date_published": None,
        "raw_payload": {"external_id": external_id},
    }


def _raw_linkedin(external_id: str) -> dict:
    return {
        "external_id": external_id,
        "title": "AI Engineer",
        "company_name": "TestCorp",
        "company_logo_url": None,
        "company_website": None,
        "location_raw": "Bengaluru, India",
        "city": "bengaluru",
        "is_remote": True,
        "is_international": False,
        "url": f"https://www.linkedin.com/jobs/view/{external_id}",
        "salary_raw": None,
        "description_html": None,
        "description_text": "desc",
        "posted_at": None,
        "raw_payload": {"external_id": external_id},
    }


def _raw_wellfound(external_id: str) -> dict:
    return {
        "external_id": external_id,
        "job_slug": external_id,
        "title": "Full Stack Engineer",
        "company_name": "TestCorp",
        "company_slug": "testcorp",
        "company_logo_url": None,
        "company_website": None,
        "location_raw": "Remote",
        "locations_list": [],
        "is_remote": True,
        "is_international": False,
        "salary_raw": None,
        "native_years_min": None,
        "native_years_max": None,
        "live_start_at": None,
        "url": f"https://wellfound.com/jobs/{external_id}",
        "description_html": None,
        "description_text": "desc",
        "posted_at": None,
        "raw_payload": {"external_id": external_id},
    }


def _unified(source: str, external_id: str, raw_ref_id) -> UnifiedJob:
    return UnifiedJob(
        source=source,
        external_id=external_id,
        raw_ref_id=raw_ref_id,
        url=f"https://unified.test/{source}/{external_id}",
        title="Parsed Engineer",
        company_name="TestCorp",
        location_raw="Bengaluru, India",
        description_text="desc",
    )


async def _seed(source: str, external_id: str, *, with_silver: bool):
    """Insert a raw row (and optionally its silver counterpart) for `source`."""
    raw_id = uuid.uuid4()
    async with async_session_maker() as session:
        if source == "indeed":
            session.add(RawIndeedJob(id=raw_id, **_raw_indeed(external_id)))
        elif source == "linkedin":
            session.add(RawLinkedInJob(id=raw_id, **_raw_linkedin(external_id)))
        else:
            session.add(RawWellfoundJob(id=raw_id, **_raw_wellfound(external_id)))

        if with_silver:
            session.add(_unified(source, external_id, raw_id))

        await session.commit()
    return raw_id


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.asyncio
async def test_clear_bronze_keeps_silver_parsed_raw_rows(client):
    """Raw rows already parsed into silver must survive a bronze deletion."""
    await init_db()
    suffix = uuid.uuid4().hex[:8]

    parsed_indeed = await _seed("indeed", f"test_bronze_parsed_in_{suffix}", with_silver=True)
    parsed_linkedin = await _seed("linkedin", f"test_bronze_parsed_li_{suffix}", with_silver=True)
    parsed_wellfound = await _seed("wellfound", f"test_bronze_parsed_wf_{suffix}", with_silver=True)
    # Unparsed rows — must be removed.
    unparsed_indeed = await _seed("indeed", f"test_bronze_unparsed_in_{suffix}", with_silver=False)
    unparsed_wellfound = await _seed("wellfound", f"test_bronze_unparsed_wf_{suffix}", with_silver=False)

    res = client.post("/api/db/clear-bronze")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["skipped_silver"] >= 3

    async with async_session_maker() as session:
        # Silver rows survive.
        unified = (
            await session.execute(
                select(UnifiedJob).where(
                    UnifiedJob.external_id.in_(
                        [
                            f"test_bronze_parsed_in_{suffix}",
                            f"test_bronze_parsed_li_{suffix}",
                            f"test_bronze_parsed_wf_{suffix}",
                        ]
                    )
                )
            )
        ).scalars().all()
        assert len(unified) == 3

        # Their bronze lineage survives too.
        raw_models = [
            (RawIndeedJob, parsed_indeed),
            (RawLinkedInJob, parsed_linkedin),
            (RawWellfoundJob, parsed_wellfound),
        ]
        for model, raw_id in raw_models:
            row = await session.get(model, raw_id)
            assert row is not None, f"{model.__tablename__} row parsed to silver was deleted"

        # Unparsed raw rows are removed.
        assert await session.get(RawIndeedJob, unparsed_indeed) is None
        assert await session.get(RawWellfoundJob, unparsed_wellfound) is None


@pytest.mark.asyncio
async def test_clear_bronze_keeps_silver_row_matched_only_by_external_id(client):
    """
    A raw row whose silver counterpart references it only by
    (source, external_id) — e.g. the raw row was re-ingested and got a new id —
    must also survive.
    """
    await init_db()
    suffix = uuid.uuid4().hex[:8]
    external_id = f"test_bronze_reingested_{suffix}"

    # Raw row with a fresh id, silver row still pointing at an older raw id.
    raw_id = await _seed("indeed", external_id, with_silver=False)
    async with async_session_maker() as session:
        session.add(_unified("indeed", external_id, uuid.uuid4()))
        await session.commit()

    res = client.post("/api/db/clear-bronze")
    assert res.status_code == 200

    async with async_session_maker() as session:
        assert await session.get(RawIndeedJob, raw_id) is not None
        unified = (
            await session.execute(
                select(UnifiedJob).where(UnifiedJob.external_id == external_id)
            )
        ).scalar_one()
        assert unified.source == "indeed"


@pytest.mark.asyncio
async def test_clear_bronze_removes_unparsed_rows(client):
    """Bronze rows with no silver counterpart are wiped, and counts are reported."""
    await init_db()
    suffix = uuid.uuid4().hex[:8]
    await _seed("indeed", f"test_bronze_only_in_{suffix}", with_silver=False)
    await _seed("linkedin", f"test_bronze_only_li_{suffix}", with_silver=False)

    res = client.post("/api/db/clear-bronze")
    assert res.status_code == 200
    body = res.json()
    assert body["deleted"]["raw_indeed_jobs"] >= 1
    assert body["deleted"]["raw_linkedin_jobs"] >= 1
    assert body["total_deleted"] == (
        body["deleted"]["raw_indeed_jobs"]
        + body["deleted"]["raw_linkedin_jobs"]
        + body["deleted"]["raw_wellfound_jobs"]
    )

    async with async_session_maker() as session:
        indeed = (
            await session.execute(
                select(RawIndeedJob).where(RawIndeedJob.external_id == f"test_bronze_only_in_{suffix}")
            )
        ).scalar_one_or_none()
        linkedin = (
            await session.execute(
                select(RawLinkedInJob).where(RawLinkedInJob.external_id == f"test_bronze_only_li_{suffix}")
            )
        ).scalar_one_or_none()
        assert indeed is None
        assert linkedin is None
