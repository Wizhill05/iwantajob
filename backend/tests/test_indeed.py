import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.clients.indeed import parse_graphql_response, build_indeed_graphql_query

def test_build_indeed_graphql_query():
    q = build_indeed_graphql_query(
        "python engineer",
        "Bengaluru",
        10,
        sort="relevance",
        radius=25,
        radius_unit="KILOMETERS",
    )
    assert 'what: "python engineer"' in q
    assert 'where: "Bengaluru"' in q
    assert 'limit: 10' in q
    assert 'radius: 25' in q
    assert 'radiusUnit: KILOMETERS' in q
    assert 'sort: RELEVANCE' in q

def test_build_indeed_graphql_query_date_sort():
    q = build_indeed_graphql_query(
        "sdet",
        "Pune",
        5,
        sort="date",
        radius=50,
        radius_unit="MILES",
    )
    assert 'sort: DATE' in q
    assert 'radius: 50' in q
    assert 'radiusUnit: MILES' in q

def test_parse_graphql_response():
    mock_payload = {
        "data": {
            "jobSearch": {
                "results": [
                    {
                        "trackingKey": "tk_123",
                        "job": {
                            "key": "job_abc",
                            "title": "Senior AI Engineer",
                            "datePublished": 1725400000000,
                            "description": {
                                "html": "<p>Build LLM agents using <b>PyTorch</b> and FastAPI.</p>"
                            },
                            "location": {
                                "city": "Bengaluru",
                                "countryCode": "IN",
                                "formatted": {"short": "Bengaluru, Karnataka"}
                            },
                            "compensation": {
                                "estimated": {
                                    "baseSalary": {
                                        "unitOfWork": "YEAR",
                                        "range": {
                                            "min": 2500000,
                                            "max": 4000000
                                        }
                                    }
                                }
                            },
                            "employer": {
                                "name": "AI Innovations Pvt Ltd"
                            }
                        }
                    }
                ]
            }
        }
    }

    jobs = parse_graphql_response(mock_payload, fallback_where="India")
    assert len(jobs) == 1
    job = jobs[0]
    assert job.external_id == "job_abc"
    assert job.title == "Senior AI Engineer"
    assert job.company_name == "AI Innovations Pvt Ltd"
    assert job.city == "bengaluru"
    assert job.salary_min == 2500000.0
    assert job.salary_max == 4000000.0
    assert "PyTorch" in job.description_text
    assert job.url == "https://www.indeed.com/viewjob?jk=job_abc"

@pytest.mark.asyncio
async def test_api_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_portal_html_served():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/")
        assert resp.status_code == 200
        assert "Indeed Scraper Portal" in resp.text
        assert "sortSelect" in resp.text
        assert "radiusInput" in resp.text

@pytest.mark.asyncio
async def test_api_scrape_indeed_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/scrape/indeed?what=ai+engineer&where=India&limit=2&sort=relevance&radius=25")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "title" in data[0]
        assert "url" in data[0]
        assert data[0]["source"] == "indeed"
