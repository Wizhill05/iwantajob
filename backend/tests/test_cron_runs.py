import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from src.main import app
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob, CronRun
from src.services.scheduler import (
    execute_cron_job,
    start_cron_run,
    finish_cron_run,
    mark_stale_running_runs,
)


async def _seed_job(name: str, provider: str = "indeed") -> str:
    async with async_session_maker() as session:
        job = CronJob(
            id=uuid4(),
            name=name,
            provider=provider,
            hour=9,
            minute=0,
            days_of_week=[0, 1, 2, 3, 4],
            search_params={"what": "ai engineer", "where": "India", "limit": 5},
            auto_parse=False,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()
        return job.id


async def _runs_for_job(job_id) -> list[CronRun]:
    async with async_session_maker() as session:
        res = await session.execute(
            select(CronRun).where(CronRun.cron_job_id == job_id).order_by(CronRun.started_at)
        )
        return res.scalars().all()


@pytest.mark.asyncio
async def test_successful_run_is_recorded():
    """A successful execution creates a run row with running -> success and timestamps."""
    await init_db()
    job_id = await _seed_job("Test Success Run Job")

    with patch("src.services.scheduler.IndeedClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.search_jobs.return_value = ([MagicMock(external_id="ind_1", url="http://x")], None, {})
        mock_client_cls.return_value = mock_client

        res = await execute_cron_job(job_id)
        assert res["status"] == "success"

    runs = await _runs_for_job(job_id)
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "success"
    assert run.trigger == "manual"
    assert run.job_name == "Test Success Run Job"
    assert run.provider == "indeed"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert run.error is None
    assert "Scraped indeed" in run.result_summary
    assert run.finished_at >= run.started_at - timedelta(seconds=1)


@pytest.mark.asyncio
async def test_failed_run_is_recorded_with_error():
    """A failing execution records status='failed' plus the error text."""
    await init_db()
    job_id = await _seed_job("Test Failing Run Job", provider="linkedin")

    with patch("src.services.scheduler.LinkedInClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.search_jobs.side_effect = RuntimeError("Upstream LinkedIn blocked")
        mock_client_cls.return_value = mock_client

        res = await execute_cron_job(job_id)
        assert res["status"] == "failed"
        assert "Upstream LinkedIn blocked" in res["error"]

    runs = await _runs_for_job(job_id)
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "failed"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert "Upstream LinkedIn blocked" in run.error


@pytest.mark.asyncio
async def test_scheduler_triggered_run_records_trigger():
    """Scheduler-triggered runs are recorded with trigger='scheduler'."""
    await init_db()
    job_id = await _seed_job("Test Scheduled Run Job", provider="wellfound")

    with patch("src.services.scheduler.WellfoundClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.search_jobs.return_value = [MagicMock(external_id="wf_1", url="http://x")]
        mock_client_cls.return_value = mock_client

        res = await execute_cron_job(job_id, trigger="scheduler")
        assert res["status"] == "success"

    runs = await _runs_for_job(job_id)
    assert len(runs) == 1
    assert runs[0].trigger == "scheduler"
    assert runs[0].status == "success"


@pytest.mark.asyncio
async def test_manual_run_endpoint_records_run():
    """The /run API (test button path) writes a run record end-to-end."""
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/api/cron",
            json={
                "name": "Test Endpoint Run Job",
                "provider": "indeed",
                "hour": 10,
                "minute": 15,
                "search_params": {"what": "ml engineer"},
            },
        )
        assert create_res.status_code in (200, 201)
        job_id = create_res.json()["id"]

        with patch("src.services.scheduler.IndeedClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.search_jobs.return_value = ([MagicMock(external_id="ind_2", url="http://x")], None, {})
            mock_client_cls.return_value = mock_client

            run_res = await client.post(f"/api/cron/{job_id}/run")
            assert run_res.status_code == 200
            assert run_res.json()["status"] == "success"

        # Run history is exposed via the API
        runs_res = await client.get("/api/cron/runs")
        assert runs_res.status_code == 200
        body = runs_res.json()
        assert body["total"] >= 1
        match = [r for r in body["runs"] if r["cron_job_id"] == job_id]
        assert len(match) == 1
        recorded = match[0]
        assert recorded["status"] == "success"
        assert recorded["job_name"] == "Test Endpoint Run Job"
        assert recorded["started_at"] is not None
        assert recorded["finished_at"] is not None

        # Most recent first
        started = [datetime.fromisoformat(r["started_at"].replace("Z", "+00:00")) for r in body["runs"]]
        assert started == sorted(started, reverse=True)


@pytest.mark.asyncio
async def test_running_state_is_exposed_while_run_in_progress():
    """A run that started but has not finished is visible as 'running' — this is
    what lets the UI restore the spinner after navigating away and back."""
    await init_db()
    job_id = await _seed_job("Test Running State Job")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Simulate a run that started but hasn't finished yet
        run_id = await start_cron_run(
            job_id, "Test Running State Job", "indeed", trigger="manual"
        )
        assert run_id is not None

        running_res = await client.get("/api/cron/runs/running")
        assert running_res.status_code == 200
        running = running_res.json()["running"]
        match = [r for r in running if r["id"] == str(run_id)]
        assert len(match) == 1
        assert match[0]["status"] == "running"
        assert match[0]["finished_at"] is None

        list_res = await client.get("/api/cron/runs")
        listed = [r for r in list_res.json()["runs"] if r["id"] == str(run_id)]
        assert len(listed) == 1
        assert listed[0]["status"] == "running"

        # Once the run finishes it no longer shows up as running
        await finish_cron_run(run_id, "success", result_summary="done")
        running_after = (await client.get("/api/cron/runs/running")).json()["running"]
        assert all(r["id"] != str(run_id) for r in running_after)


@pytest.mark.asyncio
async def test_stale_running_runs_are_closed():
    """Runs stuck in 'running' beyond the cutoff are marked failed, so the UI
    never spins forever after a backend restart."""
    await init_db()
    job_id = await _seed_job("Test Stale Run Job")

    async with async_session_maker() as session:
        stale = CronRun(
            cron_job_id=job_id,
            job_name="Test Stale Run Job",
            provider="indeed",
            trigger="manual",
            status="running",
            started_at=datetime.now(timezone.utc) - timedelta(hours=10),
        )
        fresh = CronRun(
            cron_job_id=job_id,
            job_name="Test Stale Run Job",
            provider="indeed",
            trigger="manual",
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        session.add_all([stale, fresh])
        await session.commit()
        stale_id, fresh_id = stale.id, fresh.id

    closed = await mark_stale_running_runs()
    assert closed >= 1

    async with async_session_maker() as session:
        s = await session.get(CronRun, stale_id)
        f = await session.get(CronRun, fresh_id)
        assert s.status == "failed"
        assert s.finished_at is not None
        assert "aborted" in s.error.lower()
        assert f.status == "running"
        assert f.finished_at is None
