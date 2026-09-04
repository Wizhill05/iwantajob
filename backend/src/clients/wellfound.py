import asyncio
import json
import logging
import random
import re
from datetime import datetime, timezone
from typing import Any
import httpx
from bs4 import BeautifulSoup

from src.clients.wellfound_slugs import (
    SUPPORTED_WELLFOUND_ROLES,
    SUPPORTED_WELLFOUND_LOCATIONS,
    ROLE_SYNONYMS,
    LOCATION_SYNONYMS,
)
from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

WELLFOUND_BASE_URL = "https://wellfound.com"
MAX_WELLFOUND_PAGE = 20  # Hard pagination ceiling to avoid bot gates/redirects

# Rotating realistic browser impersonations supported by curl_cffi
BROWSER_IMPERSONATIONS = [
    "chrome",
    "chrome120",
    "safari",
    "safari_ios",
    "edge",
]

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

def resolve_role_slug(input_role: str) -> str:
    """Normalize and validate a role input against supported Wellfound slugs."""
    cleaned = input_role.strip().lower()
    if cleaned in SUPPORTED_WELLFOUND_ROLES:
        return cleaned

    # Check synonyms
    if cleaned in ROLE_SYNONYMS:
        return ROLE_SYNONYMS[cleaned]

    # Normalize hyphens/spaces
    slugified = re.sub(r"[^a-z0-9\s-]", "", cleaned)
    slugified = re.sub(r"[\s_]+", "-", slugified).strip("-")
    if slugified in SUPPORTED_WELLFOUND_ROLES:
        return slugified

    # Fallback to software-engineer if completely unrecognized
    logger.info(f"Unrecognized role '{input_role}', falling back to 'software-engineer'")
    return "software-engineer"

def resolve_location_slug(input_loc: str) -> str:
    """Normalize and validate a location input against supported Wellfound slugs."""
    cleaned = input_loc.strip().lower()
    if cleaned in SUPPORTED_WELLFOUND_LOCATIONS:
        return cleaned

    # Check synonyms
    if cleaned in LOCATION_SYNONYMS:
        return LOCATION_SYNONYMS[cleaned]

    # Normalize hyphens/spaces
    slugified = re.sub(r"[^a-z0-9\s-]", "", cleaned)
    slugified = re.sub(r"[\s_]+", "-", slugified).strip("-")
    if slugified in SUPPORTED_WELLFOUND_LOCATIONS:
        return slugified

    # Default to india
    logger.info(f"Unrecognized location '{input_loc}', falling back to 'india'")
    return "india"

def parse_wellfound_compensation(comp_str: str | None) -> tuple[float | None, float | None, str]:
    """Parse salary ranges and currencies from strings like '$25k – $50k' or '₹25L – ₹45L'."""
    if not comp_str:
        return None, None, "INR"

    currency = "INR"
    if "$" in comp_str:
        currency = "USD"
    elif "€" in comp_str:
        currency = "EUR"
    elif "£" in comp_str:
        currency = "GBP"

    base_comp = comp_str.split("•")[0].strip()
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
                val *= 100000
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

