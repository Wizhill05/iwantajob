import pytest
from src.clients.glassdoor import (
    build_glassdoor_search_url,
    parse_glassdoor_job_cards,
    parse_glassdoor_detail,
    extract_glassdoor_salary,
    extract_glassdoor_rating,
    GlassdoorClient,
    UpstreamBlockedError,
    UpstreamRateLimitError,
)

SAMPLE_SEARCH_HTML = """
<!DOCTYPE html>
<html>
<body>
  <ul>
    <li data-test="jobListing" data-id="1009990001">
      <div class="job-title-wrapper">
        <a data-test="job-title" href="/job-listing/-jl.htm?jl=1009990001">Senior AI Engineer</a>
      </div>
      <div data-test="employer-name">Acme AI 4.3 ★</div>
      <div data-test="emp-location">Bengaluru, Karnataka, India</div>
      <div data-test="detailSalary">₹20L - ₹35L /yr</div>
      <span data-test="easyApply">Easy Apply</span>
      <div data-test="job-age">2026-09-10</div>
    </li>
    <li data-test="jobListing" data-id="1009990002">
      <a data-test="job-title" href="https://www.glassdoor.com/job-listing/-jl.htm?jl=1009990002">Backend Developer</a>
      <div data-test="employer-name">Cloud Corp</div>
      <div data-test="emp-location">Remote, India</div>
      <div class="salary-estimate">$80k - $120k /yr</div>
    </li>
  </ul>
</body>
</html>
"""

SAMPLE_DETAIL_HTML = """
<!DOCTYPE html>
<html>
<body>
  <div data-test="job-description" class="jobdescriptioncontent">
    <p>We are seeking a senior AI engineer with 3+ years experience in LLMs.</p>
  </div>
  <div data-test="detailSalary">₹25,00,000 - ₹35,00,000 /yr</div>
  <span data-test="easyApply">Easy Apply</span>
</body>
</html>
"""


def test_build_glassdoor_search_url():
    url = build_glassdoor_search_url("software engineer", "India", start=60, time_range="7", work_type="2")
    assert "https://www.glassdoor.com/Job/jobs.htm" in url
    assert "sc.keyword=software+engineer" in url
    assert "locKeyword=India" in url
    assert "p=3" in url  # start=60 -> page 3
    assert "fromAge=7" in url
    assert "remoteWorkType=2" in url


def test_parse_glassdoor_job_cards():
    items = parse_glassdoor_job_cards(SAMPLE_SEARCH_HTML, fallback_location="India")
    assert len(items) == 2

    first = items[0]
    assert first.external_id == "1009990001"
    assert first.title == "Senior AI Engineer"
    assert first.company_name == "Acme AI"
    assert first.source == "glassdoor"
    assert first.city == "bengaluru"
    assert first.salary_raw == "₹20L - ₹35L /yr"
    assert "1009990001" in first.url

    second = items[1]
    assert second.external_id == "1009990002"
    assert second.title == "Backend Developer"
    assert second.company_name == "Cloud Corp"
    assert second.is_remote is True
    assert second.salary_raw == "$80k - $120k /yr"


def test_parse_glassdoor_detail():
    d_html, d_text, salary_raw, easy_apply = parse_glassdoor_detail(SAMPLE_DETAIL_HTML)
    assert "We are seeking a senior AI engineer" in d_text
    assert salary_raw == "₹25,00,000 - ₹35,00,000 /yr"
    assert easy_apply is True


def test_empty_html_returns_empty_list():
    assert parse_glassdoor_job_cards("") == []
    assert parse_glassdoor_job_cards("<html><body></body></html>") == []


@pytest.mark.asyncio
async def test_glassdoor_client_blocked_detection():
    client = GlassdoorClient()
    assert client._is_blocked(403, "<html></html>") is True
    assert client._is_blocked(200, "<title>Security | Glassdoor</title>") is True
    assert client._is_blocked(200, "cf-browser-verification") is True
    assert client._is_blocked(200, "<html><body>Jobs here</body></html>") is False
