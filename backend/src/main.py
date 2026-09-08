import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Query, status, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, delete, text, update

from src.core.database import init_db, async_session_maker
from src.models.db_entities import (
    UnifiedJob,
    RawIndeedJob,
    RawLinkedInJob,
    RawWellfoundJob,
    UserPreference,
    DEFAULT_PREFS,
)
from src.services.auto_triage import AutoTriageService
from src.services.parser_service import ParserService
from src.services.raw_ingestion import (
    save_raw_indeed_job,
    save_raw_linkedin_job,
    save_raw_wellfound_job,
)
from src.services.db_deduplication import check_jobs_exist_in_db

from src.clients.indeed import (
    IndeedClient,
    UpstreamBlockedError,
    UpstreamRateLimitError,
    UpstreamGraphQLError,
)
from src.clients.wellfound import (
    WellfoundClient,
    SUPPORTED_WELLFOUND_ROLES,
    SUPPORTED_WELLFOUND_LOCATIONS,
)
from src.clients.linkedin import LinkedInClient
from src.models.job import JobSearchResponse, JobItem, ErrorDetail
from src.services.scheduler import start_scheduler_loop, stop_scheduler_loop
from src.api.cron_router import router as cron_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("iwantajob")

TAGS_METADATA = [
    {
        "name": "LinkedIn",
        "description": (
            "**LinkedIn Guest Scraper Engine.** Queries LinkedIn's public unauthenticated endpoints "
            "(`seeMoreJobPostings` and single job `jobPosting/{id}`) using TLS ClientHello impersonation (`chrome120`). "
            "Includes strict offset ceilings (< 1,000) to prevent `/authwall` redirects, an in-memory 24-hour LRU description cache, "
            "and concurrency throttles."
        ),
    },
    {
        "name": "Wellfound",
        "description": (
            "**Wellfound (formerly AngelList Talent) SSR Apollo Engine.** Extracts pre-rendered Apollo GraphQL state "
            "(`__NEXT_DATA__`) from public SEO landing pages, completely avoiding Cloudflare Turnstile bot challenges. "
            "Enforces canonical slug validation and strict pagination ceilings (1–20)."
        ),
    },
    {
        "name": "Indeed",
        "description": (
            "**Indeed Mobile GraphQL Gateway.** Queries Indeed's private iOS app GraphQL endpoint using mobile client signatures "
            "and TLS fingerprint impersonation. Features concurrency semaphores, jittered rate limiting, and cursor-based pagination."
        ),
    },
    {
        "name": "System",
        "description": "Operational health checks and container readiness probes.",
    },
    {
        "name": "Cron",
        "description": "Scheduled scraping jobs management, automated cron execution, and interval triggers.",
    },
]