def parse_wellfound_apollo_jobs(
    apollo_data: dict[str, Any],
    fallback_loc: str = "India",
    include_all_company_jobs: bool = False,
) -> list[JobItem]:
    """
    Extract jobs from Apollo graph.
    If include_all_company_jobs is True, gathers all JobListing nodes found in the apollo graph.
    """
    if not isinstance(apollo_data, dict):
        return []

    jobs: list[JobItem] = []
    seen_job_ids: set[str] = set()

    # Map startup nodes by id and slug for metadata resolution
    startups_by_id: dict[str, dict[str, Any]] = {}
    for k, v in apollo_data.items():
        if isinstance(v, dict) and (k.startswith("StartupResult:") or k.startswith("Startup:")):
            s_id = str(v.get("id") or k.split(":")[-1])
            startups_by_id[s_id] = v
            if v.get("slug"):
                startups_by_id[str(v.get("slug"))] = v

    talent = apollo_data.get("ROOT_QUERY", {}).get("talent", {})
    search_key = next((k for k in talent.keys() if "seoLandingPageJobSearchResults" in k), None) if isinstance(talent, dict) else None

    # Step 1: Process structured search results
    if search_key:
        search_results = talent.get(search_key) or {}
        startup_refs = search_results.get("startups", [])

        for s_ref in startup_refs:
            startup_id = s_ref.get("__ref") if isinstance(s_ref, dict) else str(s_ref)
            startup = apollo_data.get(startup_id, {})
            if not startup:
                continue

            company_name = str(startup.get("name") or "Startup").strip()
            company_logo_url = startup.get("logoUrl")
            startup_slug = startup.get("slug")
            company_website = f"{WELLFOUND_BASE_URL}/company/{startup_slug}" if startup_slug else None

            # Gather highlighted or all job listings for this startup
            job_refs = startup.get("highlightedJobListings", []) or []
            if include_all_company_jobs and startup.get("jobListings"):
                job_refs = list(job_refs) + list(startup.get("jobListings", []))

            for j_ref in job_refs:
                job_node_id = j_ref.get("__ref") if isinstance(j_ref, dict) else str(j_ref)
                job_obj = apollo_data.get(job_node_id, {})
                if not job_obj:
                    continue

                jid = str(job_obj.get("id") or "")
                if not jid or jid in seen_job_ids:
                    continue
                seen_job_ids.add(jid)

                title = str(job_obj.get("title") or "").strip()
                if not title:
                    continue

                slug = str(job_obj.get("slug") or "job")
                direct_url = f"{WELLFOUND_BASE_URL}/jobs/{jid}-{slug}"

                desc_raw = str(job_obj.get("description") or "")
                desc_text = clean_html(desc_raw)

                locations = job_obj.get("locationNames", []) or []
                is_remote_flag = bool(job_obj.get("remote"))
                location_raw = ", ".join(locations) if locations else (fallback_loc if not is_remote_flag else "Remote")
                city, inferred_remote, is_intl = parse_location(location_raw)
                is_remote = is_remote_flag or inferred_remote

                comp_raw = job_obj.get("compensation") or None
                salary_min, salary_max, currency = parse_wellfound_compensation(comp_raw)

                exp_min = job_obj.get("yearsExperienceMin")
                exp_max = job_obj.get("yearsExperienceMax")

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

    # Step 2: Fallback or company-wide scan if requested or no search results key found
    if include_all_company_jobs or len(jobs) == 0:
        for k, v in apollo_data.items():
            if isinstance(v, dict) and (k.startswith("JobListingSearchResult:") or k.startswith("JobListing:")):
                jid = str(v.get("id") or k.split(":")[-1])
                if not jid or jid in seen_job_ids:
                    continue

                title = str(v.get("title") or "").strip()
                if not title:
                    continue
                seen_job_ids.add(jid)

                slug = str(v.get("slug") or "job")
                direct_url = f"{WELLFOUND_BASE_URL}/jobs/{jid}-{slug}"

                # Try matching company name from nearby startup
                company_name = "Startup"
                company_logo_url = None
                company_website = None
                if v.get("startup"):
                    s_ref = v.get("startup", {}).get("__ref")
                    if s_ref and s_ref in apollo_data:
                        s_node = apollo_data[s_ref]
                        company_name = str(s_node.get("name") or company_name)
                        company_logo_url = s_node.get("logoUrl")
                        if s_node.get("slug"):
                            company_website = f"{WELLFOUND_BASE_URL}/company/{s_node.get('slug')}"

                desc_raw = str(v.get("description") or "")
                desc_text = clean_html(desc_raw)

                locations = v.get("locationNames", []) or []
                is_remote_flag = bool(v.get("remote"))
                location_raw = ", ".join(locations) if locations else fallback_loc
                city, inferred_remote, is_intl = parse_location(location_raw)
                is_remote = is_remote_flag or inferred_remote

                comp_raw = v.get("compensation")
                salary_min, salary_max, currency = parse_wellfound_compensation(comp_raw)

                live_start_at = v.get("liveStartAt")
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
                        experience_min_years=v.get("yearsExperienceMin"),
                        experience_max_years=v.get("yearsExperienceMax"),
                        company_logo_url=company_logo_url,
                        company_website=company_website,
                    )
                )

    return jobs

