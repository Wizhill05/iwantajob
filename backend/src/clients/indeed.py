import logging
import re
from datetime import datetime, timezone
from typing import Any
import httpx

from src.models.job import JobItem, clean_html, parse_location

logger = logging.getLogger(__name__)

INDEED_GRAPHQL_URL = "https://apis.indeed.com/graphql"
INDEED_API_KEY = "161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8"

INDEED_MOBILE_HEADERS: dict[str, str] = {
    "Host": "apis.indeed.com",
    "Content-Type": "application/json",
    "indeed-api-key": INDEED_API_KEY,
    "indeed-locale": "en-IN",
    "indeed-co": "IN",
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Indeed App 193.1",
    "indeed-app-info": "appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone",
}

def build_indeed_graphql_query(
    what: str,
    where: str,
    limit: int,
    sort: str = "DATE",
    radius: int = 25,
    radius_unit: str = "KILOMETERS",
) -> str:
    """
    Construct the GraphQL query payload matching Indeed Mobile specifications.
    """
    escaped_what = what.replace("\\", "\\\\").replace('"', '\\"')
    escaped_where = where.replace("\\", "\\\\").replace('"', '\\"')
    sort_str = f', sort: {sort.upper()}' if sort and sort.upper() in ("DATE", "RELEVANCE") else ""
    unit_str = "KILOMETERS" if radius_unit.upper() in ("KILOMETERS", "KM") else "MILES"
    return (
        f'query GetJobData {{\n'
        f'  jobSearch(what: "{escaped_what}", location: {{where: "{escaped_where}", radius: {radius}, radiusUnit: {unit_str}}}, limit: {limit}{sort_str}) {{\n'
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
        f'      }}\n'
        f'    }}\n'
        f'  }}\n'
        f'}}'
    )

def parse_indeed_date(date_val: Any) -> datetime | None:
    """
    Parse date published from Indeed timestamp (ms or s) or ISO format.
    """
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
    """
    Extract min salary, max salary, and human-readable string from compensation node.
    """
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
) -> list[JobItem]:
    """
    Extract standardized JobItem objects from Indeed Mobile GraphQL response payload.
    """
    if not isinstance(data, dict):
        return []

    if "errors" in data and not data.get("data"):
        logger.warning(f"Indeed GraphQL returned errors: {data.get('errors')}")
        return []

    job_search = data.get("data", {}).get("jobSearch", {})
    if not isinstance(job_search, dict):
        return []

    results = job_search.get("results", [])
    if not isinstance(results, list):
        return []

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

        url = (
            f"https://www.indeed.com/viewjob?jk={job_key}"
            if job_key
            else ""
        )

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
            )
        )

    return jobs

class IndeedClient:
    """
    Client for Indeed Mobile GraphQL Ingestion.
    """

    GRAPHQL_URL = INDEED_GRAPHQL_URL
    HEADERS = INDEED_MOBILE_HEADERS

    def __init__(
        self,
        client: httpx.AsyncClient | Any = None,
        timeout: float = 30.0,
        impersonate: str = "safari17_2_ios",
    ):
        self.client = client
        self.timeout = timeout
        self.impersonate = impersonate

    async def search_jobs(
        self,
        what: str = "ai engineer",
        where: str = "India",
        limit: int = 50,
        sort: str = "RELEVANCE",
        radius: int = 25,
        radius_unit: str = "KILOMETERS",
    ) -> list[JobItem]:
        query = build_indeed_graphql_query(
            what=what,
            where=where,
            limit=limit,
            sort=sort,
            radius=radius,
            radius_unit=radius_unit,
        )
        payload = {"query": query}
        headers = dict(self.HEADERS)

        try:
            if self.client is not None:
                resp = await self.client.post(
                    self.GRAPHQL_URL,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
                if resp.status_code in (401, 403, 429) or resp.status_code != 200:
                    logger.warning(f"Indeed API returned HTTP {resp.status_code}")
                    return []
                data = resp.json()
            else:
                data = await self._fetch_with_curl_or_httpx(payload, headers, what, where)
                if data is None:
                    return []

            return parse_graphql_response(data, fallback_where=where)
        except Exception as exc:
            logger.warning(f"Error fetching Indeed jobs: {exc}")
            return []

    async def _fetch_with_curl_or_httpx(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        what: str,
        where: str,
    ) -> dict[str, Any] | None:
        try:
            from curl_cffi.requests import AsyncSession

            async with AsyncSession(impersonate=self.impersonate) as session:
                resp = await session.post(
                    self.GRAPHQL_URL,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
                if resp.status_code != 200:
                    logger.warning(f"Indeed curl_cffi status {resp.status_code}")
                    return None
                return resp.json()
        except Exception as curl_err:
            logger.warning(f"curl_cffi request failed ({curl_err}), trying httpx fallback...")
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as http_client:
                    resp = await http_client.post(
                        self.GRAPHQL_URL,
                        headers=headers,
                        json=payload,
                    )
                    if resp.status_code != 200:
                        logger.warning(f"Indeed httpx status {resp.status_code}")
                        return None
                    return resp.json()
            except Exception as http_err:
                logger.warning(f"httpx fallback failed: {http_err}")
                return None
