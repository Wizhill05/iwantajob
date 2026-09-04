import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
import httpx
from bs4 import BeautifulSoup

from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

WELLFOUND_BASE_URL = "https://wellfound.com"
WELLFOUND_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

def slugify_term(text: str) -> str:
    """Normalize input search term into a valid Wellfound URL slug."""
    text = text.lower().strip()
    if text in ("bengaluru, karnataka", "bangalore, karnataka", "bangalore"):
        return "bengaluru"
    if text in ("pune, maharashtra", "pune"):
        return "pune"
    if text in ("mumbai, maharashtra", "mumbai"):
        return "mumbai"
    if text in ("hyderabad, telangana", "hyderabad"):
        return "hyderabad"
    if text in ("delhi-ncr", "delhi", "new delhi", "gurgaon", "noida"):
        return "delhi"
    if text in ("remote", "anywhere"):
        return "remote"
    if text in ("india", "all india"):
        return "india"

    # Generic slugification
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text.strip("-")

def parse_wellfound_compensation(comp_str: str | None) -> tuple[float | None, float | None, str]:
    """
    Parse strings like:
      - '$25k – $50k • 0.0% – 1.0%' -> (25000, 50000, 'USD')
      - '₹25L – ₹45L • No equity'   -> (2500000, 4500000, 'INR')
      - '₹20,000 – ₹50,000'         -> (20000, 50000, 'INR')
    """
    if not comp_str:
        return None, None, "INR"

    currency = "INR"
    if "$" in comp_str:
        currency = "USD"
    elif "€" in comp_str:
        currency = "EUR"
    elif "£" in comp_str:
        currency = "GBP"

    # Remove equity component if present
    base_comp = comp_str.split("•")[0].strip()

    # Search for numeric patterns with multipliers (handle commas in thousands e.g. 20,000)
    matches = re.findall(r"([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*([kKlL])?", base_comp)
    salaries: list[float] = []
    for val_str, mult in matches:
        try:
            cleaned_val = val_str.replace(",", "")
            val = float(cleaned_val)
            mult_upper = mult.upper() if mult else ""
            if mult_upper == "K":
                val *= 1000
            elif mult_upper == "L":
                val *= 100000  # Lakh
            salaries.append(val)
        except ValueError:
            continue

    if len(salaries) == 1:
        return salaries[0], None, currency
    if len(salaries) >= 2:
        return salaries[0], salaries[1], currency

    return None, None, currency

def extract_wellfound_apollo_data(html_content: str) -> dict[str, Any] | None:
    """Extract Apollo Client normalized state from Next.js HTML."""
    if not html_content:
        return None
    soup = BeautifulSoup(html_content, "html.parser")
    next_data_tag = soup.find("script", id="__NEXT_DATA__")
    if not next_data_tag or not next_data_tag.string:
        return None

    try:
        data = json.loads(next_data_tag.string)
        return data.get("props", {}).get("pageProps", {}).get("apolloState", {}).get("data")
    except Exception as exc:
        logger.warning(f"Failed to parse __NEXT_DATA__ JSON: {exc}")
        return None

