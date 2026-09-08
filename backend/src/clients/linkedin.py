import asyncio
import logging
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Any
from bs4 import BeautifulSoup
import httpx

from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

LINKEDIN_BASE_URL = "https://www.linkedin.com"
LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
LINKEDIN_JOB_DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"

LINKEDIN_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

def build_linkedin_search_url(
    keywords: str,
    location: str,
    start: int = 0,
    time_range: str | None = None,
    work_type: str | None = None,
    seniority: str | None = None,
) -> str:
    """
    Construct the guest search URL for LinkedIn seeMoreJobPostings endpoint.
    Pagination is hard-capped at 975 to prevent redirects to /authwall.
    """
    bounded_start = min(max(0, start), 975)
    params: dict[str, str] = {
        "keywords": keywords,
        "location": location,
        "start": str(bounded_start),
    }
    if time_range:
        params["f_TPR"] = time_range
    if work_type:
        params["f_WT"] = work_type
    if seniority:
        params["f_E"] = seniority

    query_str = urllib.parse.urlencode(params)
    return f"{LINKEDIN_SEARCH_URL}?{query_str}"

def parse_linkedin_date(date_str: str | None) -> datetime | None:
    """Parse ISO date format YYYY-MM-DD or return None."""
    if not date_str:
        return None
    cleaned = date_str.strip()
    try:
        dt = datetime.strptime(cleaned, "%Y-%m-%d")
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def extract_linkedin_salary(soup_or_tag: Any) -> str | None:
    """
    Extract raw salary string from LinkedIn card or job detail HTML.
    Handles compensation sections, salary-range tags, and search card salary badges.
    """
    if not soup_or_tag:
        return None

    # 1. Look for explicit compensation salary container
    sal_el = soup_or_tag.find(class_=lambda c: c and "compensation__salary" in c and "range" not in c)
    if sal_el:
        txt = clean_html(str(sal_el))
        if txt:
            return txt

    # 2. Look for salary-range wrapper
    sal_range = soup_or_tag.find(class_=lambda c: c and "compensation__salary-range" in c)
    if sal_range:
        inner = sal_range.find(class_=lambda c: c and "salary" in c)
        if inner:
            txt = clean_html(str(inner))
            if txt:
                return txt
        txt = clean_html(str(sal_range))
        txt = re.sub(r"^(?:Base\s+pay\s+range|Pay\s+range)\s*", "", txt, flags=re.IGNORECASE).strip()
        if txt:
            return txt

    # 3. Look for search card salary info
    card_sal = soup_or_tag.find(class_=lambda c: c and "job-search-card__salary-info" in c)
    if card_sal:
        txt = clean_html(str(card_sal))
        if txt:
            return txt

    # 4. Fallback search inside compensation block
    comp_block = soup_or_tag.find(class_=lambda c: c and "compensation" in c)
    if comp_block:
        text = comp_block.get_text(" ", strip=True)
        m = re.search(
            r"([$€£₹][\d,]+(?:\.\d+)?(?:\s*[-–—]\s*[$€£₹]?[\d,]+(?:\.\d+)?)?(?:\s*(?:/\s*(?:yr|year|mo|month|hr|hour)|per\s+(?:year|month|hour)|LPA|lacs?))?)",
            text,
            re.IGNORECASE,
        )
        if m:
            return m.group(1).strip()

    return None

