import pytest
from datetime import datetime, timezone
from src.clients.linkedin import (
    build_linkedin_search_url,
    parse_linkedin_job_cards,
    parse_linkedin_job_detail,
    LinkedInClient,
)

SAMPLE_SEARCH_HTML = """
<!DOCTYPE html>
<ul>
  <li>
    <div class="base-card relative w-full hover:no-underline focus:no-underline base-card--link base-search-card base-search-card--link job-search-card"
         data-entity-urn="urn:li:jobPosting:4463112580">
      <a class="base-card__full-link absolute top-0 right-0 bottom-0 left-0"
         href="https://in.linkedin.com/jobs/view/software-engineer-at-jpmorgan-chase-co-4463112580?position=1&amp;pageNum=0">
        <span class="sr-only">Software Engineer</span>
      </a>
      <div class="base-search-card__info">
        <h3 class="base-search-card__title">Software Engineer</h3>
        <h4 class="base-search-card__subtitle">
          <a class="hidden-nested-link" href="https://in.linkedin.com/company/jpmorganchase">JPMorgan Chase &amp; Co.</a>
        </h4>
        <div class="base-search-card__metadata">
          <span class="job-search-card__location">Bengaluru, Karnataka, India</span>
          <span class="job-search-card__salary-info">₹25,00,000 - ₹35,00,000</span>
          <time class="job-search-card__listdate" datetime="2025-02-28">Feb 28, 2025</time>
        </div>
      </div>
    </div>
  </li>
  <li>
    <div class="base-card job-search-card" data-entity-urn="urn:li:jobPosting:4463999999">
      <a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/4463999999">
        <span class="sr-only">AI Engineer</span>
      </a>
      <div class="base-search-card__info">
        <h3 class="base-search-card__title">AI Engineer</h3>
        <h4 class="base-search-card__subtitle">DeepTech Labs</h4>
        <div class="base-search-card__metadata">
          <span class="job-search-card__location">Remote, India</span>
          <time class="job-search-card__listdate" datetime="2025-03-01">1 day ago</time>
        </div>
      </div>
    </div>
  </li>
</ul>
"""

SAMPLE_DETAIL_HTML = """
<!DOCTYPE html>
<div class="details">
  <div class="topcard__content-left">
    <h1 class="topcard__title">Software Engineer</h1>
    <a class="topcard__org-name-link" href="https://www.linkedin.com/company/jpmorganchase">JPMorgan Chase & Co.</a>
    <img class="artdeco-entity-image" src="https://media.licdn.com/dms/image/v2/company-logo.png" />
  </div>
  <div class="compensation__salary-range">
    <h3 class="compensation__heading">Base pay range</h3>
    <div class="salary compensation__salary">$137,750.00/yr - $185,000.00/yr</div>
  </div>
  <div class="show-more-less-html__markup">
    <p>We are seeking a <strong>Software Engineer</strong> with strong Python and distributed systems background.</p>
    <ul>
      <li>3+ years experience with FastAPI or Django</li>
      <li>Strong database fundamentals</li>
    </ul>
  </div>
</div>
"""

def test_build_linkedin_search_url():
    url = build_linkedin_search_url(
        keywords="ai engineer",
        location="Bengaluru",
        start=25,
        time_range="r86400",
        work_type="2",
        seniority="4",
    )
    assert "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?" in url
    assert "keywords=ai+engineer" in url
    assert "location=Bengaluru" in url
    assert "start=25" in url
    assert "f_TPR=r86400" in url
    assert "f_WT=2" in url
    assert "f_E=4" in url

def test_build_linkedin_search_url_caps_pagination():
    url = build_linkedin_search_url(keywords="ai", location="India", start=1500)
    assert "start=975" in url