def parse_wellfound_apollo_jobs(apollo_data: dict[str, Any], fallback_loc: str = "India") -> list[JobItem]:
    """
    Traverse Apollo normalized graph: ROOT_QUERY -> startups -> highlightedJobListings.
    """
    if not isinstance(apollo_data, dict):
        return []

    talent = apollo_data.get("ROOT_QUERY", {}).get("talent", {})
    if not isinstance(talent, dict):
        return []

    search_key = next((k for k in talent.keys() if "seoLandingPageJobSearchResults" in k), None)
    if not search_key:
        return []

    search_results = talent.get(search_key) or {}
    startup_refs = search_results.get("startups", [])

    jobs: list[JobItem] = []

    for s_ref in startup_refs:
        startup_id = s_ref.get("__ref") if isinstance(s_ref, dict) else str(s_ref)
        startup = apollo_data.get(startup_id, {})
        if not startup:
            continue

        company_name = str(startup.get("name") or "Startup").strip()
        company_logo_url = startup.get("logoUrl")
        startup_slug = startup.get("slug")
        company_website = f"{WELLFOUND_BASE_URL}/company/{startup_slug}" if startup_slug else None

        job_refs = startup.get("highlightedJobListings", [])
        for j_ref in job_refs:
            job_node_id = j_ref.get("__ref") if isinstance(j_ref, dict) else str(j_ref)
            job_obj = apollo_data.get(job_node_id, {})
            if not job_obj:
                continue

            jid = str(job_obj.get("id") or "")
            title = str(job_obj.get("title") or "").strip()
            if not title or not jid:
                continue

            slug = str(job_obj.get("slug") or "job")
            direct_url = f"{WELLFOUND_BASE_URL}/jobs/{jid}-{slug}"

            desc_raw = str(job_obj.get("description") or "")
            desc_text = clean_html(desc_raw)

            # Location and remote extraction
            locations = job_obj.get("locationNames", []) or []
            is_remote_flag = bool(job_obj.get("remote"))
            location_raw = ", ".join(locations) if locations else (fallback_loc if not is_remote_flag else "Remote")
            city, inferred_remote, is_intl = parse_location(location_raw)
            is_remote = is_remote_flag or inferred_remote

            # Compensation
            comp_raw = job_obj.get("compensation") or None
            salary_min, salary_max, currency = parse_wellfound_compensation(comp_raw)

            # Experience
            exp_min = job_obj.get("yearsExperienceMin")
            exp_max = job_obj.get("yearsExperienceMax")

            # Posted date from liveStartAt
            live_start_at = job_obj.get("liveStartAt")
            posted_at = None
            if live_start_at and isinstance(live_start_at, (int, float)):
                try:
                    posted_at = datetime.fromtimestamp(live_start_at, tz=timezone.utc)
                except Exception:
                    pass

            jobs.append(
                JobItem(
                    external_id=jid,
                    title=title,
                    company_name=company_name,
                    source="wellfound",
                    location_raw=location_raw,
                    city=city,
                    is_remote=is_remote,
                    is_international=is_intl,
                    salary_raw=comp_raw,
                    salary_min=salary_min,
                    salary_max=salary_max,
                    currency=currency,
                    url=direct_url,
                    description_text=desc_text,
                    description_html=desc_raw if desc_raw else None,
                    posted_at=posted_at,
                    experience_min_years=exp_min,
                    experience_max_years=exp_max,
                    company_logo_url=company_logo_url,
                    company_website=company_website,
                )
            )

    return jobs

class WellfoundClient:
    """
    Client for Wellfound SSR Apollo Extraction Ingestion.
    """

    def __init__(
        self,
        client: httpx.AsyncClient | Any = None,
        timeout: float = 30.0,
        impersonate: str = "chrome120",
    ):
        self.client = client
        self.timeout = timeout
        self.impersonate = impersonate

    async def search_jobs(
        self,
        role: str = "ai-engineer",
        location: str = "india",
        page: int = 1,
        limit: int = 50,
        max_age_days: int | None = None,
    ) -> list[JobItem]:
        role_slug = slugify_term(role)
        loc_slug = slugify_term(location)

        # Wellfound standard SEO landing page URL pattern
        url = f"{WELLFOUND_BASE_URL}/role/l/{role_slug}/{loc_slug}"
        if page > 1:
            url += f"?page={page}"

        html_content = await self._fetch_html(url)
        if not html_content:
            return []

        apollo_data = extract_wellfound_apollo_data(html_content)
        if not apollo_data:
            logger.warning(f"Could not extract Apollo data from Wellfound URL: {url}")
            return []

        jobs = parse_wellfound_apollo_jobs(apollo_data, fallback_loc=location)

        # Filter by age if requested
        if max_age_days is not None and max_age_days > 0:
            now = datetime.now(timezone.utc)
            filtered_jobs: list[JobItem] = []
            for j in jobs:
                if j.posted_at is None:
                    filtered_jobs.append(j)
                else:
                    age_days = (now - j.posted_at).total_seconds() / 86400.0
                    if age_days <= max_age_days:
                        filtered_jobs.append(j)
            jobs = filtered_jobs

        return jobs[:limit]

    async def _fetch_html(self, url: str) -> str | None:
        try:
            from curl_cffi.requests import AsyncSession

            async with AsyncSession(impersonate=self.impersonate) as session:
                resp = await session.get(
                    url,
                    headers=WELLFOUND_DEFAULT_HEADERS,
                    timeout=self.timeout,
                )
                if resp.status_code != 200:
                    logger.warning(f"Wellfound curl_cffi returned HTTP {resp.status_code} for {url}")
                    return None
                return resp.text
        except Exception as curl_err:
            logger.warning(f"curl_cffi failed on Wellfound ({curl_err}), trying httpx fallback...")
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as http_client:
                    resp = await http_client.get(url, headers=WELLFOUND_DEFAULT_HEADERS)
                    if resp.status_code != 200:
                        logger.warning(f"Wellfound httpx returned HTTP {resp.status_code}")
                        return None
                    return resp.text
            except Exception as http_err:
                logger.warning(f"httpx fallback also failed: {http_err}")
                return None