def parse_linkedin_job_cards(html_content: str, fallback_loc: str = "India") -> list[JobItem]:
    """Parse HTML response from seeMoreJobPostings search endpoint."""
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    # LinkedIn returns a list of <li> elements or cards
    cards = soup.find_all("div", class_=lambda c: c and "job-search-card" in c)
    if not cards:
        # Try alternate wrapper
        cards = soup.find_all("li")

    jobs: list[JobItem] = []

    for card in cards:
        urn = card.get("data-entity-urn") or ""
        job_id_match = re.search(r"jobPosting:(\d+)", urn)
        
        # Title link and href fallback
        title_el = card.find(class_=lambda c: c and "base-search-card__title" in c)
        full_link_el = card.find("a", class_=lambda c: c and "base-card__full-link" in c)
        
        link_href = full_link_el.get("href") if full_link_el else ""
        if not job_id_match and link_href:
            job_id_match = re.search(r"/view/(?:[a-zA-Z0-9\-_]+-)?(\d+)", link_href)

        if not job_id_match:
            continue

        job_id = job_id_match.group(1)
        title = title_el.get_text(strip=True) if title_el else ""
        if not title and full_link_el:
            sr_span = full_link_el.find("span", class_="sr-only")
            if sr_span:
                title = sr_span.get_text(strip=True)

        if not title:
            continue

        # Company name & url
        sub_el = card.find(class_=lambda c: c and "base-search-card__subtitle" in c)
        company_name = "Company"
        company_website = None
        if sub_el:
            comp_link = sub_el.find("a")
            if comp_link:
                company_name = comp_link.get_text(strip=True)
                company_website = comp_link.get("href")
            else:
                company_name = sub_el.get_text(strip=True)

        # Location
        loc_el = card.find(class_=lambda c: c and "job-search-card__location" in c)
        loc_raw = loc_el.get_text(strip=True) if loc_el else fallback_loc
        city, is_remote, is_intl = parse_location(loc_raw)

        # Date posted
        date_el = card.find("time")
        posted_at = None
        if date_el:
            date_attr = date_el.get("datetime")
            posted_at = parse_linkedin_date(date_attr)

        # Raw salary if present on search card
        salary_raw = extract_linkedin_salary(card)

        canonical_url = f"https://www.linkedin.com/jobs/view/{job_id}"

        jobs.append(
            JobItem(
                external_id=job_id,
                title=title,
                company_name=company_name,
                source="linkedin",
                location_raw=loc_raw,
                city=city,
                is_remote=is_remote,
                is_international=is_intl,
                salary_raw=salary_raw,
                url=canonical_url,
                description_text="",
                description_html=None,
                posted_at=posted_at,
                company_website=company_website,
            )
        )

    return jobs

def parse_linkedin_job_detail(html_content: str) -> dict[str, Any]:
    """Extract full job description markup and metadata from LinkedIn single job page."""
    if not html_content:
        return {}

    soup = BeautifulSoup(html_content, "html.parser")
    markup_el = soup.find(class_=lambda c: c and "show-more-less-html__markup" in c)
    if not markup_el:
        markup_el = soup.find(class_=lambda c: c and "description__text" in c)

    desc_html = str(markup_el) if markup_el else ""
    desc_text = clean_html(desc_html)

    logo_el = soup.find("img", class_=lambda c: c and "artdeco-entity-image" in c)
    company_logo_url = logo_el.get("src") or logo_el.get("data-delayed-url") if logo_el else None

    comp_el = soup.find("a", class_=lambda c: c and "topcard__org-name-link" in c)
    company_website = comp_el.get("href") if comp_el else None

    salary_raw = extract_linkedin_salary(soup)

    return {
        "description_html": desc_html if desc_html else None,
        "description_text": desc_text,
        "company_logo_url": company_logo_url,
        "company_website": company_website,
        "salary_raw": salary_raw,
    }

