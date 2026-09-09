"""
MCP server exposing every iwantajob backend API endpoint as an MCP tool.

Runs over stdio so any MCP client (Claude Code, Claude Desktop, other agents)
can launch it directly. Each tool maps 1:1 to a backend REST endpoint and
returns the endpoint's raw JSON response (pretty-printed) so agents see exactly
what the API returns.

Launch:
    cd backend && uv run python -m src.mcp_server

Configuration (environment variables):
    JOB_API_BASE_URL   Base URL of the FastAPI backend (default: http://localhost:8020)
"""

import os
import sys
import json
import logging

import httpx
from mcp.server.mcpserver import MCPServer

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("iwantajob-mcp")

BASE_URL = os.getenv("JOB_API_BASE_URL", "http://localhost:8020").rstrip("/")

mcp = MCPServer(
    name="iwantajob",
    instructions=(
        "Tools for the iwantajob job discovery platform. Every tool maps to a backend REST endpoint "
        f"at {BASE_URL}. Typical agent workflows:\n"
        "- Scrape: scrape_indeed / scrape_linkedin / scrape_wellfound (or scrape_all_providers), "
        "with persist=true to stage raw results in bronze.\n"
        "- Parse: parse_indeed_jobs / parse_linkedin_jobs / parse_wellfound_jobs to promote bronze rows "
        "into the clean unified_jobs table; get_parsing_status to watch progress.\n"
        "- Search & organize: search_unified_jobs, then save_jobs / archive_jobs (and unsave_jobs / "
        "unarchive_jobs to undo), run_auto_triage for preference-driven sorting.\n"
        "clear_bronze_layer / clear_test_data / reset_database are destructive — confirm with the user first."
    ),
)

# Shared async HTTP client. FastMCP runs tools on the same event loop, so a
# module-level AsyncHttpClient is safe to reuse across tool calls.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=BASE_URL, timeout=300.0)
    return _client


async def _request(method: str, path: str, **kwargs) -> str:
    """Call the backend and return the response body as formatted JSON text.

    Non-2xx responses are returned as text too (the backend encodes errors as
    JSON bodies); raising would waste the status detail the agent needs.
    """
    client = _get_client()
    try:
        resp = await client.request(method, path, **kwargs)
        body = resp.json()
    except httpx.HTTPError as exc:
        return json.dumps({"mcp_error": f"backend unreachable at {BASE_URL}: {exc}"})
    except ValueError:
        return json.dumps({"mcp_error": f"non-JSON response (HTTP {resp.status_code})", "text": resp.text[:2000]})
    return json.dumps({"status_code": resp.status_code, "body": body}, indent=2, default=str)


# ==========================================
# System
# ==========================================

@mcp.tool()
async def health_check() -> str:
    """Check backend health and readiness. Returns {"status": "ok", ...} when the scraping API is up."""
    return await _request("GET", "/health")


# ==========================================
# Scraping (live, direct scraper queries)
# ==========================================

@mcp.tool()
async def scrape_indeed(
    what: str = "ai engineer",
    where: str = "India",
    limit: int = 20,
    sort: str = "relevance",
    radius: int = 25,
    radius_unit: str = "KILOMETERS",
    cursor: str | None = None,
    persist: bool = False,
) -> str:
    """Scrape jobs live from Indeed's Mobile GraphQL Gateway.

    Args:
        what: Job title/keywords (supports operators like 'title:"sdet"').
        where: Target location (e.g. 'Bangalore, Karnataka', 'India').
        limit: Max jobs per batch (1-100).
        sort: 'relevance' or 'date'.
        radius: Search radius in radius_unit (0-200).
        radius_unit: 'KILOMETERS' or 'MILES'.
        cursor: Pagination cursor from a previous response's next_cursor.
        persist: When true, also save raw records into raw_indeed_jobs (bronze).
    """
    return await _request("GET", "/api/scrape/indeed", params={
        "what": what, "where": where, "limit": limit, "sort": sort,
        "radius": radius, "radius_unit": radius_unit, "cursor": cursor, "persist": persist,
    })


