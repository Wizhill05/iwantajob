import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.clients.indeed import IndeedClient
from src.clients.linkedin import LinkedInClient
from src.clients.wellfound import WellfoundClient
from src.core.database import async_session_maker
from src.models.db_entities import CronJob, CronRun
from src.services.parser_service import ParserService

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None
_scheduler_running: bool = False

# Runs stuck in 'running' for longer than this are considered aborted
# (e.g. the backend was restarted mid-run) and closed out when queried.
STALE_RUN_CUTOFF_HOURS = 6


async def start_cron_run(
    cron_job_id: UUID | None,
    job_name: str,
    provider: str,
    trigger: str = "manual",
) -> UUID | None:
    """Records the start of a cron run in its own session so it is visible
    to pollers immediately. Returns the run id, or None if recording failed."""
    try:
        async with async_session_maker() as session:
            run = CronRun(
                cron_job_id=cron_job_id,
                job_name=job_name,
                provider=provider,
                trigger=trigger,
                status="running",
            )
            session.add(run)
            await session.commit()
            await session.refresh(run)
            return run.id
    except Exception as exc:
        logger.error(f"Failed to record cron run start for {job_name}: {exc}", exc_info=True)
        return None


async def finish_cron_run(
    run_id: UUID | None,
    status: str,
    result_summary: str | None = None,
    error: str | None = None,
) -> None:
    """Finalizes a cron run record. Never raises — instrumentation must not
    break job execution."""
    if run_id is None:
        return
    try:
        async with async_session_maker() as session:
            run = await session.get(CronRun, run_id)
            if not run:
                return
            run.status = status
            run.finished_at = datetime.now(timezone.utc)
            run.result_summary = result_summary
            run.error = error
            await session.commit()
    except Exception as exc:
        logger.error(f"Failed to record cron run finish for run {run_id}: {exc}", exc_info=True)


