import logging
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.clients.indeed import IndeedClient
from src.models.job import JobItem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("iwantajob")

app = FastAPI(
    title="Job Discovery & Scraping API",
    description="Minimal backend scraper API starting with Indeed Mobile GraphQL",
    version="0.1.0",
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

@app.get("/")
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    return FileResponse(index_path)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

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