class WellfoundClient:
    """
    Hardened client for Wellfound SSR Apollo Ingestion.
    Includes role slug validation, pagination bounds, retry/backoff, and company job expansion.
    """

    def __init__(
        self,
        client: httpx.AsyncClient | Any = None,
        timeout: float = 30.0,
        max_retries: int = 2,
    ):
        self.client = client
        self.timeout = timeout
        self.max_retries = max_retries

    async def search_jobs(
        self,
        role: str = "ai-engineer",
        location: str = "india",
        page: int = 1,
        limit: int = 30,
        max_age_days: int | None = None,
        include_all_company_jobs: bool = False,
    ) -> list[JobItem]:
        # Guardrail: Enforce pagination ceiling
        clamped_page = max(1, min(page, MAX_WELLFOUND_PAGE))
        if page > MAX_WELLFOUND_PAGE:
            logger.warning(
                f"Requested page {page} exceeds Wellfound limit of {MAX_WELLFOUND_PAGE}. Capping to {MAX_WELLFOUND_PAGE}."
            )

        # Guardrail: Slug resolution
        canonical_role = resolve_role_slug(role)
        canonical_loc = resolve_location_slug(location)

        url = f"{WELLFOUND_BASE_URL}/role/l/{canonical_role}/{canonical_loc}"
        if clamped_page > 1:
            url += f"?page={clamped_page}"

        html_content = await self._fetch_with_resilience(url)
        if not html_content:
            return []

        apollo_data = extract_wellfound_apollo_data(html_content)
        if not apollo_data:
            logger.warning(f"Could not extract Apollo data from Wellfound URL: {url}")
            return []

        jobs = parse_wellfound_apollo_jobs(
            apollo_data,
            fallback_loc=canonical_loc,
            include_all_company_jobs=include_all_company_jobs,
        )

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

    async def fetch_company_jobs(self, company_slug: str, limit: int = 50) -> list[JobItem]:
        """
        Fetch all available jobs for a specific company by inspecting company landing pages.
        """
        clean_slug = re.sub(r"[^a-z0-9-]", "", company_slug.lower().strip())
        url = f"{WELLFOUND_BASE_URL}/company/{clean_slug}"
        html_content = await self._fetch_with_resilience(url)
        if not html_content:
            # Try alternate directory pattern
            url = f"{WELLFOUND_BASE_URL}/jobs?company={clean_slug}"
            html_content = await self._fetch_with_resilience(url)

        if not html_content:
            return []

        apollo_data = extract_wellfound_apollo_data(html_content)
        if not apollo_data:
            return []

        return parse_wellfound_apollo_jobs(apollo_data, include_all_company_jobs=True)[:limit]

    async def _fetch_with_resilience(self, url: str) -> str | None:
        """Fetch URL with TLS impersonation rotation and exponential backoff on rate limits."""
        for attempt in range(self.max_retries + 1):
            impersonation = random.choice(BROWSER_IMPERSONATIONS)
            try:
                from curl_cffi.requests import AsyncSession

                async with AsyncSession(impersonate=impersonation) as session:
                    resp = await session.get(
                        url,
                        headers=DEFAULT_HEADERS,
                        timeout=self.timeout,
                    )
                    if resp.status_code == 200:
                        return resp.text
                    elif resp.status_code == 429:
                        wait_time = (2 ** attempt) + random.uniform(0.5, 1.5)
                        logger.warning(
                            f"Wellfound returned 429 (rate limited) on {url}. Backing off {wait_time:.1f}s (attempt {attempt+1}/{self.max_retries+1})"
                        )
                        if attempt < self.max_retries:
                            await asyncio.sleep(wait_time)
                            continue
                        return None
                    else:
                        logger.warning(f"Wellfound returned HTTP {resp.status_code} for {url}")
                        return None
            except Exception as curl_err:
                logger.warning(f"curl_cffi attempt {attempt+1} failed ({curl_err})")
                if attempt < self.max_retries:
                    await asyncio.sleep(1.0)
                    continue

        # Fallback to standard httpx client if curl_cffi exhausted
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http_client:
                resp = await http_client.get(url, headers=DEFAULT_HEADERS)
                if resp.status_code == 200:
                    return resp.text
                logger.warning(f"httpx fallback status {resp.status_code} for {url}")
                return None
        except Exception as http_err:
            logger.warning(f"httpx fallback failed: {http_err}")
            return None