@mcp.tool()
async def scrape_linkedin(
    keywords: str = "software engineer",
    location: str = "India",
    start: int = 0,
    limit: int = 20,
    time_range: str | None = None,
    work_type: str | None = None,
    seniority: str | None = None,
    fetch_descriptions: bool = True,
    persist: bool = False,
) -> str:
    """Scrape jobs live from LinkedIn's guest endpoints.

    Args:
        keywords: Role title or skill keywords.
        location: Target location or country.
        start: Pagination offset (max 975).
        limit: Max jobs to return (1-100).
        time_range: Freshness filter: 'r86400' (24h), 'r604800' (week), 'r2592000' (month).
        work_type: '1' on-site, '2' remote, '3' hybrid.
        seniority: '1' internship, '2' entry, '3' associate, '4' mid-senior, '5' director.
        fetch_descriptions: Fetch full descriptions (cached 24h server-side).
        persist: When true, also save raw records into raw_linkedin_jobs (bronze).
    """
    return await _request("GET", "/api/scrape/linkedin", params={
        "keywords": keywords, "location": location, "start": start, "limit": limit,
        "time_range": time_range, "work_type": work_type, "seniority": seniority,
        "fetch_descriptions": fetch_descriptions, "persist": persist,
    })


@mcp.tool()
async def scrape_wellfound(
    role: str = "ai-engineer",
    location: str = "india",
    page: int = 1,
    limit: int = 30,
    max_age_days: int | None = None,
    include_all_company_jobs: bool = False,
    persist: bool = False,
) -> str:
    """Scrape startup jobs live from Wellfound's SSR Apollo state.

    Args:
        role: Role slug or title (e.g. 'ai-engineer', 'backend-engineer'); synonyms auto-map.
        location: Location slug or city (e.g. 'india', 'bengaluru', 'remote').
        page: Page number (1-20).
        limit: Max jobs to return (1-100).
        max_age_days: Drop postings older than this (1-180).
        include_all_company_jobs: Traverse the full company graph, not just highlighted listings.
        persist: When true, also save raw records into raw_wellfound_jobs (bronze).
    """
    return await _request("GET", "/api/scrape/wellfound", params={
        "role": role, "location": location, "page": page, "limit": limit,
        "max_age_days": max_age_days, "include_all_company_jobs": include_all_company_jobs,
        "persist": persist,
    })


@mcp.tool()
async def scrape_wellfound_company(company_slug: str, limit: int = 50) -> str:
    """Scrape all active job listings for one Wellfound company profile.

    Args:
        company_slug: Wellfound company handle (the /company/{slug} part of its URL).
        limit: Max jobs to return (1-100).
    """
    return await _request("GET", f"/api/scrape/wellfound/company/{company_slug}", params={"limit": limit})


@mcp.tool()
async def scrape_all_providers(
    keywords: str = "ai engineer",
    location: str = "India",
    limit: int = 20,
    persist: bool = True,
) -> str:
    """Scrape Indeed, LinkedIn, and Wellfound together for the same keywords/location.

    Convenience wrapper running all three scrape endpoints sequentially and
    returning each provider's result. Set persist=true to stage everything in
    the bronze raw tables for later parsing.
    """
    results = {}
    results["indeed"] = json.loads(await scrape_indeed(what=keywords, where=location, limit=limit, persist=persist))
    results["linkedin"] = json.loads(await scrape_linkedin(keywords=keywords, location=location, limit=limit, persist=persist))
    results["wellfound"] = json.loads(await scrape_wellfound(role=keywords, location=location.lower(), persist=persist))
    return json.dumps(results, indent=2, default=str)


@mcp.tool()
async def list_wellfound_slugs() -> str:
    """List canonical Wellfound role and location slugs accepted by the Wellfound scraper."""
    return await _request("GET", "/api/wellfound/roles")


# ==========================================
# Parsing pipeline (bronze -> silver)
# ==========================================

@mcp.tool()
async def get_parsing_status() -> str:
    """Show raw-vs-parsed counts per provider and the unified_jobs total (pipeline health)."""
    return await _request("GET", "/api/status/parsing")


