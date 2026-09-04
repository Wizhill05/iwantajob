import logging
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.clients.indeed import IndeedClient
from src.clients.wellfound import WellfoundClient
from src.clients.wellfound_slugs import (
    SUPPORTED_WELLFOUND_ROLES,
    SUPPORTED_WELLFOUND_LOCATIONS,
)
from src.models.job import JobItem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("iwantajob")

app = FastAPI(
    title="Job Discovery & Scraping API",
    description="Autonomous job scraper API supporting Indeed Mobile GraphQL and Wellfound Apollo SSR",
    version="0.2.0",
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

@app.get("/")
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    return FileResponse(index_path)

@app.get("/wellfound")
async def serve_wellfound():
    page_path = STATIC_DIR / "wellfound.html"
    return FileResponse(page_path)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/wellfound/roles")
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

@app.get("/api/scrape/indeed", response_model=list[JobItem])
async def scrape_indeed(
    what: Annotated[str, Query(description="Job keyword or role")] = "ai engineer",
    where: Annotated[str, Query(description="Location or city")] = "India",
    limit: Annotated[int, Query(ge=1, le=100, description="Max jobs to fetch")] = 20,
    sort: Annotated[str, Query(description="Sort order: relevance or date")] = "relevance",
    radius: Annotated[int, Query(ge=0, le=200, description="Radius distance")] = 25,
    radius_unit: Annotated[str, Query(description="Unit: KILOMETERS or MILES")] = "KILOMETERS",
):
    """
    Query Indeed Mobile GraphQL gateway and return standardized job listings.
    """
    try:
        jobs = await indeed_client.search_jobs(
            what=what,
            where=where,
            limit=limit,
            sort=sort,
            radius=radius,
            radius_unit=radius_unit,
        )
        return jobs
    except Exception as exc:
        logger.error(f"Error executing Indeed search: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/scrape/wellfound", response_model=list[JobItem])
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
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/scrape/wellfound/company/{company_slug}", response_model=list[JobItem])
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
        raise HTTPException(status_code=500, detail=str(exc))
