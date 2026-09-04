import asyncio
import logging
import random
import time
from datetime import datetime, timezone
from typing import Any
import httpx

from src.core.config import settings
from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

INDEED_GRAPHQL_URL = "https://apis.indeed.com/graphql"


class UpstreamBlockedError(Exception):
    """Raised when Indeed returns 401 or 403, indicating API key/header rejection."""
    pass


class UpstreamRateLimitError(Exception):
    """Raised when Indeed returns 429 Too Many Requests."""
    def __init__(self, message: str, retry_after: float = 5.0):
        super().__init__(message)
        self.retry_after = retry_after


class UpstreamGraphQLError(Exception):
    """Raised when Indeed returns GraphQL-level syntax/validation errors."""
    pass


def get_mobile_headers() -> dict[str, str]:
    """Dynamically construct headers using current configuration."""
    return {
        "Host": "apis.indeed.com",
        "Content-Type": "application/json",
        "indeed-api-key": settings.indeed_api_key,
        "indeed-locale": settings.indeed_locale,
        "indeed-co": settings.indeed_co,
        "user-agent": (
            f"Mozilla/5.0 (iPhone; CPU iPhone OS {settings.indeed_ios_version.replace('.', '_')} like Mac OS X) "
            f"AppleWebKit/605.1.15 Mobile/15E148 Indeed App {settings.indeed_app_version}"
        ),
        "indeed-app-info": (
            f"appv={settings.indeed_app_version}; appid=com.indeed.jobsearch; "
            f"osv={settings.indeed_ios_version}; os=ios; dtype=phone"
        ),
    }


def build_indeed_graphql_query(
    what: str,
    where: str,
    limit: int,
    sort: str = "DATE",
    radius: int = 25,
    radius_unit: str = "KILOMETERS",
    cursor: str | None = None,
) -> str:
    """
    Construct the GraphQL query payload matching Indeed Mobile specifications.
    Sanitizes string inputs to prevent GraphQL injection syntax errors.
    """
    escaped_what = what.replace("\\", "\\\\").replace('"', '\\"')
    escaped_where = where.replace("\\", "\\\\").replace('"', '\\"')
    sort_str = f', sort: {sort.upper()}' if sort and sort.upper() in ("DATE", "RELEVANCE") else ""
    unit_str = "KILOMETERS" if radius_unit.upper() in ("KILOMETERS", "KM") else "MILES"
    cursor_str = f', cursor: "{cursor.replace("\\", "\\\\").replace("\"", "\\\"")}"' if cursor else ""
    
    # Enforce API bounds: max 100 per Indeed GraphQL specification
    clamped_limit = max(1, min(limit, 100))

    return (
        f'query GetJobData {{\n'
        f'  jobSearch(what: "{escaped_what}", location: {{where: "{escaped_where}", radius: {radius}, radiusUnit: {unit_str}}}, limit: {clamped_limit}{sort_str}{cursor_str}) {{\n'
        f'    pageInfo {{\n'
        f'      nextCursor\n'
        f'    }}\n'
        f'    results {{\n'
        f'      trackingKey\n'
        f'      job {{\n'
        f'        key\n'
        f'        title\n'
        f'        datePublished\n'
        f'        description {{\n'
        f'          html\n'
        f'        }}\n'
        f'        location {{\n'
        f'          city\n'
        f'          admin1Code\n'
        f'          countryCode\n'
        f'          formatted {{\n'
        f'            short\n'
        f'          }}\n'
        f'        }}\n'
        f'        compensation {{\n'
        f'          estimated {{\n'
        f'            baseSalary {{\n'
        f'              unitOfWork\n'
        f'              range {{\n'
        f'                ... on Range {{\n'
        f'                  min\n'
        f'                  max\n'
        f'                }}\n'
        f'              }}\n'
        f'            }}\n'
        f'          }}\n'
        f'        }}\n'
        f'        employer {{\n'
        f'          name\n'
        f'          relativeCompanyPageUrl\n'
        f'        }}\n'
        f'        url\n'
        f'        attributes {{\n'
        f'          key\n'
        f'          label\n'
        f'        }}\n'
        f'      }}\n'
        f'    }}\n'
        f'  }}\n'
        f'}}'
    )