async def mark_stale_running_runs(max_age_hours: int = STALE_RUN_CUTOFF_HOURS) -> int:
    """
    Closes out runs that were left in 'running' state (e.g. the backend was
    restarted mid-run) so the UI never shows a spinner forever.
    Returns the number of runs closed.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    try:
        async with async_session_maker() as session:
            res = await session.execute(
                update(CronRun)
                .where(CronRun.status == "running", CronRun.started_at < cutoff)
                .values(
                    status="failed",
                    finished_at=datetime.now(timezone.utc),
                    error=f"Run aborted: no completion recorded within {max_age_hours}h (backend may have restarted)",
                )
            )
            await session.commit()
            return res.rowcount or 0
    except Exception as exc:
        logger.error(f"Failed to clean stale cron runs: {exc}", exc_info=True)
        return 0



async def _safe_parse(provider: str) -> dict[str, Any]:
    """Run a provider parse under the global pipeline exclusivity guard. Returns {} if the pipeline is busy."""
    res = await ParserService.run_parse(provider)
    if res is None:
        logger.info(f"Auto-parse for {provider} skipped: another pipeline job is already running")
        return {}
    return res


async def _run_job_logic(job: CronJob, session: AsyncSession) -> dict[str, Any]:
    provider = (job.provider or "").lower().strip()
    search_params = dict(job.search_params or {})
    auto_parse = bool(job.auto_parse)

    scraped_counts: dict[str, int] = {}
    parsed_counts: dict[str, int] = {}

    try:
        if provider == "indeed":
            client = IndeedClient()
            res = await client.search_jobs(**search_params, persist=True)
            items = res[0] if isinstance(res, tuple) else res
            scraped_counts["indeed"] = len(items) if items else 0
            if auto_parse:
                parse_res = await _safe_parse("indeed")
                parsed_counts["indeed"] = parse_res.get("promoted_to_unified", 0)

        elif provider == "linkedin":
            client = LinkedInClient()
            items = await client.search_jobs(**search_params, persist=True)
            scraped_counts["linkedin"] = len(items) if items else 0
            if auto_parse:
                parse_res = await _safe_parse("linkedin")
                parsed_counts["linkedin"] = parse_res.get("promoted_to_unified", 0)

        elif provider == "wellfound":
            client = WellfoundClient()
            res = await client.search_jobs(**search_params, persist=True)
            items = res[0] if isinstance(res, tuple) else res
            scraped_counts["wellfound"] = len(items) if items else 0
            if auto_parse:
                parse_res = await _safe_parse("wellfound")
                parsed_counts["wellfound"] = parse_res.get("promoted_to_unified", 0)

        elif provider == "all":
            # 1. Indeed
            indeed_params = dict(search_params)
            if "keywords" in indeed_params and "what" not in indeed_params:
                indeed_params["what"] = indeed_params.pop("keywords")
            if "location" in indeed_params and "where" not in indeed_params:
                indeed_params["where"] = indeed_params.pop("location")
            indeed_client = IndeedClient()
            ind_res = await indeed_client.search_jobs(**indeed_params, persist=True)
            ind_items = ind_res[0] if isinstance(ind_res, tuple) else ind_res
            scraped_counts["indeed"] = len(ind_items) if ind_items else 0

            # 2. LinkedIn
            linkedin_params = dict(search_params)
            if "what" in linkedin_params and "keywords" not in linkedin_params:
                linkedin_params["keywords"] = linkedin_params.pop("what")
            if "where" in linkedin_params and "location" not in linkedin_params:
                linkedin_params["location"] = linkedin_params.pop("where")
            linkedin_client = LinkedInClient()
            lk_items = await linkedin_client.search_jobs(**linkedin_params, persist=True)
            scraped_counts["linkedin"] = len(lk_items) if lk_items else 0

            # 3. Wellfound
            wellfound_params = dict(search_params)
            if "what" in wellfound_params and "role" not in wellfound_params:
                wellfound_params["role"] = wellfound_params.pop("what")
            if "keywords" in wellfound_params and "role" not in wellfound_params:
                wellfound_params["role"] = wellfound_params.pop("keywords")
            if "where" in wellfound_params and "location" not in wellfound_params:
                wellfound_params["location"] = wellfound_params.pop("where")
            wellfound_client = WellfoundClient()
            wf_res = await wellfound_client.search_jobs(**wellfound_params, persist=True)
            wf_items = wf_res[0] if isinstance(wf_res, tuple) else wf_res
            scraped_counts["wellfound"] = len(wf_items) if wf_items else 0

            if auto_parse:
                p_ind = await _safe_parse("indeed")
                p_lk = await _safe_parse("linkedin")
                p_wf = await _safe_parse("wellfound")
                parsed_counts["indeed"] = p_ind.get("promoted_to_unified", 0)
                parsed_counts["linkedin"] = p_lk.get("promoted_to_unified", 0)
                parsed_counts["wellfound"] = p_wf.get("promoted_to_unified", 0)

        else:
            raise ValueError(f"Unsupported provider: {provider}")

        scraped_summary = ", ".join(f"{prov}: {cnt}" for prov, cnt in scraped_counts.items())
        summary = f"Scraped {provider} ({scraped_summary})"
        if auto_parse:
            parsed_summary = ", ".join(f"{prov}: {cnt}" for prov, cnt in parsed_counts.items())
            summary += f". Auto-parsed ({parsed_summary})"

        job.last_run_at = datetime.now(timezone.utc)
        job.last_status = "success"
        job.last_result_summary = summary
        await session.commit()

        return {
            "status": "success",
            "job_id": str(job.id),
            "provider": provider,
            "details": summary,
            "scraped": scraped_counts,
            "parsed": parsed_counts,
        }

    except Exception as exc:
        logger.error(f"CronJob {job.id} execution failed: {exc}", exc_info=True)
        job.last_run_at = datetime.now(timezone.utc)
        job.last_status = "failed"
        job.last_result_summary = str(exc)
        await session.commit()
        return {
            "status": "failed",
            "job_id": str(job.id),
            "error": str(exc),
        }


async def _run_result_to_record(run_id: UUID | None, result: dict[str, Any]) -> None:
    """Persists the outcome of a run based on its result dict."""
    if result.get("status") == "success":
        summary = result.get("details") or result.get("error")
        await finish_cron_run(run_id, "success", result_summary=summary)
    else:
        error = result.get("error") or result.get("details") or "Unknown error"
        await finish_cron_run(run_id, "failed", error=error)


async def execute_cron_job(
    job_id: UUID | str,
    session: AsyncSession | None = None,
    trigger: str = "manual",
) -> dict[str, Any]:
    """
    Executes the scraper for the cron job's configured provider with persist=True.
    Optionally triggers ParserService auto-parsing and updates the job's last run status.

    Every execution (manual/test runs and scheduler-triggered runs) is recorded
    in the cron_runs table: a 'running' row on start, finalized on completion.
    """
    if isinstance(job_id, str):
        job_id = UUID(job_id)

    async def _run_with_record(job: CronJob, sess: AsyncSession) -> dict[str, Any]:
        run_id = await start_cron_run(job.id, job.name, job.provider, trigger=trigger)
        try:
            result = await _run_job_logic(job, sess)
        except Exception as exc:
            # _run_job_logic normally swallows exceptions; guard anyway so the
            # run record never stays 'running' on an unexpected failure.
            await finish_cron_run(run_id, "failed", error=str(exc))
            raise
        await _run_result_to_record(run_id, result)
        if run_id is not None and isinstance(result, dict):
            result["run_id"] = str(run_id)
        return result

    if session is not None:
        job = await session.get(CronJob, job_id)
        if not job:
            return {"status": "failed", "job_id": str(job_id), "error": f"CronJob {job_id} not found"}
        return await _run_with_record(job, session)

    async with async_session_maker() as new_session:
        job = await new_session.get(CronJob, job_id)
        if not job:
            return {"status": "failed", "job_id": str(job_id), "error": f"CronJob {job_id} not found"}
        return await _run_with_record(job, new_session)


async def check_and_run_due_jobs(now_dt: datetime | None = None) -> int:
    """
    Scans for active enabled CronJobs matching the given or current UTC time.
    Checks days_of_week, hour, and minute, and prevents double execution within 60 seconds.
    Triggers due jobs asynchronously and returns the count of triggered jobs.
    """
    if now_dt is None:
        now_dt = datetime.now(timezone.utc)
    elif now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)

    current_weekday = now_dt.weekday()
    current_hour = now_dt.hour
    current_minute = now_dt.minute

    async with async_session_maker() as session:
        stmt = select(CronJob).where(CronJob.is_enabled == True)  # noqa: E712
        result = await session.execute(stmt)
        jobs = result.scalars().all()

        due_job_ids: list[UUID] = []
        for job in jobs:
            # Match hour and minute
            if job.hour != current_hour or job.minute != current_minute:
                continue

            # Match day of week if configured
            if job.days_of_week is not None and len(job.days_of_week) > 0:
                if current_weekday not in job.days_of_week:
                    continue

            # Prevent double execution in the same minute (within 60s)
            if job.last_run_at:
                last_run = job.last_run_at
                if last_run.tzinfo is None:
                    last_run = last_run.replace(tzinfo=timezone.utc)
                if (now_dt - last_run).total_seconds() < 60:
                    continue

            due_job_ids.append(job.id)

    for jid in due_job_ids:
        asyncio.create_task(execute_cron_job(jid, trigger="scheduler"))

    # Yield control to event loop so spawned tasks begin execution
    await asyncio.sleep(0)

    return len(due_job_ids)


async def _scheduler_loop() -> None:
    logger.info("Scheduler loop started.")
    while _scheduler_running:
        try:
            await check_and_run_due_jobs()
        except Exception as exc:
            logger.error(f"Error checking due cron jobs: {exc}", exc_info=True)

        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            break
    logger.info("Scheduler loop stopped.")


def start_scheduler_loop() -> asyncio.Task:
    """Starts the background asyncio task running the minute-by-minute scheduler loop."""
    global _scheduler_task, _scheduler_running
    if _scheduler_task is not None and not _scheduler_task.done():
        return _scheduler_task
    _scheduler_running = True
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    return _scheduler_task


def stop_scheduler_loop() -> None:
    """Cancels and stops the running scheduler loop."""
    global _scheduler_task, _scheduler_running
    _scheduler_running = False
    if _scheduler_task is not None and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None
