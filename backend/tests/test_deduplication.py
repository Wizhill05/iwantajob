import pytest
import uuid
from src.utils.url_normalizer import normalize_job_url
from src.services.raw_ingestion import (
    save_raw_indeed_job,
    save_raw_linkedin_job,
    save_raw_wellfound_job,
)
from src.services.db_deduplication import check_jobs_exist_in_db
from src.services.parser_service import ParserService
from src.models.db_entities import RawIndeedJob, RawLinkedInJob, RawWellfoundJob, UnifiedJob
from src.core.database import async_session_maker
from sqlalchemy import select

def test_url_normalizer():
    # Tracking parameters removal
    url = "https://www.linkedin.com/jobs/view/4461809333?utm_source=share&utm_medium=member_desktop&refId=xyz"
    assert normalize_job_url(url) == "https://www.linkedin.com/jobs/view/4461809333"

    # Indeed normalization
    indeed_url = "https://www.indeed.com/viewjob?jk=67b6957d22787657&from=serp&vjs=3"
    assert normalize_job_url(indeed_url) == "https://www.indeed.com/viewjob?jk=67b6957d22787657"

    # Wellfound normalization
    wellfound_url = "https://wellfound.com/jobs/4666122-ai-engineer?utm_campaign=google_jobs_apply"
    assert normalize_job_url(wellfound_url) == "https://wellfound.com/jobs/4666122-ai-engineer"

    # Trailing slash
    assert normalize_job_url("https://example.com/job/123/") == "https://example.com/job/123"

@pytest.mark.asyncio
async def test_raw_ingestion_duplicate_skipping():
    uid = uuid.uuid4().hex[:8]

    # 1. LinkedIn
    li_data = {
        "external_id": f"test_li_{uid}",
        "title": "Software Engineer",
        "company_name": "TestCorp",
        "location_raw": "Bengaluru",
        "url": f"https://www.linkedin.com/jobs/view/999{uid}?trk=public_jobs",
        "description_text": "Python engineer role.",
        "raw_payload": {"test": 1},
    }
    # First save should succeed
    res1 = await save_raw_linkedin_job(li_data)
    assert res1 is True

    # Second save of identical external_id should be skipped
    res2 = await save_raw_linkedin_job(li_data)
    assert res2 is False

    # 2. Indeed
    ind_data = {
        "external_id": f"test_ind_{uid}",
        "title": "Backend Engineer",
        "company_name": "TestIndeed",
        "location_raw": "Pune",
        "description_text": "FastAPI engineer.",
        "apply_url": f"https://indeed.com/apply/{uid}",
        "raw_payload": {"test": 2},
    }
    ind_res1 = await save_raw_indeed_job(ind_data)
    assert ind_res1 is True

    ind_res2 = await save_raw_indeed_job(ind_data)
    assert ind_res2 is False

    # 3. Wellfound
    num_id = "".join([c for c in uid if c.isdigit()] or ["7", "6", "5", "4", "3"])
    wf_data = {
        "external_id": f"test_wf_{uid}",
        "job_slug": f"ai-eng-{uid}",
        "title": "AI Engineer",
        "company_name": "TestStartup",
        "location_raw": "Remote",
        "url": f"https://wellfound.com/jobs/999{num_id}-ai-eng?utm_source=google",
        "description_text": "AI role.",
        "raw_payload": {"test": 3},
    }
    wf_res1 = await save_raw_wellfound_job(wf_data)
    assert wf_res1 is True

    wf_res2 = await save_raw_wellfound_job(wf_data)
    assert wf_res2 is False

@pytest.mark.asyncio
async def test_check_jobs_exist_in_db():
    uid = uuid.uuid4().hex[:8]
    ext_id = f"test_check_{uid}"
    url = f"https://www.linkedin.com/jobs/view/777{uid}"

    # Ingest one record
    await save_raw_linkedin_job({
        "external_id": ext_id,
        "title": "Data Scientist",
        "company_name": "DataInc",
        "location_raw": "Delhi",
        "url": url,
        "description_text": "ML engineer.",
        "raw_payload": {},
    })

    # Check existence
    items = [
        {"source": "linkedin", "external_id": ext_id, "url": f"{url}?trackingId=123"},
        {"source": "linkedin", "external_id": "non_existent_123", "url": "https://linkedin.com/jobs/view/00000"},
    ]
    found = await check_jobs_exist_in_db(items)
    assert ("linkedin", ext_id) in found
    assert ("linkedin", "non_existent_123") not in found
