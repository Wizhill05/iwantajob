import logging
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

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

app = FastAPI(
    title="Autonomous Job Discovery API",
    description=APP_DESCRIPTION,
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=TAGS_METADATA,
)

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
        items, next_cursor = await indeed_client.search_jobs(
            what=clean_what,
            where=clean_where,
            limit=limit,
            sort=sort,
            radius=radius,
            radius_unit=radius_unit,
            cursor=cursor,
        )
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
        jobs = await wellfound_client.search_jobs(
            role=role,
            location=location,
            page=page,
            limit=limit,
            max_age_days=max_age_days,
            include_all_company_jobs=include_all_company_jobs,
        )
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