async def _trigger_parse(provider: str, batch_size: int, use_llm: bool) -> str:
    return await _request(
        "POST", f"/api/parse/{provider}",
        params={"batch_size": batch_size, "use_llm": use_llm},
    )


@mcp.tool()
async def parse_indeed_jobs(batch_size: int = 50, use_llm: bool = True) -> str:
    """Promote unparsed raw Indeed rows into unified_jobs (background task).

    Args:
        batch_size: Max raw jobs to parse this run (1-500).
        use_llm: Use Gemini LLM fallback when regex can't extract salary/experience.
    Returns 409 if another pipeline operation is running or queued.
    """
    return await _trigger_parse("indeed", batch_size, use_llm)


@mcp.tool()
async def parse_linkedin_jobs(batch_size: int = 50, use_llm: bool = True) -> str:
    """Promote unparsed raw LinkedIn rows into unified_jobs (background task).

    Args:
        batch_size: Max raw jobs to parse this run (1-500).
        use_llm: Use Gemini LLM fallback when regex can't extract salary/experience.
    Returns 409 if another pipeline operation is running or queued.
    """
    return await _trigger_parse("linkedin", batch_size, use_llm)


@mcp.tool()
async def parse_wellfound_jobs(batch_size: int = 50, use_llm: bool = True) -> str:
    """Promote unparsed raw Wellfound rows into unified_jobs (background task).

    Args:
        batch_size: Max raw jobs to parse this run (1-500).
        use_llm: Use Gemini LLM fallback when regex can't extract salary/experience.
    Returns 409 if another pipeline operation is running or queued.
    """
    return await _trigger_parse("wellfound", batch_size, use_llm)


@mcp.tool()
async def reparse_unified_jobs(
    only_missing_experience: bool = True,
    use_llm: bool = True,
    limit: int = 100,
) -> str:
    """Backfill/reparse existing unified jobs that are missing experience or salary data.

    Args:
        only_missing_experience: Only reprocess jobs where experience_min_years is null.
        use_llm: Use the Gemini LLM hybrid fallback.
        limit: Max jobs to reprocess (1-500).
    Returns 409 if another pipeline operation is running or queued.
    """
    return await _request("POST", "/api/parse/reparse-unified", params={
        "only_missing_experience": only_missing_experience, "use_llm": use_llm, "limit": limit,
    })


# ==========================================
# Unified jobs (silver layer) query & triage
# ==========================================

