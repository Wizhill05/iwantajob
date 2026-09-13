import pytest
from starlette.testclient import TestClient
from src.main import app
from src.core.database import init_db


@pytest.fixture(autouse=True)
async def ensure_db():
    await init_db()


def test_glassdoor_scrape_and_parse_endpoints():
    client = TestClient(app)

    # 1. Parsing status includes glassdoor
    status_resp = client.get("/api/status/parsing")
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert "glassdoor" in data
    assert "total_raw" in data["glassdoor"]
    assert "parsed" in data["glassdoor"]
    assert "unparsed" in data["glassdoor"]

    # 2. Unified jobs query accepts source=glassdoor
    jobs_resp = client.get("/api/jobs/unified?source=glassdoor")
    assert jobs_resp.status_code == 200
    assert isinstance(jobs_resp.json(), list)

    # 3. Clear bronze preserves glassdoor
    clear_resp = client.post("/api/db/clear-bronze")
    assert clear_resp.status_code == 200
    clear_data = clear_resp.json()
    assert "raw_glassdoor_jobs" in clear_data["deleted"]

    # 4. Clear test data includes raw_glassdoor_jobs
    clear_test_resp = client.post("/api/db/clear-test-data")
    assert clear_test_resp.status_code == 200
    clear_test_data = clear_test_resp.json()
    assert "raw_glassdoor_jobs" in clear_test_data["deleted"]
