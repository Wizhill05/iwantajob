import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import select
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob
from src.services.scheduler import (
    execute_cron_job,
    check_and_run_due_jobs,
    start_scheduler_loop,
    stop_scheduler_loop,
)

@pytest.mark.asyncio
async def test_execute_cron_job_indeed_success():
    await init_db()
    async with async_session_maker() as session:
        job = CronJob(
            id=uuid4(),
            name="Indeed Engineer Daily",
            provider="indeed",
            hour=9,
            minute=30,
            days_of_week=[0, 1, 2, 3, 4],
            search_params={"what": "ai engineer", "where": "India", "limit": 10},
            auto_parse=True,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    mock_indeed_res = (
        [MagicMock(external_id="ind_1", url="http://indeed.com/1")],
        None,
        {
            "data": {
                "jobSearch": {
                    "results": [
                        {
                            "job": {
                                "key": "ind_1",
                                "title": "AI Engineer",
                                "employer": {"name": "TestAI Corp"},
                                "location": {"formatted": {"short": "Bengaluru"}, "city": "Bengaluru", "countryCode": "IN", "isRemote": False},
                                "url": "https://indeed.com/viewjob?jk=ind_1",
                                "attributes": [{"label": "Fresher"}],
                                "description": {"html": "<p>Build models</p>"},
                            }
                        }
                    ]
                }
            }
        }
    )

    with patch("src.services.scheduler.IndeedClient") as mock_client_cls, \
         patch("src.services.scheduler.ParserService") as mock_parser_cls:
        mock_client = AsyncMock()
        mock_client.search_jobs.return_value = mock_indeed_res
        mock_client_cls.return_value = mock_client
        mock_parser_cls.run_parse = AsyncMock(return_value={"promoted_to_unified": 1})

        res = await execute_cron_job(job_id)

        assert res["status"] == "success"
        assert "indeed" in res["details"]
        mock_client.search_jobs.assert_awaited_once()
        mock_parser_cls.run_parse.assert_awaited_once()

    async with async_session_maker() as session:
        updated = await session.get(CronJob, job_id)
        assert updated.last_status == "success"
        assert updated.last_run_at is not None
        assert "Scraped indeed" in updated.last_result_summary

@pytest.mark.asyncio
async def test_execute_cron_job_failure_updates_status():
    await init_db()
    async with async_session_maker() as session:
        job = CronJob(
            id=uuid4(),
            name="Failing Job",
            provider="linkedin",
            hour=12,
            minute=0,
            days_of_week=[0],
            search_params={"keywords": "python"},
            auto_parse=False,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    with patch("src.services.scheduler.LinkedInClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.search_jobs.side_effect = RuntimeError("Upstream LinkedIn blocked")
        mock_client_cls.return_value = mock_client

        res = await execute_cron_job(job_id)

        assert res["status"] == "failed"
        assert "Upstream LinkedIn blocked" in res["error"]

    async with async_session_maker() as session:
        updated = await session.get(CronJob, job_id)
        assert updated.last_status == "failed"
        assert updated.last_run_at is not None
        assert "Upstream LinkedIn blocked" in updated.last_result_summary

@pytest.mark.asyncio
async def test_check_and_run_due_jobs_matching():
    await init_db()
    async with async_session_maker() as session:
        from sqlalchemy import text as _text
        await session.execute(
            _text(
                """
                DELETE FROM cron_jobs
                WHERE name IN (
                    'Indeed Engineer Daily',
                    'Failing Job',
                    'All Providers Job',
                    'Due Job',
                    'Wrong Minute Job',
                    'Disabled Job',
                    'Already Run Job'
                )
                OR name LIKE 'test_%'
                OR name LIKE 'Test %'
                """
            )
        )
        await session.commit()

    test_dt = datetime(2026, 9, 7, 14, 30, 0, tzinfo=timezone.utc)  # 2026-09-07 is Monday (weekday 0)
    
    async with async_session_maker() as session:
        # Job 1: Due now
        job_due = CronJob(
            id=uuid4(),
            name="Due Job",
            provider="wellfound",
            hour=14,
            minute=30,
            days_of_week=[0, 2],
            search_params={"role": "ai-engineer"},
            auto_parse=False,
            is_enabled=True,
            last_run_at=None,
        )
        # Job 2: Wrong minute
        job_wrong_minute = CronJob(
            id=uuid4(),
            name="Wrong Minute Job",
            provider="wellfound",
            hour=14,
            minute=31,
            days_of_week=[0],
            search_params={},
            auto_parse=False,
            is_enabled=True,
        )
        # Job 3: Disabled
        job_disabled = CronJob(
            id=uuid4(),
            name="Disabled Job",
            provider="wellfound",
            hour=14,
            minute=30,
            days_of_week=[0],
            search_params={},
            auto_parse=False,
            is_enabled=False,
        )
        # Job 4: Already run within last 60 seconds
        job_already_run = CronJob(
            id=uuid4(),
            name="Already Run Job",
            provider="wellfound",
            hour=14,
            minute=30,
            days_of_week=[0],
            search_params={},
            auto_parse=False,
            is_enabled=True,
            last_run_at=test_dt - timedelta(seconds=20),
        )
        session.add_all([job_due, job_wrong_minute, job_disabled, job_already_run])
        await session.commit()

    with patch("src.services.scheduler.execute_cron_job", new_callable=AsyncMock) as mock_exec:
        triggered_count = await check_and_run_due_jobs(now_dt=test_dt)
        assert triggered_count == 1
        mock_exec.assert_awaited_once_with(job_due.id)

@pytest.mark.asyncio
async def test_execute_cron_job_all_providers_success():
    await init_db()
    async with async_session_maker() as session:
        job = CronJob(
            id=uuid4(),
            name="All Providers Job",
            provider="all",
            hour=8,
            minute=0,
            days_of_week=[0],
            search_params={"keywords": "python developer", "location": "India"},
            auto_parse=True,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    with patch("src.services.scheduler.IndeedClient") as mock_ind_cls, \
         patch("src.services.scheduler.LinkedInClient") as mock_lk_cls, \
         patch("src.services.scheduler.WellfoundClient") as mock_wf_cls, \
         patch("src.services.scheduler.ParserService") as mock_parser_cls:
        
        mock_ind = AsyncMock()
        mock_ind.search_jobs.return_value = ([MagicMock(id=1)], None, {})
        mock_ind_cls.return_value = mock_ind

        mock_lk = AsyncMock()
        mock_lk.search_jobs.return_value = [MagicMock(id=2)]
        mock_lk_cls.return_value = mock_lk

        mock_wf = AsyncMock()
        mock_wf.search_jobs.return_value = [MagicMock(id=3)]
        mock_wf_cls.return_value = mock_wf

        async def _run_parse_side_effect(provider, *args, **kwargs):
            return {"promoted_to_unified": {"indeed": 1, "linkedin": 2, "wellfound": 3}[provider]}

        mock_parser_cls.run_parse = AsyncMock(side_effect=_run_parse_side_effect)

        res = await execute_cron_job(job_id)

        assert res["status"] == "success"
        assert res["scraped"]["indeed"] == 1
        assert res["scraped"]["linkedin"] == 1
        assert res["scraped"]["wellfound"] == 1
        assert res["parsed"]["indeed"] == 1
        assert res["parsed"]["linkedin"] == 2
        assert res["parsed"]["wellfound"] == 3

    async with async_session_maker() as session:
        updated = await session.get(CronJob, job_id)
        assert updated.last_status == "success"
        assert "Auto-parsed" in updated.last_result_summary

@pytest.mark.asyncio
async def test_scheduler_loop_start_and_stop():
    task = start_scheduler_loop()
    assert task is not None
    assert not task.done()

    # Calling start again returns the same running task
    same_task = start_scheduler_loop()
    assert same_task is task

    stop_scheduler_loop()
    await asyncio.sleep(0.05)
    assert task.done() or task.cancelled()