def parse_indeed_date(date_val: Any) -> datetime | None:
    if not date_val:
        return None
    if isinstance(date_val, (int, float)):
        try:
            if date_val > 1e11:
                return datetime.fromtimestamp(date_val / 1000.0, tz=timezone.utc)
            return datetime.fromtimestamp(date_val, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(date_val, str):
        date_str = date_val.strip()
        if date_str.isdigit():
            try:
                num = float(date_str)
                if num > 1e11:
                    return datetime.fromtimestamp(num / 1000.0, tz=timezone.utc)
                return datetime.fromtimestamp(num, tz=timezone.utc)
            except Exception:
                return None
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None
    return None


def _format_salary_number(num: float) -> str:
    if num.is_integer():
        return str(int(num))
    return f"{num:.2f}".rstrip("0").rstrip(".")


def parse_indeed_compensation(
    comp_data: dict[str, Any] | None,
) -> tuple[float | None, float | None, str | None]:
    if not isinstance(comp_data, dict):
        return (None, None, None)

    estimated = comp_data.get("estimated") or {}
    base_salary = estimated.get("baseSalary") or {}
    salary_range = base_salary.get("range") or {}
    unit = base_salary.get("unitOfWork")

    s_min = salary_range.get("min")
    s_max = salary_range.get("max")
    salary_min = float(s_min) if s_min is not None else None
    salary_max = float(s_max) if s_max is not None else None

    salary_raw = None
    if salary_min is not None or salary_max is not None:
        parts: list[str] = []
        if salary_min is not None:
            parts.append(_format_salary_number(salary_min))
        if salary_max is not None:
            parts.append(_format_salary_number(salary_max))
        salary_raw = " - ".join(parts)
        if unit:
            salary_raw += f" per {unit.lower()}"

    return (salary_min, salary_max, salary_raw)


def parse_graphql_response(
    data: dict[str, Any], fallback_where: str = "India"
) -> tuple[list[JobItem], str | None]:
    """
    Extract standardized JobItem objects and nextCursor from GraphQL response payload.
    """
    if not isinstance(data, dict):
        return [], None

    if "errors" in data and not data.get("data"):
        err_msg = str(data.get("errors"))
        logger.warning(f"Indeed GraphQL returned errors: {err_msg}")
        raise UpstreamGraphQLError(f"Indeed GraphQL rejected query: {err_msg}")

    job_search = data.get("data", {}).get("jobSearch", {})
    if not isinstance(job_search, dict):
        return [], None

    next_cursor = None
    page_info = job_search.get("pageInfo")
    if isinstance(page_info, dict):
        next_cursor = page_info.get("nextCursor")

    results = job_search.get("results", [])
    if not isinstance(results, list):
        return [], next_cursor

    jobs: list[JobItem] = []
    for item in results:
        if not isinstance(item, dict):
            continue

        job_data = item.get("job")
        target_data = job_data if isinstance(job_data, dict) else item

        tracking_key = str(item.get("trackingKey") or "")
        job_key = str(target_data.get("key") or tracking_key).strip()
        title = str(target_data.get("title") or "").strip()
        if not title:
            continue

        employer = target_data.get("employer") or item.get("employer") or {}
        company_name = "Unknown"
        if isinstance(employer, dict):
            company_name = str(employer.get("name") or "Unknown").strip()

        loc_data = target_data.get("location") or {}
        formatted_loc = ""
        city_val = ""
        admin1_val = ""
        country_val = ""
        if isinstance(loc_data, dict):
            formatted_loc = str(
                (loc_data.get("formatted") or {}).get("short") or ""
            ).strip()
            city_val = str(loc_data.get("city") or "").strip()
            admin1_val = str(loc_data.get("admin1Code") or "").strip()
            country_val = str(loc_data.get("countryCode") or "").strip()

        if formatted_loc:
            location_raw = formatted_loc
        elif city_val or country_val:
            location_raw = ", ".join(
                [p for p in [city_val, admin1_val, country_val] if p]
            )
        else:
            location_raw = fallback_where

        city, is_remote, is_intl = parse_location(location_raw)

        if not city and city_val:
            inferred_city, _, _ = parse_location(city_val)
            city = inferred_city or city_val

        if isinstance(loc_data, dict) and loc_data.get("isRemote"):
            is_remote = True

        comp_data = target_data.get("compensation")
        salary_min, salary_max, salary_raw = parse_indeed_compensation(comp_data)

        currency = "INR"
        if country_val and country_val.upper() != "IN":
            if country_val.upper() in ("US", "USA"):
                currency = "USD"
            elif country_val.upper() in ("GB", "UK"):
                currency = "GBP"
            elif country_val.upper() in ("DE", "FR", "NL", "EU"):
                currency = "EUR"

        desc_data = target_data.get("description") or {}
        desc_html_raw = ""
        if isinstance(desc_data, dict):
            desc_html_raw = str(desc_data.get("html") or "")
        elif isinstance(target_data.get("descriptionHtml"), str):
            desc_html_raw = str(target_data.get("descriptionHtml") or "")

        desc_text = clean_html(desc_html_raw)
        desc_html = desc_html_raw if desc_html_raw else None
        posted_at = parse_indeed_date(target_data.get("datePublished"))
        url = f"https://www.indeed.com/viewjob?jk={job_key}" if job_key else ""

        apply_target_url = target_data.get("url") or ""
        attrs = target_data.get("attributes") or []
        is_indeed_hosted = ("indeed.com" in apply_target_url) or not apply_target_url
        is_fresher_attr = any("fresher" in str(a.get("label", "")).lower() for a in attrs if isinstance(a, dict))
        exp_min = 0 if is_fresher_attr else None

        jobs.append(
            JobItem(
                external_id=job_key,
                title=title,
                company_name=company_name,
                source="indeed",
                location_raw=location_raw,
                city=city,
                is_remote=is_remote,
                is_international=is_intl,
                salary_raw=salary_raw,
                salary_min=salary_min,
                salary_max=salary_max,
                currency=currency,
                url=url,
                description_text=desc_text,
                description_html=desc_html,
                posted_at=posted_at,
                experience_min_years=exp_min,
            )
        )

    return jobs, next_cursor


class IndeedClient:
    """
    Robust Client for Indeed Mobile GraphQL Ingestion with concurrency guardrails,
    rate limit throttling, retries, and error differentiation.
    """

    GRAPHQL_URL = INDEED_GRAPHQL_URL

    def __init__(
        self,
        client: httpx.AsyncClient | Any = None,
        timeout: float | None = None,
        impersonate: str = "safari17_2_ios",
    ):
        self.client = client
        self.timeout = timeout or settings.timeout_seconds
        self.impersonate = impersonate
        # Guardrail 1: Mutex Semaphore to prevent concurrent bursts against Indeed API from single IP
        self._semaphore = asyncio.Semaphore(1)
        # Guardrail 2: Rate limiter timestamp tracker
        self._last_request_time: float = 0.0

    async def _rate_limit_throttle(self) -> None:
        """Enforces jittered inter-request delay to prevent burst HTTP 429s."""
        min_interval = settings.min_request_interval_seconds
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < min_interval:
            jitter = random.uniform(0.1, 0.4)
            wait_time = (min_interval - elapsed) + jitter
            logger.debug(f"Rate limiter sleeping for {wait_time:.2f}s...")
            await asyncio.sleep(wait_time)
        self._last_request_time = time.monotonic()

    async def search_jobs(
        self,
        what: str = "ai engineer",
        where: str = "India",
        limit: int = 50,
        sort: str = "RELEVANCE",
        radius: int = 25,
        radius_unit: str = "KILOMETERS",
        cursor: str | None = None,
        return_raw: bool = False,
    ) -> tuple[list[JobItem], str | None] | tuple[list[JobItem], str | None, dict[str, Any]]:
        query = build_indeed_graphql_query(
            what=what,
            where=where,
            limit=limit,
            sort=sort,
            radius=radius,
            radius_unit=radius_unit,
            cursor=cursor,
        )
        payload = {"query": query}
        headers = get_mobile_headers()

        # Execute inside concurrency semaphore
        async with self._semaphore:
            data = await self._execute_with_retries(payload, headers, what, where)
            items, next_cursor = parse_graphql_response(data, fallback_where=where)
            if return_raw:
                return items, next_cursor, data
            return items, next_cursor

    async def _execute_with_retries(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        what: str,
        where: str,
    ) -> dict[str, Any]:
        """Handles retries with exponential backoff for transient network issues or rate limits."""
        max_retries = settings.max_retries
        for attempt in range(max_retries + 1):
            await self._rate_limit_throttle()
            try:
                if self.client is not None:
                    resp = await self.client.post(
                        self.GRAPHQL_URL,
                        headers=headers,
                        json=payload,
                        timeout=self.timeout,
                    )
                    self._check_status_code(resp.status_code, what, where)
                    return resp.json()
                else:
                    return await self._fetch_with_curl_or_httpx(payload, headers, what, where)
            except UpstreamRateLimitError as rle:
                if attempt < max_retries:
                    backoff = rle.retry_after * (attempt + 1) + random.uniform(0.5, 1.5)
                    logger.warning(f"Rate limited by Indeed. Backing off for {backoff:.2f}s (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(backoff)
                    continue
                raise
            except (httpx.RequestError, ConnectionError) as net_err:
                if attempt < max_retries:
                    backoff = 2.0 * (attempt + 1)
                    logger.warning(f"Network error: {net_err}. Retrying in {backoff}s...")
                    await asyncio.sleep(backoff)
                    continue
                raise

        raise RuntimeError(f"Exhausted {max_retries} retries querying Indeed.")

    def _check_status_code(self, status_code: int, what: str, where: str) -> None:
        if status_code == 429:
            raise UpstreamRateLimitError(f"Indeed rate limit (HTTP 429) hit for '{what}' in '{where}'")
        if status_code in (401, 403):
            raise UpstreamBlockedError(f"Indeed rejected API key or TLS signature (HTTP {status_code})")
        if status_code != 200:
            raise RuntimeError(f"Indeed returned unexpected HTTP status {status_code}")

    async def _fetch_with_curl_or_httpx(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        what: str,
        where: str,
    ) -> dict[str, Any]:
        """Executes using curl_cffi with TLS fingerprint impersonation, falling back to httpx."""
        try:
            from curl_cffi.requests import AsyncSession

            proxy = settings.http_proxy
            proxies = {"http": proxy, "https": proxy} if proxy else None

            async with AsyncSession(impersonate=self.impersonate, proxies=proxies) as session:
                resp = await session.post(
                    self.GRAPHQL_URL,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
                self._check_status_code(resp.status_code, what, where)
                return resp.json()
        except (UpstreamRateLimitError, UpstreamBlockedError):
            raise
        except Exception as curl_err:
            logger.warning(f"curl_cffi failed ({curl_err}), attempting httpx fallback...")
            try:
                async with httpx.AsyncClient(timeout=self.timeout, proxy=settings.http_proxy) as http_client:
                    resp = await http_client.post(
                        self.GRAPHQL_URL,
                        headers=headers,
                        json=payload,
                    )
                    self._check_status_code(resp.status_code, what, where)
                    return resp.json()
            except (UpstreamRateLimitError, UpstreamBlockedError):
                raise
            except Exception as http_err:
                logger.error(f"httpx fallback also failed: {http_err}")
                raise RuntimeError(f"All HTTP transport methods failed for Indeed query: {http_err}") from http_err