def test_parse_linkedin_job_cards():
    jobs = parse_linkedin_job_cards(SAMPLE_SEARCH_HTML)
    assert len(jobs) == 2

    job1 = jobs[0]
    assert job1.external_id == "4463112580"
    assert job1.title == "Software Engineer"
    assert job1.company_name == "JPMorgan Chase & Co."
    assert job1.source == "linkedin"
    assert job1.url == "https://www.linkedin.com/jobs/view/4463112580"
    assert job1.city == "bengaluru"
    assert job1.is_remote is False
    assert job1.is_international is False
    assert job1.salary_raw == "₹25,00,000 - ₹35,00,000"
    assert job1.posted_at == datetime(2025, 2, 28, 0, 0, tzinfo=timezone.utc)

    job2 = jobs[1]
    assert job2.external_id == "4463999999"
    assert job2.title == "AI Engineer"
    assert job2.company_name == "DeepTech Labs"
    assert job2.salary_raw is None
    assert job2.is_remote is True
    assert job2.posted_at == datetime(2025, 3, 1, 0, 0, tzinfo=timezone.utc)

def test_parse_linkedin_job_detail():
    detail = parse_linkedin_job_detail(SAMPLE_DETAIL_HTML)
    assert "Software Engineer" in detail["description_text"]
    assert "3+ years experience with FastAPI" in detail["description_text"]
    assert "<p>" in detail["description_html"]
    assert detail["company_logo_url"] == "https://media.licdn.com/dms/image/v2/company-logo.png"
    assert "jpmorganchase" in detail["company_website"]
    assert detail["salary_raw"] == "$137,750.00/yr - $185,000.00/yr"

@pytest.mark.asyncio
async def test_linkedin_client_search():
    client = LinkedInClient()
    jobs = await client.search_jobs(keywords="software engineer", location="India", limit=3, fetch_descriptions=False)
    assert len(jobs) > 0
    assert jobs[0].source == "linkedin"
    assert jobs[0].external_id
    assert jobs[0].title
    assert jobs[0].url.startswith("https://www.linkedin.com/jobs/view/")

@pytest.mark.asyncio
async def test_linkedin_routes_and_endpoint():
    from httpx import AsyncClient, ASGITransport
    from src.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Check static html page served
        resp = await ac.get("/linkedin")
        assert resp.status_code == 200
        assert "LinkedIn Guest Search" in resp.text
        assert "keywordsInput" in resp.text

        # Check API endpoint
        resp = await ac.get("/api/scrape/linkedin?keywords=ai+engineer&location=India&limit=2&fetch_descriptions=false")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        first = data[0]
        assert first["source"] == "linkedin"
        assert first["url"].startswith("https://www.linkedin.com/jobs/view/")
        assert first["title"]

@pytest.mark.asyncio
async def test_search_jobs_with_descriptions_enriches(monkeypatch):
    """Regression: search_jobs(fetch_descriptions=True) must enrich in place via
    _enrich_descriptions, not call the removed _fetch_job_description."""
    client = LinkedInClient()
    client.detail_cache.clear()

    async def mock_fetch_html(url: str):
        if "seeMoreJobPostings" in url:
            return SAMPLE_SEARCH_HTML
        return SAMPLE_DETAIL_HTML

    monkeypatch.setattr(client, "_fetch_html", mock_fetch_html)

    jobs = await client.search_jobs(keywords="software engineer", location="India", fetch_descriptions=True)
    assert len(jobs) == 2
    assert all(j.description_text for j in jobs)
    assert "Software Engineer" in jobs[0].description_text


@pytest.mark.asyncio
async def test_linkedin_cache_prevents_duplicate_detail_fetches(monkeypatch):
    client = LinkedInClient()
    client.detail_cache.clear()

    calls = 0
    original_fetch = client.fetch_job_detail

    async def mock_fetch(job_id: str):
        nonlocal calls
        calls += 1
        return {"description_text": f"Mock desc for {job_id}", "description_html": "<p>mock</p>"}

    monkeypatch.setattr(client, "fetch_job_detail", mock_fetch)

    # First fetch should call mock
    detail1 = await client.get_cached_or_fetch_detail("12345")
    assert detail1["description_text"] == "Mock desc for 12345"
    assert calls == 1

    # Second fetch with same ID must hit cache and not increment calls
    detail2 = await client.get_cached_or_fetch_detail("12345")
    assert detail2["description_text"] == "Mock desc for 12345"
    assert calls == 1


