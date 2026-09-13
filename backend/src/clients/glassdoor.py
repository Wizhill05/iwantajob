import asyncio
import gzip
import logging
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any
from bs4 import BeautifulSoup
import httpx

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

GLASSDOOR_BASE_URL = "https://www.glassdoor.com"
GLASSDOOR_SEARCH_URL = "https://www.glassdoor.com/Job/jobs.htm"
GLASSDOOR_JOB_DETAIL_URL = "https://www.glassdoor.com/job-listing/-jl.htm?jl={job_id}"

GLASSDOOR_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


class UpstreamBlockedError(Exception):
    """Raised when Glassdoor returns 401, 403, or security challenge page."""
    pass


class UpstreamRateLimitError(Exception):
    """Raised when Glassdoor returns 429 Too Many Requests."""
    def __init__(self, message: str, retry_after: float = 5.0):
        super().__init__(message)
        self.retry_after = retry_after


def build_glassdoor_search_url(
    keywords: str,
    location: str,
    start: int = 0,
    time_range: str | None = None,
    work_type: str | None = None,
    seniority: str | None = None,
) -> str:
    """
    Construct the search URL for Glassdoor job listings.
    Pagination offset/page is capped at 975.
    """
    bounded_start = min(max(0, start), 975)
    page = (bounded_start // 30) + 1 if bounded_start > 0 else 1

    params: dict[str, str] = {
        "sc.keyword": keywords,
        "locKeyword": location,
        "p": str(page),
    }
    if time_range:
        params["fromAge"] = time_range
    if work_type:
        params["remoteWorkType"] = work_type
    if seniority:
        params["seniorityType"] = seniority

    query_str = urllib.parse.urlencode(params)
    return f"{GLASSDOOR_SEARCH_URL}?{query_str}"


def parse_glassdoor_date(date_str: str | None) -> datetime | None:
    """Parse ISO date format YYYY-MM-DD or return None."""
    if not date_str:
        return None
    cleaned = date_str.strip()
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        dt = datetime.strptime(cleaned[:10], "%Y-%m-%d")
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def extract_glassdoor_salary(soup_or_tag: Any) -> str | None:
    """
    Extract raw salary string from Glassdoor card or job detail HTML.
    Matches standard Glassdoor salary elements, attributes, or text badges ($ / ₹ / LPA / /yr / /mo / /hr).
    """
    if not soup_or_tag:
        return None

    # 1. Attribute-based or selector search
    selectors = [
        {"class_": lambda c: c and any(k in str(c).lower() for k in ["salaryestimate", "salary-estimate", "jobcard-salary", "jobcard_salary"])},
        {"data-test": lambda v: v and "detailSalary" in str(v)},
        {"data-test": lambda v: v and "job-salary" in str(v)},
        {"class_": lambda c: c and "salary" in str(c).lower() and "badge" in str(c).lower()},
    ]

    for sel in selectors:
        el = soup_or_tag.find(**sel)
        if el:
            txt = clean_html(str(el))
            if txt and any(c in txt for c in ["₹", "$", "€", "£", "LPA", "lpa", "/yr", "/mo", "/hr", "K", "k"]):
                return txt

    # 2. Text scan inside the tag if relatively short
    text = soup_or_tag.get_text(" ", strip=True)
    m = re.search(r"((?:₹|\$|€|£)\s*[\d,.]+\s*(?:[KkLlMm]|(?:LPA|lpa))?(?:\s*[-–—to]\s*(?:₹|\$|€|£)?\s*[\d,.]+\s*(?:[KkLlMm]|(?:LPA|lpa))?)?\s*(?:\([^\)]+\))?\s*(?:/(?:yr|mo|hr|year|month|hour))?)", text)
    if m and any(s in m.group(1) for s in ["₹", "$", "€", "£", "LPA", "lpa"]):
        candidate = m.group(1).strip()
        if len(candidate) <= 60:
            return candidate

    return None


def extract_glassdoor_rating(soup_or_tag: Any) -> float | None:
    """Extract company review rating (e.g. 4.2) from card or detail."""
    if not soup_or_tag:
        return None
    el = soup_or_tag.find(class_=lambda c: c and any(k in str(c).lower() for k in ["rating", "employer-rating", "review-rating"]))
    if el:
        raw = clean_html(str(el))
        m = re.search(r"(\d(?:\.\d)?)", raw)
        if m:
            try:
                val = float(m.group(1))
                if 1.0 <= val <= 5.0:
                    return val
            except ValueError:
                pass
    return None


def parse_glassdoor_job_cards(html: str, fallback_location: str = "India") -> list[JobItem]:
    """
    Parse search results HTML from Glassdoor and extract JobItems.
    """
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    items: list[JobItem] = []

    # Look for job card list elements
    card_elements = soup.find_all("li", attrs={"data-test": lambda v: v and "jobListing" in str(v)})
    if not card_elements:
        card_elements = soup.find_all(class_=lambda c: c and any(k in str(c).lower() for k in ["joblisting", "jobcard", "job-card", "react-job-listing"]))

    for card in card_elements:
        # Extract external_id
        job_id = (
            card.get("data-id")
            or card.get("data-job-id")
            or card.get("data-jobid")
        )

        title_link = (
            card.find("a", attrs={"data-test": lambda v: v and "job-title" in str(v)})
            or card.find("a", class_=lambda c: c and any(k in str(c).lower() for k in ["jobtitle", "job-title"]))
            or card.find("a", href=lambda h: h and ("/job-listing/" in h or "/partner/jobListing" in h or "/Job/" in h))
        )

        if not job_id and title_link and title_link.get("href"):
            href = title_link.get("href")
            m = re.search(r"(?:jl=|jobListingId=|-jl\.htm\?jl=)(\d+)", href)
            if m:
                job_id = m.group(1)
            else:
                m2 = re.search(r"(\d{8,})", href)
                if m2:
                    job_id = m2.group(1)

        if not job_id:
            continue

        title = ""
        if title_link:
            title = clean_html(str(title_link))
        if not title:
            title_el = card.find(class_=lambda c: c and any(k in str(c).lower() for k in ["jobtitle", "job-title", "title"]))
            if title_el:
                title = clean_html(str(title_el))
        if not title:
            continue

        company = "Company"
        comp_el = (
            card.find(attrs={"data-test": lambda v: v and "employer-name" in str(v)})
            or card.find(class_=lambda c: c and any(k in str(c).lower() for k in ["employername", "employer-name", "companyname", "company-name"]))
        )
        if comp_el:
            company_raw = clean_html(str(comp_el))
            # Glassdoor company titles often have ratings attached like "Google 4.3"
            company = re.sub(r"\s+\d(?:\.\d)?\s*★?$", "", company_raw).strip() or company_raw

        logo_url = None
        logo_img = card.find("img", class_=lambda c: c and any(k in str(c).lower() for k in ["employerlogo", "employer-logo", "logo"]))
        if logo_img:
            logo_url = logo_img.get("src") or logo_img.get("data-src")

        loc_raw = fallback_location
        loc_el = (
            card.find(attrs={"data-test": lambda v: v and "emp-location" in str(v)})
            or card.find(class_=lambda c: c and any(k in str(c).lower() for k in ["location", "job-location"]))
        )
        if loc_el:
            loc_raw = clean_html(str(loc_el)) or fallback_location

        city, is_remote, is_intl = parse_location(loc_raw)

        url = f"{GLASSDOOR_BASE_URL}/job-listing/-jl.htm?jl={job_id}"
        if title_link and title_link.get("href"):
            raw_href = title_link.get("href")
            if raw_href.startswith("/"):
                url = f"{GLASSDOOR_BASE_URL}{raw_href}"
            elif raw_href.startswith("http"):
                url = raw_href

        salary_raw = extract_glassdoor_salary(card)

        easy_apply = False
        easy_el = card.find(string=lambda t: t and "Easy Apply" in t) or card.find(attrs={"data-test": lambda v: v and "easyApply" in str(v)})
        if easy_el:
            easy_apply = True

        posted_at = None
        date_el = card.find("div", attrs={"data-test": lambda v: v and "job-age" in str(v)}) or card.find(class_=lambda c: c and "job-age" in str(c).lower())
        if date_el:
            age_text = clean_html(str(date_el)).lower()
            # If explicit ISO/date is available
            posted_at = parse_glassdoor_date(age_text)

        # Extract card snippet/description if present
        card_desc = ""
        snippet_el = card.find(
            class_=lambda cls: cls and any(k in str(cls).lower() for k in ["snippet", "description", "desc", "jobcard-description"])
        )
        if snippet_el:
            card_desc = clean_html(str(snippet_el))
        if not card_desc:
            leaf_divs = [
                clean_html(str(d))
                for d in card.find_all("div")
                if len(d.get_text(strip=True)) > 50 and len(d.find_all("div")) == 0
            ]
            if leaf_divs:
                card_desc = leaf_divs[0]

        items.append(
            JobItem(
                external_id=str(job_id),
                title=title,
                company_name=company,
                source="glassdoor",
                location_raw=loc_raw,
                city=city,
                is_remote=is_remote,
                is_international=is_intl,
                salary_raw=salary_raw,
                url=url,
                description_text=card_desc,
                description_html=f"<p>{card_desc}</p>" if card_desc else None,
                company_logo_url=logo_url,
                posted_at=posted_at,
            )
        )

    return items


def parse_glassdoor_detail(html: str) -> tuple[str | None, str, str | None, bool]:
    """
    Parse single job detail HTML from Glassdoor.
    Returns: (description_html, description_text, salary_raw, easy_apply_available)
    """
    if not html:
        return None, "", None, False

    soup = BeautifulSoup(html, "html.parser")

    desc_el = (
        soup.find("div", class_=lambda c: c and any(k in str(c).lower() for k in ["jobdescriptioncontent", "job-description-content", "desc"]))
        or soup.find("div", attrs={"data-test": lambda v: v and "job-description" in str(v)})
        or soup.find(id=lambda i: i and "jobdescription" in str(i).lower())
    )

    desc_html = str(desc_el) if desc_el else None
    desc_text = clean_html(desc_html) if desc_html else ""

    salary_raw = extract_glassdoor_salary(soup)
    easy_apply = bool(soup.find(string=lambda t: t and "Easy Apply" in t) or soup.find(attrs={"data-test": lambda v: v and "easyApply" in str(v)}))

    return desc_html, desc_text, salary_raw, easy_apply


class GlassdoorClient:
    """
    Async client for scraping Glassdoor job listings with guardrails:
    - 24h detail memory cache
    - Concurrency semaphore (max 5)
    - Anti-bot block & rate-limit detection
    - Jittered throttle
    """

    def __init__(self, concurrency_limit: int = 5):
        self._semaphore = asyncio.Semaphore(concurrency_limit)
        self._detail_cache: dict[str, tuple[datetime, str | None, str, str | None, bool]] = {}

    def _is_blocked(self, status_code: int, html: str) -> bool:
        """Detect Glassdoor bot detection / security challenges."""
        if status_code in (401, 403):
            return True
        if "<title>Security | Glassdoor</title>" in html:
            return True
        if "cf-browser-verification" in html or "challenge-running" in html:
            return True
        if "PerimeterX" in html or "px-captcha" in html:
            return True
        return False

    async def _fetch_html(self, url: str, headers: dict[str, str] | None = None) -> tuple[int, str]:
        """Fetch URL using urllib/httpx with realistic browser headers."""
        req_headers = headers or GLASSDOOR_DEFAULT_HEADERS

        # 1. Primary: urllib (bypasses Cloudflare TLS fingerprinting cleanly)
        def _do_urllib() -> tuple[int, str]:
            try:
                req = urllib.request.Request(url, headers=req_headers)
                with urllib.request.urlopen(req, timeout=12) as resp:
                    content = resp.read()
                    if resp.info().get("Content-Encoding") == "gzip":
                        content = gzip.decompress(content)
                    return resp.status, content.decode("utf-8", errors="ignore")
            except urllib.error.HTTPError as he:
                err_body = ""
                try:
                    err_content = he.read()
                    if he.headers.get("Content-Encoding") == "gzip":
                        err_content = gzip.decompress(err_content)
                    err_body = err_content.decode("utf-8", errors="ignore")
                except Exception:
                    pass
                return he.code, err_body
            except Exception as e:
                logger.warning(f"urllib fetch error on {url}: {e}")
                return 500, ""

        status, text = await asyncio.to_thread(_do_urllib)
        if status == 200:
            return status, text

        # 2. Fallback: httpx
        try:
            async with httpx.AsyncClient(headers=req_headers, timeout=12.0, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return resp.status_code, resp.text
        except Exception as e:
            logger.warning(f"httpx fallback fetch error on {url}: {e}")

        # 3. Fallback: curl_cffi if available
        if curl_requests is not None:
            try:
                def _do_curl():
                    return curl_requests.get(
                        url,
                        headers=req_headers,
                        impersonate="chrome120",
                        timeout=12,
                    )
                resp = await asyncio.to_thread(_do_curl)
                return resp.status_code, resp.text
            except Exception as e:
                logger.warning(f"curl_cffi fetch error on {url}: {e}")

        return status, text

    async def fetch_job_detail(self, job_id: str) -> tuple[str | None, str, str | None, bool]:
        """Fetch job detail with LRU cache and semaphore."""
        now = datetime.now(timezone.utc)
        if job_id in self._detail_cache:
            ts, d_html, d_text, sal, easy = self._detail_cache[job_id]
            if (now - ts).total_seconds() < 86400:
                return d_html, d_text, sal, easy

        url = GLASSDOOR_JOB_DETAIL_URL.format(job_id=job_id)
        async with self._semaphore:
            status_code, html = await self._fetch_html(url)

        if self._is_blocked(status_code, html):
            logger.warning(f"Glassdoor blocked detail request for {job_id} (status={status_code})")
            return None, "", None, False

        d_html, d_text, sal, easy = parse_glassdoor_detail(html)
        self._detail_cache[job_id] = (now, d_html, d_text, sal, easy)
        return d_html, d_text, sal, easy

    async def search_jobs(
        self,
        keywords: str,
        location: str,
        start: int = 0,
        limit: int = 20,
        time_range: str | None = None,
        work_type: str | None = None,
        seniority: str | None = None,
        fetch_descriptions: bool = True,
    ) -> list[JobItem]:
        """
        Search Glassdoor jobs matching criteria.
        """
        search_url = build_glassdoor_search_url(
            keywords=keywords,
            location=location,
            start=start,
            time_range=time_range,
            work_type=work_type,
            seniority=seniority,
        )

        status_code, html = await self._fetch_html(search_url)

        if status_code == 429:
            raise UpstreamRateLimitError("Glassdoor returned HTTP 429 Too Many Requests")

        if self._is_blocked(status_code, html):
            raise UpstreamBlockedError(
                f"Glassdoor search was blocked by anti-bot verification (status={status_code})"
            )

        items = parse_glassdoor_job_cards(html, fallback_location=location)
        items = items[:limit]

        if fetch_descriptions and items:
            tasks = [self.fetch_job_detail(item.external_id) for item in items]
            details = await asyncio.gather(*tasks, return_exceptions=True)

            for item, detail in zip(items, details):
                if isinstance(detail, tuple):
                    d_html, d_text, sal, easy = detail
                    if d_html:
                        item.description_html = d_html
                    if d_text:
                        item.description_text = d_text
                    if sal and not item.salary_raw:
                        item.salary_raw = sal
                elif isinstance(detail, Exception):
                    logger.debug(f"Failed to fetch detail for job {item.external_id}: {detail}")

        return items
