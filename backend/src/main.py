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

app = FastAPI(
    title="Autonomous Job Discovery API",
    description="Production-ready backend ingestion API for job platforms supporting Indeed Mobile GraphQL, Wellfound Apollo SSR, and LinkedIn Guest API.",
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
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

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint for container orchestrators and load balancers."""
    return {"status": "ok", "version": "1.0.0"}

@app.get("/api/wellfound/roles", tags=["Wellfound"])
async def get_wellfound_supported_slugs():
    """
    Return all canonical and tested Wellfound roles and locations supported by the scraper.
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
    response_model=JobSearchResponse,
    responses={
        200: {"description": "Successfully scraped job results"},
        400: {"model": ErrorDetail, "description": "Invalid query parameters"},
        429: {"model": ErrorDetail, "description": "Upstream rate limit reached on Indeed"},
        502: {"model": ErrorDetail, "description": "Upstream Indeed API key or signature rejected"},
        500: {"model": ErrorDetail, "description": "Internal server error"},
    },
    tags=["Indeed"],
)
async def scrape_indeed(
    what: Annotated[str, Query(description="Job title, role, or keywords (e.g. 'ai engineer', 'title:\"sdet\"')")] = "ai engineer",
    where: Annotated[str, Query(description="Target location or city (e.g. 'Bangalore, Karnataka', 'Pune')")] = "India",
    limit: Annotated[int, Query(ge=1, le=100, description="Max jobs to fetch per batch (bounded 1 to 100)")] = 20,
    sort: Annotated[str, Query(description="Sort order: 'relevance' (Indeed App default) or 'date' (newest first)")] = "relevance",
    radius: Annotated[int, Query(ge=0, le=200, description="Search radius distance")] = 25,
    radius_unit: Annotated[str, Query(description="Radius unit: 'KILOMETERS' or 'MILES'")] = "KILOMETERS",
    cursor: Annotated[str | None, Query(description="Pagination cursor token for next page of results")] = None,
):
    """
    Query Indeed Mobile GraphQL gateway with concurrency guardrails, rate-limit backoff, and pagination.
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

@app.get("/api/scrape/wellfound", response_model=list[JobItem], tags=["Wellfound"])
async def scrape_wellfound(
    role: Annotated[str, Query(description="Role slug or title, e.g. ai-engineer, backend-engineer")] = "ai-engineer",
    location: Annotated[str, Query(description="Location slug or city, e.g. india, bengaluru, pune, remote")] = "india",
    page: Annotated[int, Query(ge=1, le=20, description="Pagination page (bounded to 1-20)")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Max jobs to return")] = 30,
    max_age_days: Annotated[int | None, Query(ge=1, le=180, description="Optional maximum age in days")] = None,
    include_all_company_jobs: Annotated[bool, Query(description="Include all open jobs for discovered companies instead of only highlighted")] = False,
):
    """
    Query Wellfound SSR Apollo data extraction pipeline with slug guardrails and pagination ceilings.
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

@app.get("/api/scrape/wellfound/company/{company_slug}", response_model=list[JobItem], tags=["Wellfound"])
async def scrape_wellfound_company_jobs(
    company_slug: str,
    limit: Annotated[int, Query(ge=1, le=100, description="Max jobs to return")] = 50,
):
    """
    Fetch all active job postings for a specific company slug on Wellfound.
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

@app.get("/api/scrape/linkedin", response_model=list[JobItem], tags=["LinkedIn"])
async def scrape_linkedin(
    keywords: Annotated[str, Query(description="Job keywords or profile title")] = "software engineer",
    location: Annotated[str, Query(description="Location or country")] = "India",
    start: Annotated[int, Query(ge=0, le=975, description="Pagination start offset (bounded under 1000)")] = 0,
    limit: Annotated[int, Query(ge=1, le=100, description="Max jobs to return")] = 20,
    time_range: Annotated[str | None, Query(description="Time filter: r86400 (past 24h), r604800 (past week), r2592000 (past month)")] = None,
    work_type: Annotated[str | None, Query(description="Workplace type: 1 (on-site), 2 (remote), 3 (hybrid)")] = None,
    seniority: Annotated[str | None, Query(description="Seniority level: 1 (intern), 2 (entry), 3 (associate), 4 (mid-senior), 5 (director)")] = None,
    fetch_descriptions: Annotated[bool, Query(description="Whether to fetch full job descriptions from single job API")] = True,
):
    """
    Query LinkedIn Guest API (seeMoreJobPostings) and return standardized job listings.
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