APP_DESCRIPTION = """
## Autonomous Job Discovery & Aggregation API

Production-grade ingestion backend that aggregates, parses, and normalizes job postings across **LinkedIn**, **Wellfound**, and **Indeed** without requiring user authentication.

### Core Architectural Capabilities

* **TLS Fingerprint Impersonation:** Employs `curl_cffi` to mimic realistic browser ClientHello signatures (`chrome120`, iOS Safari), bypassing Cloudflare Turnstile, Akamai, and bot protection barriers.
* **Unified Data Contract:** Every platform maps outputs into a consistent `JobItem` model with normalized location parsing, remote detection, compensation extraction, and direct canonical application URLs.
* **Strict Anti-Detection Guardrails:**
  * **LinkedIn:** Offsets clamped to 975 to prevent `/authwall` redirects; in-memory 24h LRU detail caching; concurrency semaphore (`max=5`).
  * **Wellfound:** Validated canonical slug mapping; page ceiling clamped to 20; Cloudflare challenge anomaly detection.
  * **Indeed:** Concurrency lock (1 worker); jittered rate limiter (1.2s–1.6s); exponential backoff retries; mobile API key rotation via `INDEED_API_KEY`.

### Interactive Visual Portals
* [Indeed Testing Portal](/)
* [LinkedIn Testing Portal](/linkedin)
* [Wellfound Testing Portal](/wellfound)
"""

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager:
    - On startup: initialize database tables and start the background scheduler loop.
    - On shutdown: stop the background scheduler loop.
    """
    logger.info("Initializing database and starting scheduler loop...")
    await init_db()
    start_scheduler_loop()
    yield
    logger.info("Stopping scheduler loop...")
    stop_scheduler_loop()

app = FastAPI(
    title="Autonomous Job Discovery API",
    description=APP_DESCRIPTION,
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
)

app.include_router(cron_router, prefix="/api/cron", tags=["Cron"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

indeed_client = IndeedClient()
wellfound_client = WellfoundClient()
linkedin_client = LinkedInClient()

@app.get("/", include_in_schema=False)
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    return FileResponse(index_path)

@app.get("/wellfound", include_in_schema=False)
async def serve_wellfound():
    page_path = STATIC_DIR / "wellfound.html"
    return FileResponse(page_path)

@app.get("/linkedin", include_in_schema=False)
async def serve_linkedin():
    page_path = STATIC_DIR / "linkedin.html"
    return FileResponse(page_path)

@app.get(
    "/health",
    summary="System Health & Readiness Probe",
    tags=["System"],
    responses={200: {"description": "Service is healthy and ready to accept scraping requests."}},
)
async def health_check():
    """
    Returns service health status and version. Used by container orchestrators,
    load balancers, and external status monitors.
    """
    return {"status": "ok", "version": "1.0.0"}

@app.get(
    "/api/wellfound/roles",
    summary="List Canonical Wellfound Roles and Locations",
    tags=["Wellfound"],
    responses={200: {"description": "List of supported role slugs, location slugs, and pagination bounds."}},
)
async def get_wellfound_supported_slugs():
    """
    Return all canonical and tested Wellfound roles and locations supported by the scraper.
    Frontends should query this endpoint to populate dropdowns and guarantee valid slug parameters.
    """
    return {
        "roles": [
            {"slug": slug, "name": name}
            for slug, name in SUPPORTED_WELLFOUND_ROLES.items()
        ],
        "locations": [
            {"slug": slug, "name": name}
            for slug, name in SUPPORTED_WELLFOUND_LOCATIONS.items()
        ],
        "pagination_limit": 20,
    }

@app.get(
    "/api/scrape/indeed",
    summary="Query Indeed Mobile GraphQL Gateway",
    response_model=JobSearchResponse,
    responses={
        200: {"description": "Successfully scraped job results from Indeed Mobile Gateway."},
        400: {"model": ErrorDetail, "description": "Invalid query parameters or upstream GraphQL syntax error."},
        429: {"model": ErrorDetail, "description": "Upstream rate limit reached on Indeed. Check retry_after value."},
        502: {"model": ErrorDetail, "description": "Upstream Indeed API key or signature rejected."},
        500: {"model": ErrorDetail, "description": "Internal server error occurred while scraping Indeed."},
    },
    tags=["Indeed"],
)
async def scrape_indeed(
    what: Annotated[
        str,
        Query(
            description="Job title, role, or keywords. Supports boolean/filter operators (e.g. 'ai engineer', 'title:\"sdet\"').",
            examples=["ai engineer"],
        ),
    ] = "ai engineer",
    where: Annotated[
        str,
        Query(
            description="Target location or city (e.g. 'Bangalore, Karnataka', 'Pune', 'India').",
            examples=["India"],
        ),
    ] = "India",
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=100,
            description="Maximum jobs to fetch per batch (bounded between 1 and 100).",
            examples=[20],
        ),
    ] = 20,
    sort: Annotated[
        str,
        Query(
            description="Sort order: 'relevance' (Indeed mobile ranking) or 'date' (newest first).",
            examples=["relevance"],
        ),
    ] = "relevance",
    radius: Annotated[
        int,
        Query(
            ge=0,
            le=200,
            description="Search radius distance from the target location.",
            examples=[25],
        ),
    ] = 25,
    radius_unit: Annotated[
        str,
        Query(
            description="Radius distance unit: 'KILOMETERS' or 'MILES'.",
            examples=["KILOMETERS"],
        ),
    ] = "KILOMETERS",
    cursor: Annotated[
        str | None,
        Query(
            description="Pagination cursor token obtained from next_cursor of a previous response.",
            examples=["AAIAAQACAAAAAAAAAAAAAAACYxj34QEAAKimjvf6"],
        ),
    ] = None,
    persist: Annotated[
        bool,
        Query(
            description="When true, saves raw unmodified records into the raw_indeed_jobs table.",
            examples=[True],
        ),
    ] = False,
):
    """
    Connects directly to Indeed's unauthenticated iOS mobile GraphQL gateway (`https://apis.indeed.com/graphql`)
    using TLS ClientHello impersonation.

    ### Guardrails
    * **Concurrency Lock:** Limits upstream queries to 1 active request to avoid IP flagging.
    * **Jittered Throttle:** Automatic 1.2s to 1.6s delay between requests.
    * **Backoff Retries:** Automatically retries transient 429s up to 2 times.
    """
    clean_what = what.strip()
    clean_where = where.strip()

    if not clean_what:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": "INVALID_QUERY",
                "detail": "The 'what' parameter must not be empty.",
                "retry_after": None,
            },
        )
    if not clean_where:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": "INVALID_LOCATION",
                "detail": "The 'where' parameter must not be empty.",
                "retry_after": None,
            },
        )

    try:
        res = await indeed_client.search_jobs(
            what=clean_what,
            where=clean_where,
            limit=limit,
            sort=sort,
            radius=radius,
            radius_unit=radius_unit,
            cursor=cursor,
            return_raw=True,
        )
        items, next_cursor, raw_data = res

        if persist:
            raw_results = raw_data.get("data", {}).get("jobSearch", {}).get("results", [])
            for res_item in raw_results:
                job_d = res_item.get("job") or {}
                t_key = res_item.get("trackingKey")
                jk = job_d.get("key") or t_key
                if not jk:
                    continue
                emp = job_d.get("employer")
                emp_name = (emp.get("name") if isinstance(emp, dict) else None) or "Unknown"
                loc_d = job_d.get("location") or {}
                loc_short = (loc_d.get("formatted") or {}).get("short") or clean_where
                city_val = loc_d.get("city")
                ctry_val = loc_d.get("countryCode")
                apply_url_val = job_d.get("url") or ""
                easy_apply = ("indeed.com" in apply_url_val) or not apply_url_val
                attrs_val = job_d.get("attributes") or []
                desc_d = job_d.get("description") or {}
                desc_html_val = desc_d.get("html")
                from src.models.job import clean_html
                desc_text_val = clean_html(desc_html_val)
                await save_raw_indeed_job({
                    "external_id": jk,
                    "tracking_key": t_key,
                    "title": job_d.get("title") or "Unknown",
                    "company_name": emp_name,
                    "location_raw": loc_short,
                    "location_city": city_val,
                    "location_country": ctry_val,
                    "is_remote": bool(loc_d.get("isRemote")),
                    "apply_url": apply_url_val,
                    "easy_apply_available": easy_apply,
                    "attributes": attrs_val,
                    "salary_raw": None,
                    "description_html": desc_html_val,
                    "description_text": desc_text_val,
                    "date_published": None,
                    "raw_payload": res_item,
                })

        # Check in DB to mark is_in_db on returned items
        descriptors = [
            {"source": "indeed", "external_id": it.external_id, "url": it.url}
            for it in items
        ]
        found_in_db = await check_jobs_exist_in_db(descriptors)
        for it in items:
            it.is_in_db = ("indeed", it.external_id) in found_in_db

        return JobSearchResponse(
            query=clean_what,
            location=clean_where,
            total_count=len(items),
            next_cursor=next_cursor,
            sort=sort,
            radius_km=radius if radius_unit.upper().startswith("K") else int(radius * 1.60934),
            items=items,
        )
    except UpstreamRateLimitError as exc:
        logger.warning(f"Indeed rate limit triggered: {exc}")
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "UPSTREAM_RATE_LIMITED",
                "detail": str(exc),
                "retry_after": exc.retry_after,
            },
        )
    except UpstreamBlockedError as exc:
        logger.error(f"Indeed upstream blocked: {exc}")
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "error": "UPSTREAM_BLOCKED",
                "detail": str(exc),
                "retry_after": None,
            },
        )
    except UpstreamGraphQLError as exc:
        logger.error(f"Indeed GraphQL syntax error: {exc}")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": "GRAPHQL_ERROR",
                "detail": str(exc),
                "retry_after": None,
            },
        )
    except Exception as exc:
        logger.error(f"Unexpected error querying Indeed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "detail": f"An internal error occurred while scraping Indeed: {str(exc)}",
                "retry_after": None,
            },
        )

@app.get(
    "/api/scrape/wellfound",
    summary="Scrape Wellfound Jobs via Apollo SSR",
    response_model=list[JobItem],
    responses={
        200: {"description": "Successfully extracted job items from Wellfound Apollo SSR state."},
        400: {"model": ErrorDetail, "description": "Invalid query parameters or unrecognized slugs."},
        422: {"description": "Validation error (e.g. page > 20 or limit out of range)."},
        500: {"model": ErrorDetail, "description": "Wellfound extraction error or upstream block."},
    },
    tags=["Wellfound"],
)
async def scrape_wellfound(
    role: Annotated[
        str,
        Query(
            description="Role slug or title (e.g. 'ai-engineer', 'backend-engineer', 'devops-engineer'). Automatically maps synonyms.",
            examples=["ai-engineer"],
        ),
    ] = "ai-engineer",
    location: Annotated[
        str,
        Query(
            description="Location slug or city (e.g. 'india', 'bengaluru', 'pune', 'remote'). Automatically maps synonyms.",
            examples=["india"],
        ),
    ] = "india",
    page: Annotated[
        int,
        Query(
            ge=1,
            le=20,
            description="Pagination page number. Strictly bounded between 1 and 20 to prevent Cloudflare Turnstile blocks.",
            examples=[1],
        ),
    ] = 1,
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=100,
            description="Maximum job items to return in this request.",
            examples=[30],
        ),
    ] = 30,
    max_age_days: Annotated[
        int | None,
        Query(
            ge=1,
            le=180,
            description="Optional maximum age in days. Postings older than this threshold (via liveStartAt) are filtered out.",
            examples=[14],
        ),
    ] = None,
    include_all_company_jobs: Annotated[
        bool,
        Query(
            description="When true, traverses the entire company graph in Apollo state instead of only highlightedJobListings.",
            examples=[False],
        ),
    ] = False,
    persist: Annotated[
        bool,
        Query(
            description="When true, saves raw unmodified records into the raw_wellfound_jobs table.",
            examples=[True],
        ),
    ] = False,
):
    """
    Fetches Wellfound's unauthenticated Server-Side Rendered (SSR) directory pages (`/role/l/{role}/{location}`)
    and extracts the normalized Apollo Client in-memory state (`__NEXT_DATA__`).

    ### Guardrails
    * **Cloudflare Turnstile Bypass:** Uses TLS ClientHello impersonation (`chrome120`) to fetch clean SSR HTML.
    * **Pagination Ceiling:** Hard-capped at page 20 to prevent anti-scraping threat escalation.
    * **Slug Normalization:** Unrecognized input terms map automatically to canonical slugs.
    """
    try:
        if persist:
            jobs, apollo_state = await wellfound_client.search_jobs(
                role=role,
                location=location,
                page=page,
                limit=limit,
                max_age_days=max_age_days,
                include_all_company_jobs=include_all_company_jobs,
                return_raw=True,
            )
            for j in jobs:
                await save_raw_wellfound_job({
                    "external_id": j.external_id,
                    "job_slug": j.url.split("/")[-1],
                    "title": j.title,
                    "company_name": j.company_name,
                    "company_slug": None,
                    "company_logo_url": j.company_logo_url,
                    "company_website": j.company_website,
                    "location_raw": j.location_raw,
                    "locations_list": [j.location_raw],
                    "is_remote": j.is_remote,
                    "is_international": j.is_international,
                    "salary_raw": j.salary_raw,
                    "native_years_min": j.experience_min_years,
                    "native_years_max": j.experience_max_years,
                    "live_start_at": None,
                    "url": j.url,
                    "description_html": j.description_html,
                    "description_text": j.description_text,
                    "posted_at": j.posted_at,
                    "raw_payload": {"external_id": j.external_id, "title": j.title},
                })
        else:
            jobs = await wellfound_client.search_jobs(
                role=role,
                location=location,
                page=page,
                limit=limit,
                max_age_days=max_age_days,
                include_all_company_jobs=include_all_company_jobs,
            )

        # Check DB status for all jobs returned
        descriptors = [
            {"source": "wellfound", "external_id": j.external_id, "url": j.url}
            for j in jobs
        ]
        found_in_db = await check_jobs_exist_in_db(descriptors)
        for j in jobs:
            j.is_in_db = ("wellfound", j.external_id) in found_in_db
        return jobs
    except Exception as exc:
        logger.error(f"Error executing Wellfound scrape: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "WELLFOUND_SCRAPE_ERROR",
                "detail": str(exc),
                "retry_after": None,
            },
        )

@app.get(
    "/api/scrape/wellfound/company/{company_slug}",
    summary="Scrape All Active Jobs for a Wellfound Company",
    response_model=list[JobItem],
    responses={
        200: {"description": "Successfully extracted all open roles for the specified company slug."},
        500: {"model": ErrorDetail, "description": "Failed to fetch or parse company profile page."},
    },
    tags=["Wellfound"],
)
async def scrape_wellfound_company_jobs(
    company_slug: str,
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=100,
            description="Maximum job items to return for this company.",
            examples=[50],
        ),
    ] = 50,
):
    """
    Directly scrapes all active job listings hosted on a specific company profile page (`/company/{company_slug}`)
    by extracting the company's Apollo state graph.
    """
    try:
        jobs = await wellfound_client.fetch_company_jobs(company_slug=company_slug, limit=limit)
        return jobs
    except Exception as exc:
        logger.error(f"Error fetching company jobs for {company_slug}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "WELLFOUND_COMPANY_ERROR",
                "detail": str(exc),
                "retry_after": None,
            },
        )

@app.get(
    "/api/scrape/linkedin",
    summary="Scrape LinkedIn Guest Postings & Details",
    response_model=list[JobItem],
    responses={
        200: {"description": "Successfully scraped job cards and enriched descriptions from LinkedIn."},
        400: {"model": ErrorDetail, "description": "Invalid query parameters."},
        429: {"model": ErrorDetail, "description": "LinkedIn returned rate limit or authwall redirect."},
        500: {"model": ErrorDetail, "description": "Internal server error occurred while scraping LinkedIn."},
    },
    tags=["LinkedIn"],
)
async def scrape_linkedin(
    keywords: Annotated[
        str,
        Query(
            description="Job keywords, skill tags, or role title (e.g. 'ai engineer', 'backend engineer', 'devops').",
            examples=["software engineer"],
        ),
    ] = "software engineer",
    location: Annotated[
        str,
        Query(
            description="Target location or country (e.g. 'India', 'Bengaluru', 'Pune', 'Delhi').",
            examples=["India"],
        ),
    ] = "India",
    start: Annotated[
        int,
        Query(
            ge=0,
            le=975,
            description="Pagination start offset. Hard-capped at 975 to prevent automated redirects to linkedin.com/authwall.",
            examples=[0],
        ),
    ] = 0,
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=100,
            description="Maximum job items to return in this request.",
            examples=[20],
        ),
    ] = 20,
    time_range: Annotated[
        str | None,
        Query(
            description="Time freshness filter: 'r86400' (past 24 hours), 'r604800' (past week), 'r2592000' (past month).",
            examples=["r604800"],
        ),
    ] = None,
    work_type: Annotated[
        str | None,
        Query(
            description="Workplace setting filter: '1' (On-site), '2' (Remote), '3' (Hybrid).",
            examples=["2"],
        ),
    ] = None,
    seniority: Annotated[
        str | None,
        Query(
            description="Seniority level filter: '1' (Internship), '2' (Entry Level), '3' (Associate), '4' (Mid-Senior), '5' (Director).",
            examples=["4"],
        ),
    ] = None,
    fetch_descriptions: Annotated[
        bool,
        Query(
            description="Whether to fetch full job descriptions from the single job API. Detail calls are cached in-memory for 24 hours.",
            examples=[True],
        ),
    ] = True,
    persist: Annotated[
        bool,
        Query(
            description="When true, saves raw unmodified records into the raw_linkedin_jobs table.",
            examples=[True],
        ),
    ] = False,
):
    """
    Queries LinkedIn's unauthenticated public guest search endpoint (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`)
    using browser TLS fingerprint impersonation (`chrome120`).

    ### Guardrails
    * **Authwall Evasion:** Start offset is clamped to 975 to avoid LinkedIn's 1,000-item pagination barrier.
    * **24-Hour LRU Description Cache:** Avoids repetitive upstream detail queries for identical job IDs.
    * **Concurrency Control:** Detail page requests run through an internal semaphore (`max=5`) with throttling buffers.
    * **Anomaly Detection:** Alerts if upstream returns a large payload with 0 parsed cards.
    """
    try:
        jobs = await linkedin_client.search_jobs(
            keywords=keywords,
            location=location,
            start=start,
            limit=limit,
            time_range=time_range,
            work_type=work_type,
            seniority=seniority,
            fetch_descriptions=fetch_descriptions,
        )
        if persist:
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

        # Check DB status for all jobs returned
        descriptors = [
            {"source": "linkedin", "external_id": j.external_id, "url": j.url}
            for j in jobs
        ]
        found_in_db = await check_jobs_exist_in_db(descriptors)
        for j in jobs:
            j.is_in_db = ("linkedin", j.external_id) in found_in_db
        return jobs
    except Exception as exc:
        logger.error(f"Error executing LinkedIn scrape: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "LINKEDIN_SCRAPE_ERROR",
                "detail": str(exc),
                "retry_after": None,
            },
        )

# ==========================================
# Parsing & Unified Database Endpoints
# ==========================================

@app.get(
    "/api/status/parsing",
    summary="Get Raw vs Parsed Pipeline Status",
    tags=["System"],
)
async def get_parsing_status():
    """Inspect how many scraped records exist in raw tables vs promoted to unified_jobs."""
    return await ParserService.get_parsing_status()

@app.post(
    "/api/parse/indeed",
    summary="Trigger Gemini LLM Parsing for Indeed Raw Jobs",
    tags=["Indeed"],
)
async def parse_indeed(
    batch_size: Annotated[int, Query(ge=1, le=500, description="Max raw jobs to parse in this run")] = 50,
    use_llm: Annotated[bool, Query(description="Whether to use Gemini LLM batch parsing")] = True,
):
    """Starts a background parse of unparsed raw Indeed records into unified_jobs. Returns 409 if a pipeline job is already running."""
    started = ParserService.start_parse("indeed", batch_size=batch_size, use_llm=use_llm)
    if started is None:
        raise HTTPException(status_code=409, detail="PIPELINE_BUSY: a pipeline job is already running — see /api/status/parsing")
    return started

@app.post(
    "/api/parse/linkedin",
    summary="Trigger Gemini LLM Parsing for LinkedIn Raw Jobs",
    tags=["LinkedIn"],
)
async def parse_linkedin(
    batch_size: Annotated[int, Query(ge=1, le=500, description="Max raw jobs to parse in this run")] = 50,
    use_llm: Annotated[bool, Query(description="Whether to use Gemini LLM batch parsing")] = True,
):
    """Starts a background parse of unparsed raw LinkedIn records into unified_jobs. Returns 409 if a pipeline job is already running."""
    started = ParserService.start_parse("linkedin", batch_size=batch_size, use_llm=use_llm)
    if started is None:
        raise HTTPException(status_code=409, detail="PIPELINE_BUSY: a pipeline job is already running — see /api/status/parsing")
    return started

@app.post(
    "/api/parse/wellfound",
    summary="Trigger Gemini LLM Parsing for Wellfound Raw Jobs",
    tags=["Wellfound"],
)
async def parse_wellfound(
    batch_size: Annotated[int, Query(ge=1, le=500, description="Max raw jobs to parse in this run")] = 50,
    use_llm: Annotated[bool, Query(description="Whether to use Gemini LLM batch parsing")] = True,
):
    """Starts a background parse of unparsed raw Wellfound records into unified_jobs. Returns 409 if a pipeline job is already running."""
    started = ParserService.start_parse("wellfound", batch_size=batch_size, use_llm=use_llm)
    if started is None:
        raise HTTPException(status_code=409, detail="PIPELINE_BUSY: a pipeline job is already running — see /api/status/parsing")
    return started

@app.post(
    "/api/parse/reparse-unified",
    summary="Reparse Existing Unified Jobs With Missing Experience or Salary",
    tags=["Pipeline"],
)
async def reparse_unified_jobs_endpoint(
    only_missing_experience: Annotated[bool, Query(description="Only reparse jobs where experience_min_years is null")] = True,
    use_llm: Annotated[bool, Query(description="Whether to use Gemini LLM batch parsing with hybrid fallback")] = True,
    limit: Annotated[int, Query(ge=1, le=500, description="Max jobs to reprocess")] = 100,
):
    """
    Backfills and reparses existing unified_jobs where experience or salary was missed.
    Uses the upgraded regex engine and Gemini LLM. Returns 409 if a pipeline job is already running."""
    result = await ParserService.run_reparse(
        only_missing_experience=only_missing_experience,
        use_llm=use_llm,
        limit=limit,
    )
    if result is None:
        raise HTTPException(status_code=409, detail="PIPELINE_BUSY: a pipeline job is already running — see /api/status/parsing")
    return result


class JobTriageUpdateRequest(BaseModel):
    is_saved: bool | None = None
    is_archived: bool | None = None

class BatchJobTriageUpdateRequest(BaseModel):
    job_ids: list[str]
    is_saved: bool | None = None
    is_archived: bool | None = None

class PreferencesUpdateRequest(BaseModel):
    allow_international: bool | None = None
    max_experience_years: int | None = None
    require_fresher_friendly: bool | None = None
    preferred_title_keywords: list[str] | None = None
    blocked_title_keywords: list[str] | None = None
    preferred_cities: list[str] | None = None
    min_salary_inr_year: int | None = None


def _prefs_to_dict(p: UserPreference) -> dict:
    return {
        "id": p.id,
        "allow_international": p.allow_international,
        "max_experience_years": p.max_experience_years,
        "require_fresher_friendly": p.require_fresher_friendly,
        "preferred_title_keywords": p.preferred_title_keywords or [],
        "blocked_title_keywords": p.blocked_title_keywords or [],
        "preferred_cities": p.preferred_cities or [],
        "min_salary_inr_year": p.min_salary_inr_year,
    }


async def _get_or_create_prefs(session) -> UserPreference:
    prefs = await session.get(UserPreference, "default")
    if prefs is None:
        prefs = UserPreference(**{k: v for k, v in DEFAULT_PREFS.items()})
        session.add(prefs)
        await session.commit()
        await session.refresh(prefs)
    return prefs


@app.get(
    "/api/preferences",
    summary="Get auto-triage taste preferences",
    tags=["System"],
)
async def get_preferences():
    """Return the single-user taste preferences, creating defaults on first call."""
    async with async_session_maker() as session:
        prefs = await _get_or_create_prefs(session)
        return _prefs_to_dict(prefs)


@app.put(
    "/api/preferences",
    summary="Update auto-triage taste preferences",
    tags=["System"],
)
async def update_preferences(payload: PreferencesUpdateRequest):
    """Partially update taste preferences; only non-None fields are applied."""
    async with async_session_maker() as session:
        prefs = await _get_or_create_prefs(session)
        data = payload.model_dump(exclude_none=True)
        for key, value in data.items():
            setattr(prefs, key, value)
        await session.commit()
        await session.refresh(prefs)
        return _prefs_to_dict(prefs)


@app.post(
    "/api/jobs/auto-triage",
    summary="Auto-save/archive active jobs using taste preferences",
    tags=["System"],
)
async def auto_triage_jobs(
    dry_run: Annotated[bool, Query(description="Preview only, no DB writes")] = True,
    limit: Annotated[int, Query(ge=1, le=500, description="Max jobs to evaluate")] = 200,
    force: Annotated[bool, Query(description="Re-classify manually saved/archived jobs too")] = False,
):
    """
    Classify jobs with the strict rules engine. Manual saves/archives are skipped
    unless force=true. Writes is_saved/is_archived unless dry_run=true.
    """
    async with async_session_maker() as session:
        prefs = await _get_or_create_prefs(session)
        prefs_dict = _prefs_to_dict(prefs)

        stmt = select(UnifiedJob).order_by(UnifiedJob.parsed_at.desc()).limit(limit)
        if not force:
            stmt = stmt.where(
                UnifiedJob.is_saved == False,  # noqa: E712
                UnifiedJob.is_archived == False,  # noqa: E712
            )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        saved_ids: list = []
        archived_ids: list = []
        details: list[dict] = []
        skipped_manual = 0

        for j in jobs:
            if not force and (j.is_saved or j.is_archived):
                skipped_manual += 1
                continue
            action, reason = AutoTriageService.classify(
                {
                    "title": j.title,
                    "is_international": j.is_international,
                    "experience_min_years": j.experience_min_years,
                    "is_fresher_friendly": j.is_fresher_friendly,
                    "city": j.city,
                    "salary_min_inr_year": j.salary_min_inr_year,
                },
                prefs_dict,
            )
            details.append({"id": str(j.id), "action": action, "reason": reason})
            if action == "save":
                saved_ids.append(j.id)
            elif action == "archive":
                archived_ids.append(j.id)

        if not dry_run:
            if saved_ids:
                await session.execute(
                    update(UnifiedJob)
                    .where(UnifiedJob.id.in_(saved_ids))
                    .values(is_saved=True, is_archived=False)
                )
            if archived_ids:
                await session.execute(
                    update(UnifiedJob)
                    .where(UnifiedJob.id.in_(archived_ids))
                    .values(is_archived=True, is_saved=False)
                )
            await session.commit()

        left_active = sum(1 for d in details if d["action"] == "none")
        return {
            "dry_run": dry_run,
            "evaluated": len(details),
            "saved": len(saved_ids),
            "archived": len(archived_ids),
            "left_active": left_active,
            "skipped_manual": skipped_manual,
            "details": details,
        }

@app.get(
    "/api/jobs/unified",
    summary="Query Standardized Clean Jobs from Central Database",
    tags=["System"],
)
async def get_unified_jobs(
    source: Annotated[str | None, Query(description="Filter by source: 'indeed', 'linkedin', 'wellfound'")] = None,
    city: Annotated[str | None, Query(description="Filter by lowercase city slug")] = None,
    is_fresher_friendly: Annotated[bool | None, Query(description="Filter strictly for freshers (min_years <= 1)")] = None,
    experience_level: Annotated[str | None, Query(description="Filter by experience level: 'all', 'fresher', 'experienced' (unspecified included in both)")] = None,
    easy_apply_available: Annotated[bool | None, Query(description="Filter for direct Indeed/easy apply jobs")] = None,
    min_salary_inr: Annotated[int | None, Query(description="Minimum annual salary in INR")] = None,
    is_saved: Annotated[bool | None, Query(description="Filter by saved triage status")] = None,
    is_archived: Annotated[bool | None, Query(description="Filter by archived triage status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """
    Query only clean, successfully parsed job profiles from unified_jobs with structured filters.
    """
    async with async_session_maker() as session:
        conditions = []
        if source:
            conditions.append(UnifiedJob.source == source)
        if city:
            conditions.append(UnifiedJob.city == city.lower())
        if experience_level:
            exp_lvl = experience_level.strip().lower()
            if exp_lvl == "fresher":
                # Purely fresher: must NOT require experience (> 0 years).
                # Only 0 years, explicit fresher tags, or unspecified.
                conditions.append(
                    and_(
                        or_(
                            UnifiedJob.experience_min_years == 0,
                            UnifiedJob.is_fresher_friendly == True,
                            UnifiedJob.experience_min_years.is_(None),
                        ),
                        or_(
                            UnifiedJob.experience_min_years.is_(None),
                            UnifiedJob.experience_min_years == 0,
                        ),
                    )
                )
            elif exp_lvl == "experienced":
                # Experienced: requires experience (> 0 years) OR unspecified
                conditions.append(
                    or_(
                        UnifiedJob.experience_min_years > 0,
                        UnifiedJob.experience_min_years.is_(None),
                    )
                )
        elif is_fresher_friendly is not None:
            conditions.append(UnifiedJob.is_fresher_friendly == is_fresher_friendly)
        if easy_apply_available is not None:
            conditions.append(UnifiedJob.easy_apply_available == easy_apply_available)
        if min_salary_inr is not None:
            conditions.append(UnifiedJob.salary_min_inr_year >= min_salary_inr)
        if is_saved is not None:
            conditions.append(UnifiedJob.is_saved == is_saved)
        if is_archived is not None:
            conditions.append(UnifiedJob.is_archived == is_archived)

        stmt = select(UnifiedJob)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(UnifiedJob.parsed_at.desc()).offset(offset).limit(limit)

        res = await session.execute(stmt)
        jobs = res.scalars().all()

        return [
            {
                "id": str(j.id),
                "source": j.source,
                "external_id": j.external_id,
                "raw_ref_id": str(j.raw_ref_id) if j.raw_ref_id else None,
                "url": j.url,
                "title": j.title,
                "company_name": j.company_name,
                "company_logo_url": j.company_logo_url,
                "location_raw": j.location_raw,
                "city": j.city,
                "is_remote": j.is_remote,
                "is_international": j.is_international,
                "easy_apply_available": j.easy_apply_available,
                "salary_min_inr_year": j.salary_min_inr_year,
                "salary_max_inr_year": j.salary_max_inr_year,
                "salary_raw": j.salary_raw,
                "salary_currency_raw": j.salary_currency_raw,
                "experience_min_years": j.experience_min_years,
                "experience_max_years": j.experience_max_years,
                "is_fresher_friendly": j.is_fresher_friendly,
                "is_saved": j.is_saved,
                "is_archived": j.is_archived,
                "description_text": j.description_text,
                "posted_at": j.posted_at,
                "parsed_at": j.parsed_at,
            }
            for j in jobs
        ]

@app.patch(
    "/api/jobs/unified/triage",
    summary="Batch update saved or archived triage state for multiple unified jobs",
    tags=["System"],
)
async def batch_update_unified_jobs_triage(
    payload: BatchJobTriageUpdateRequest,
):
    """
    Batch update is_saved and is_archived columns in unified_jobs.
    """
    if not payload.job_ids:
        return {"updated_count": 0}

    import uuid
    parsed_uuids = []
    for jid in payload.job_ids:
        try:
            parsed_uuids.append(uuid.UUID(jid))
        except ValueError:
            continue

    if not parsed_uuids:
        return {"updated_count": 0}

    values_to_update = {}
    if payload.is_saved is not None:
        values_to_update["is_saved"] = payload.is_saved
        if payload.is_saved:
            values_to_update["is_archived"] = False
    if payload.is_archived is not None:
        values_to_update["is_archived"] = payload.is_archived
        if payload.is_archived:
            values_to_update["is_saved"] = False

    if not values_to_update:
        return {"updated_count": 0, "message": "No changes requested"}

    async with async_session_maker() as session:
        stmt = (
            update(UnifiedJob)
            .where(UnifiedJob.id.in_(parsed_uuids))
            .values(**values_to_update)
        )
        res = await session.execute(stmt)
        await session.commit()
        return {"updated_count": res.rowcount}

@app.patch(
    "/api/jobs/unified/{job_id}/triage",
    summary="Update saved or archived triage state for a single unified job",
    tags=["System"],
)
async def update_unified_job_triage(
    job_id: str,
    payload: JobTriageUpdateRequest,
):
    """
    Update is_saved and is_archived columns in unified_jobs for a specific job.
    """
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job UUID")

    values_to_update = {}
    if payload.is_saved is not None:
        values_to_update["is_saved"] = payload.is_saved
        if payload.is_saved:
            values_to_update["is_archived"] = False
    if payload.is_archived is not None:
        values_to_update["is_archived"] = payload.is_archived
        if payload.is_archived:
            values_to_update["is_saved"] = False

    if not values_to_update:
        return {"updated": False, "message": "No changes requested"}

    async with async_session_maker() as session:
        stmt = (
            update(UnifiedJob)
            .where(UnifiedJob.id == jid)
            .values(**values_to_update)
            .returning(UnifiedJob.id, UnifiedJob.is_saved, UnifiedJob.is_archived)
        )
        res = await session.execute(stmt)
        row = res.first()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        await session.commit()
        return {
            "updated": True,
            "id": str(row[0]),
            "is_saved": row[1],
            "is_archived": row[2],
        }

@app.delete(
    "/api/jobs/unified",
    summary="Delete jobs permanently from unified_jobs",
    tags=["System"],
)
async def delete_unified_jobs(
    job_ids: list[str] = Body(..., embed=True, description="List of UnifiedJob UUID strings to delete")
):
    """
    Permanently delete rows from unified_jobs by their IDs.
    """
    if not job_ids:
        return {"deleted_count": 0}

    import uuid
    parsed_uuids = []
    for jid in job_ids:
        try:
            parsed_uuids.append(uuid.UUID(jid))
        except ValueError:
            continue

    if not parsed_uuids:
        return {"deleted_count": 0}

    async with async_session_maker() as session:
        stmt = delete(UnifiedJob).where(UnifiedJob.id.in_(parsed_uuids))
        res = await session.execute(stmt)
        await session.commit()
        return {"deleted_count": res.rowcount}

@app.post(
    "/api/db/clear-bronze",
    summary="Clear the entire bronze layer (all raw staging tables)",
    tags=["System"],
)
async def clear_bronze():
    """
    Deletes every row from the three raw staging tables
    (raw_indeed_jobs, raw_linkedin_jobs, raw_wellfound_jobs).
    Unified jobs (silver layer) are left untouched.
    """
    async with async_session_maker() as session:
        res_indeed = await session.execute(delete(RawIndeedJob))
        res_linkedin = await session.execute(delete(RawLinkedInJob))
        res_wellfound = await session.execute(delete(RawWellfoundJob))
        await session.commit()

    return {
        "status": "success",
        "deleted": {
            "raw_indeed_jobs": res_indeed.rowcount,
            "raw_linkedin_jobs": res_linkedin.rowcount,
            "raw_wellfound_jobs": res_wellfound.rowcount,
        },
        "total_deleted": (
            res_indeed.rowcount + res_linkedin.rowcount + res_wellfound.rowcount
        ),
    }

@app.post(
    "/api/db/reset",
    summary="Reset and wipe the database entirely from scratch",
    tags=["System"],
)
async def reset_database():
    """
    Completely truncate all raw staging tables and unified_jobs.
    """
    async with async_session_maker() as session:
        await session.execute(delete(UnifiedJob))
        await session.execute(delete(RawIndeedJob))
        await session.execute(delete(RawLinkedInJob))
        await session.execute(delete(RawWellfoundJob))
        await session.commit()
        return {"status": "success", "message": "All raw and unified job tables have been reset to 0."}

@app.post(
    "/api/db/clear-test-data",
    summary="Delete all test-seeded rows from every table",
    tags=["System"],
)
async def clear_test_data():
    """
    Deletes test-seeded rows from all raw staging tables and unified_jobs,
    plus known test CronJob names. Test rows are identified by synthetic
    external_id prefixes ('test_', 'wf_', 'li_') — live scrapers always
    produce bare numeric/hex IDs, so prefixed IDs only ever come from
    tester UIs and pytest seeds. Safe to run at any time.
    """
    test_id_pattern = "^(test_|wf_|li_)"
    async with async_session_maker() as session:
        res_indeed = await session.execute(
            text("DELETE FROM raw_indeed_jobs WHERE external_id ~ :pat").bindparams(pat=test_id_pattern)
        )
        res_linkedin = await session.execute(
            text("DELETE FROM raw_linkedin_jobs WHERE external_id ~ :pat").bindparams(pat=test_id_pattern)
        )
        res_wellfound = await session.execute(
            text("DELETE FROM raw_wellfound_jobs WHERE external_id ~ :pat").bindparams(pat=test_id_pattern)
        )
        res_unified = await session.execute(
            text("DELETE FROM unified_jobs WHERE external_id ~ :pat").bindparams(pat=test_id_pattern)
        )
        res_cron = await session.execute(
            text(
                """
                DELETE FROM cron_jobs
                WHERE name IN (
                    'Indeed Engineer Daily',
                    'Failing Job',
                    'All Providers Job',
                    'Test Daily Indeed',
                    'Due Job',
                    'Wrong Minute Job',
                    'Disabled Job',
                    'Already Run Job',
                    'Daily Indeed AI Engineer',
                    'Bad Provider',
                    'Bad Hour',
                    'Bad Minute',
                    'Initial Job',
                    'Updated Job Name',
                    'Toggle Test Job',
                    'To Delete Job',
                    'Immediate Run Job',
                    'Indeed Weekdays 6 AM',
                    'Indeed Auto-Parse Job',
                    'Omni Scrape Daily'
                )
                OR name LIKE 'test_%'
                OR name LIKE 'Test %'
                """
            )
        )
        await session.commit()

    return {
        "status": "success",
        "deleted": {
            "raw_indeed_jobs": res_indeed.rowcount,
            "raw_linkedin_jobs": res_linkedin.rowcount,
            "raw_wellfound_jobs": res_wellfound.rowcount,
            "unified_jobs": res_unified.rowcount,
            "cron_jobs": res_cron.rowcount,
        },
        "total_deleted": (
            res_indeed.rowcount
            + res_linkedin.rowcount
            + res_wellfound.rowcount
            + res_unified.rowcount
            + res_cron.rowcount
        ),
    }