@mcp.tool()
async def search_unified_jobs(
    source: str | None = None,
    city: str | None = None,
    is_fresher_friendly: bool | None = None,
    experience_level: str | None = None,
    easy_apply_available: bool | None = None,
    min_salary_inr: int | None = None,
    is_saved: bool | None = None,
    is_archived: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """Query clean, parsed jobs from the unified database with structured filters.

    Args:
        source: 'indeed', 'linkedin', or 'wellfound'.
        city: Lowercase city slug (e.g. 'bengaluru', 'pune', 'delhi-ncr').
        is_fresher_friendly: Strict fresher flag filter (min_years <= 1).
        experience_level: 'fresher' (min_years <= 1 or unspecified) or 'experienced' (min_years > 1 or unspecified).
        easy_apply_available: Only direct/easy-apply roles.
        min_salary_inr: Minimum annual salary in INR (e.g. 1200000 = 12 LPA).
        is_saved: Filter by saved status (true = saved jobs only, false = not saved).
        is_archived: Filter by archived status (true = archived jobs only, false = active jobs).
        limit: Page size (1-200, default 50).
        offset: Pagination offset.
    """
    params = {"limit": limit, "offset": offset}
    for key, val in [
        ("source", source), ("city", city), ("is_fresher_friendly", is_fresher_friendly),
        ("experience_level", experience_level), ("easy_apply_available", easy_apply_available),
        ("min_salary_inr", min_salary_inr), ("is_saved", is_saved), ("is_archived", is_archived),
    ]:
        if val is not None:
            params[key] = val
    return await _request("GET", "/api/jobs/unified", params=params)


async def _batch_triage(job_ids: list[str], is_saved: bool | None, is_archived: bool | None) -> str:
    payload: dict = {"job_ids": job_ids}
    if is_saved is not None:
        payload["is_saved"] = is_saved
    if is_archived is not None:
        payload["is_archived"] = is_archived
    return await _request("PATCH", "/api/jobs/unified/triage", json=payload)


@mcp.tool()
async def save_jobs(job_ids: list[str]) -> str:
    """Mark one or more unified jobs as saved (bookmarked). job_ids are UUID strings from search_unified_jobs."""
    return await _batch_triage(job_ids, is_saved=True, is_archived=None)


@mcp.tool()
async def unsave_jobs(job_ids: list[str]) -> str:
    """Remove the saved flag from one or more unified jobs (undo a save)."""
    return await _batch_triage(job_ids, is_saved=False, is_archived=None)


@mcp.tool()
async def archive_jobs(job_ids: list[str]) -> str:
    """Archive (hide from active) one or more unified jobs. job_ids are UUID strings from search_unified_jobs."""
    return await _batch_triage(job_ids, is_saved=None, is_archived=True)


@mcp.tool()
async def unarchive_jobs(job_ids: list[str]) -> str:
    """Restore one or more archived unified jobs back to active."""
    return await _batch_triage(job_ids, is_saved=None, is_archived=False)


@mcp.tool()
async def update_job_triage(job_id: str, is_saved: bool | None = None, is_archived: bool | None = None) -> str:
    """Update saved/archived state of a single unified job with full control.

    Args:
        job_id: UnifiedJob UUID string.
        is_saved: Set saved flag. Saving automatically unarchives.
        is_archived: Set archived flag. Archiving automatically unsaves.
    """
    payload = {}
    if is_saved is not None:
        payload["is_saved"] = is_saved
    if is_archived is not None:
        payload["is_archived"] = is_archived
    if not payload:
        return json.dumps({"error": "Provide is_saved and/or is_archived"})
    return await _request("PATCH", f"/api/jobs/unified/{job_id}/triage", json=payload)


@mcp.tool()
async def batch_update_job_triage(
    job_ids: list[str],
    is_saved: bool | None = None,
    is_archived: bool | None = None,
) -> str:
    """Batch update saved/archived flags on many unified jobs at once (mixed states allowed).

    Args:
        job_ids: List of UnifiedJob UUID strings.
        is_saved: Set saved flag on all listed jobs (saving unarchives).
        is_archived: Set archived flag on all listed jobs (archiving unsaves).
    """
    return await _batch_triage(job_ids, is_saved, is_archived)


@mcp.tool()
async def delete_jobs(job_ids: list[str]) -> str:
    """Permanently delete unified jobs by UUIDs, cascading to their raw bronze rows."""
    return await _request("DELETE", "/api/jobs/unified", json={"job_ids": job_ids})


@mcp.tool()
async def run_auto_triage(dry_run: bool = True, limit: int = 200, force: bool = False) -> str:
    """Classify active jobs as saved/archived using your taste preferences.

    Args:
        dry_run: Preview classifications without writing (default true).
        limit: Max jobs to evaluate (1-500).
        force: Re-classify jobs you manually saved/archived too.
    """
    return await _request("POST", "/api/jobs/auto-triage", params={
        "dry_run": dry_run, "limit": limit, "force": force,
    })


# ==========================================
# Database maintenance (destructive — confirm with user first)
# ==========================================

@mcp.tool()
async def clear_bronze_layer() -> str:
    """Delete raw bronze rows that were never promoted to unified_jobs. Silver jobs keep their lineage."""
    return await _request("POST", "/api/db/clear-bronze")


@mcp.tool()
async def reset_database() -> str:
    """DESTRUCTIVE: wipe ALL raw and unified job tables to zero. Ask the user to confirm before calling."""
    return await _request("POST", "/api/db/reset")


@mcp.tool()
async def clear_test_data() -> str:
    """Delete all test-seeded rows (synthetic 'test_'/'wf_'/'li_' IDs) from every table. Safe to run anytime."""
    return await _request("POST", "/api/db/clear-test-data")


def main() -> None:
    logger.info("Starting iwantajob MCP server -> backend at %s", BASE_URL)
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