class LinkedInClient:
    """
    LinkedIn Guest API Crawler with TLS fingerprint impersonation,
    TTL caching, anomaly detection, and concurrency guardrails.
    """

    def __init__(
        self,
        client: httpx.AsyncClient | Any = None,
        timeout: float = 30.0,
        impersonate: str = "chrome120",
        max_detail_concurrency: int = 5,
        cache_ttl_seconds: int = 86400,
    ):
        self.client = client
        self.timeout = timeout
        self.impersonate = impersonate
        self.semaphore = asyncio.Semaphore(max_detail_concurrency)
        self.cache_ttl_seconds = cache_ttl_seconds
        # In-memory LRU-like detail cache: job_id -> (timestamp, detail_dict)
        self.detail_cache: dict[str, tuple[float, dict[str, Any]]] = {}

    async def get_cached_or_fetch_detail(self, job_id: str) -> dict[str, Any]:
        """Fetch detail with cache lookup and TTL expiration."""
        now = datetime.now(timezone.utc).timestamp()
        if job_id in self.detail_cache:
            ts, detail = self.detail_cache[job_id]
            if now - ts < self.cache_ttl_seconds:
                return detail
            del self.detail_cache[job_id]

        detail = await self.fetch_job_detail(job_id)
        if detail and (detail.get("description_text") or detail.get("description_html")):
            self.detail_cache[job_id] = (now, detail)
        return detail

    async def search_jobs(
        self,
        keywords: str = "software engineer",
        location: str = "India",
        start: int = 0,
        limit: int = 20,
        time_range: str | None = None,
        work_type: str | None = None,
        seniority: str | None = None,
        fetch_descriptions: bool = True,
        persist: bool = False,
        **kwargs: Any,
    ) -> list[JobItem]:
        url = build_linkedin_search_url(
            keywords=keywords,
            location=location,
            start=start,
            time_range=time_range,
            work_type=work_type,
            seniority=seniority,
        )

        html_content = await self._fetch_html(url)
        if not html_content:
            logger.warning(f"Failed to fetch LinkedIn search from {url}")
            return []

        jobs = parse_linkedin_job_cards(html_content, fallback_loc=location)
        if len(html_content) > 5000 and len(jobs) == 0:
            logger.error(
                f"LinkedIn anomaly detected: response size {len(html_content)} bytes but parsed 0 jobs. DOM classes may have changed."
            )

        if fetch_descriptions and jobs:
            # Respect limit
            jobs = jobs[:limit]
            tasks = [self._fetch_job_description(job) for job in jobs]
            jobs = await asyncio.gather(*tasks)

        if persist and jobs:
            from src.services.raw_ingestion import save_raw_linkedin_job
            for j in jobs:
                await save_raw_linkedin_job({
                    "external_id": j.external_id,
                    "title": j.title,
                    "company_name": j.company_name,
                    "company_logo_url": j.company_logo_url,
                    "company_website": j.company_website,
                    "location_raw": j.location_raw,
                    "city": j.city,
                    "is_remote": j.is_remote,
                    "is_international": j.is_international,
                    "url": j.url,
                    "salary_raw": j.salary_raw,
                    "description_html": j.description_html,
                    "description_text": j.description_text,
                    "posted_at": j.posted_at,
                    "raw_payload": {"external_id": j.external_id, "title": j.title, "url": j.url},
                })

        return jobs

    async def fetch_job_detail(self, job_id: str) -> dict[str, Any]:
        """Fetch and parse single job posting description."""
        url = LINKEDIN_JOB_DETAIL_URL.format(job_id=job_id)
        html_content = await self._fetch_html(url)
        if not html_content:
            return {}
        return parse_linkedin_job_detail(html_content)

    async def _enrich_descriptions(self, jobs: list[JobItem]) -> None:
        """Fetch descriptions in parallel with bounded concurrency and caching."""
        async def enrich_one(job: JobItem) -> None:
            async with self.semaphore:
                try:
                    detail = await self.get_cached_or_fetch_detail(job.external_id)
                    if detail.get("description_text"):
                        job.description_text = detail["description_text"]
                    if detail.get("description_html"):
                        job.description_html = detail["description_html"]
                    if detail.get("company_logo_url") and not job.company_logo_url:
                        job.company_logo_url = detail["company_logo_url"]
                    if detail.get("company_website") and not job.company_website:
                        job.company_website = detail["company_website"]
                    if detail.get("salary_raw") and not job.salary_raw:
                        job.salary_raw = detail["salary_raw"]
                    await asyncio.sleep(0.1)  # small throttle buffer
                except Exception as exc:
                    logger.debug(f"Could not fetch detail for LinkedIn job {job.external_id}: {exc}")

        await asyncio.gather(*[enrich_one(job) for job in jobs], return_exceptions=True)

    async def _fetch_html(self, url: str) -> str | None:
        try:
            from curl_cffi.requests import AsyncSession

            async with AsyncSession(impersonate=self.impersonate) as session:
                resp = await session.get(
                    url,
                    headers=LINKEDIN_DEFAULT_HEADERS,
                    timeout=self.timeout,
                    allow_redirects=True,
                )
                if resp.status_code == 200:
                    return resp.text
                if resp.status_code in (301, 302, 303, 307, 308) and "authwall" in resp.headers.get("Location", ""):
                    logger.warning("LinkedIn returned redirect to authwall")
                    return None
                logger.warning(f"LinkedIn curl_cffi returned HTTP {resp.status_code} for {url}")
                return None
        except Exception as curl_err:
            logger.warning(f"curl_cffi failed on LinkedIn ({curl_err}), trying httpx fallback...")
            try:
                async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as http_client:
                    resp = await http_client.get(url, headers=LINKEDIN_DEFAULT_HEADERS)
                    if resp.status_code == 200:
                        return resp.text
                    logger.warning(f"LinkedIn httpx returned HTTP {resp.status_code}")
                    return None
            except Exception as http_err:
                logger.warning(f"httpx fallback also failed on LinkedIn: {http_err}")
                return None
