import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID
from httpx import AsyncClient, ASGITransport

from src.main import app
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    async with async_session_maker() as session:
        from sqlalchemy import text as _text
        await session.execute(
            _text(
                """
                DELETE FROM cron_jobs
                WHERE name IN (
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


@pytest.mark.asyncio
async def test_cron_lifecycle_e2e():
    """
    1. Full lifecycle:
       - Create cron schedule for Indeed at 6 AM Mon-Fri
       - Query list endpoint
       - Toggle state
       - Execute run endpoint
       - Check updated last_run_at and last_status in DB
       - Delete schedule
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Create cron schedule for Indeed at 6 AM Mon-Fri
        payload = {
            "name": "Indeed Weekdays 6 AM",
            "provider": "indeed",
            "hour": 6,
            "minute": 0,
            "days_of_week": [0, 1, 2, 3, 4],
            "search_params": {"what": "Software Engineer", "where": "India", "limit": 25},
            "auto_parse": False,
            "is_enabled": True,
        }
        create_res = await client.post("/api/cron", json=payload)
        assert create_res.status_code in (200, 201)
        created_job = create_res.json()
        job_id = created_job["id"]
        assert created_job["name"] == "Indeed Weekdays 6 AM"
        assert created_job["provider"] == "indeed"
        assert created_job["hour"] == 6
        assert created_job["minute"] == 0
        assert created_job["days_of_week"] == [0, 1, 2, 3, 4]
        assert created_job["is_enabled"] is True
        assert created_job["last_run_at"] is None
        assert created_job["last_status"] is None

        # Step 2: Query list endpoint (independent of any user-created jobs in the DB)
        list_res = await client.get("/api/cron")
        assert list_res.status_code == 200
        jobs = list_res.json()
        created_job_row = next(j for j in jobs if j["id"] == job_id)
        assert created_job_row["name"] == "Indeed Weekdays 6 AM"

        # Step 3: Toggle state (disable then re-enable)
        toggle_off = await client.patch(f"/api/cron/{job_id}/toggle")
        assert toggle_off.status_code == 200
        assert toggle_off.json()["is_enabled"] is False

        toggle_on = await client.patch(f"/api/cron/{job_id}/toggle")
        assert toggle_on.status_code == 200
        assert toggle_on.json()["is_enabled"] is True

        # Step 4: Execute run endpoint
        mock_search_results = (
            [
                MagicMock(external_id="ind_e2e_1", url="http://indeed.com/1"),
                MagicMock(external_id="ind_e2e_2", url="http://indeed.com/2"),
            ],
            None,
            {"data": {"jobSearch": {"results": []}}},
        )

        with patch("src.services.scheduler.IndeedClient") as mock_indeed_cls:
            mock_client = AsyncMock()
            mock_client.search_jobs.return_value = mock_search_results
            mock_indeed_cls.return_value = mock_client

            run_res = await client.post(f"/api/cron/{job_id}/run")
            assert run_res.status_code == 200
            run_data = run_res.json()
            assert run_data["status"] == "success"
            assert run_data["job_id"] == job_id
            assert run_data["provider"] == "indeed"
            assert "Scraped indeed" in run_data["details"]
            assert run_data["scraped"]["indeed"] == 2

            mock_client.search_jobs.assert_awaited_once_with(
                what="Software Engineer",
                where="India",
                limit=25,
                persist=True,
            )

        # Step 5: Check updated last_run_at, last_status, and last_result_summary in DB
        async with async_session_maker() as session:
            db_job = await session.get(CronJob, UUID(job_id))
            assert db_job is not None
            assert db_job.last_status == "success"
            assert db_job.last_run_at is not None
            assert "Scraped indeed (indeed: 2)" in (db_job.last_result_summary or "")

        # Also verify via GET list endpoint
        job_get_res = await client.get("/api/cron")
        current_job = next(j for j in job_get_res.json() if j["id"] == job_id)
        assert current_job["last_status"] == "success"
        assert current_job["last_run_at"] is not None
        assert "Scraped indeed" in current_job["last_result_summary"]

        # Step 6: Delete schedule
        del_res = await client.delete(f"/api/cron/{job_id}")
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] is True

        # Verify deletion in DB
        async with async_session_maker() as session:
            db_check = await session.get(CronJob, UUID(job_id))
            assert db_check is None

        # Verify the deleted job is gone via GET endpoint (independent of any user-created jobs)
        empty_list = await client.get("/api/cron")
        assert all(j["id"] != job_id for j in empty_list.json())


@pytest.mark.asyncio
async def test_cron_auto_parse_integration():
    """
    2. Integration of auto_parse:
       - Verify that when a cron job with auto_parse=True executes,
         both scraper and parser are called and records are updated.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create cron job with auto_parse=True
        payload = {
            "name": "Indeed Auto-Parse Job",
            "provider": "indeed",
            "hour": 8,
            "minute": 15,
            "days_of_week": [1, 3, 5],
            "search_params": {"what": "Backend Developer", "where": "Remote"},
            "auto_parse": True,
            "is_enabled": True,
        }
        res = await client.post("/api/cron", json=payload)
        assert res.status_code in (200, 201)
        job_id = res.json()["id"]

        mock_search_results = (
            [
                MagicMock(external_id="ind_parse_1"),
                MagicMock(external_id="ind_parse_2"),
                MagicMock(external_id="ind_parse_3"),
            ],
            None,
            {},
        )

        with patch("src.services.scheduler.IndeedClient") as mock_indeed_cls, \
             patch("src.services.scheduler.ParserService") as mock_parser_cls:
            mock_scraper = AsyncMock()
            mock_scraper.search_jobs.return_value = mock_search_results
            mock_indeed_cls.return_value = mock_scraper

            mock_parser_cls.run_parse = AsyncMock(
                return_value={"source": "indeed", "promoted_to_unified": 3}
            )

            # Trigger run via API
            run_res = await client.post(f"/api/cron/{job_id}/run")
            assert run_res.status_code == 200
            run_data = run_res.json()

            assert run_data["status"] == "success"
            assert run_data["scraped"]["indeed"] == 3
            assert run_data["parsed"]["indeed"] == 3
            assert "Auto-parsed (indeed: 3)" in run_data["details"]

            # Verify scraper called with persist=True
            mock_scraper.search_jobs.assert_awaited_once_with(
                what="Backend Developer",
                where="Remote",
                persist=True,
            )
            # Verify parser called
            mock_parser_cls.run_parse.assert_awaited_once()

        # Check DB record updated
        async with async_session_maker() as session:
            db_job = await session.get(CronJob, UUID(job_id))
            assert db_job is not None
            assert db_job.last_status == "success"
            assert db_job.last_run_at is not None
            assert "Scraped indeed (indeed: 3)" in db_job.last_result_summary
            assert "Auto-parsed (indeed: 3)" in db_job.last_result_summary


@pytest.mark.asyncio
async def test_cron_auto_parse_all_providers():
    """
    Verify auto_parse=True across all providers (Indeed, LinkedIn, Wellfound).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "name": "Omni Scrape Daily",
            "provider": "all",
            "hour": 5,
            "minute": 0,
            "days_of_week": [0],
            "search_params": {"what": "Fullstack", "where": "India"},
            "auto_parse": True,
            "is_enabled": True,
        }
        res = await client.post("/api/cron", json=payload)
        assert res.status_code in (200, 201)
        job_id = res.json()["id"]

        with patch("src.services.scheduler.IndeedClient") as mock_ind_cls, \
             patch("src.services.scheduler.LinkedInClient") as mock_lk_cls, \
             patch("src.services.scheduler.WellfoundClient") as mock_wf_cls, \
             patch("src.services.scheduler.ParserService") as mock_parser_cls:

            mock_ind = AsyncMock()
            mock_ind.search_jobs.return_value = ([MagicMock()], None, {})
            mock_ind_cls.return_value = mock_ind

            mock_lk = AsyncMock()
            mock_lk.search_jobs.return_value = [MagicMock(), MagicMock()]
            mock_lk_cls.return_value = mock_lk

            mock_wf = AsyncMock()
            mock_wf.search_jobs.return_value = ([MagicMock()], "cursor", {})
            mock_wf_cls.return_value = mock_wf

            async def _run_parse_side_effect(provider, *args, **kwargs):
                return {"promoted_to_unified": {"indeed": 1, "linkedin": 2, "wellfound": 1}[provider]}

            mock_parser_cls.run_parse = AsyncMock(side_effect=_run_parse_side_effect)

            run_res = await client.post(f"/api/cron/{job_id}/run")
            assert run_res.status_code == 200
            run_data = run_res.json()
            assert run_data["status"] == "success"
            assert run_data["scraped"] == {"indeed": 1, "linkedin": 2, "wellfound": 1}
            assert run_data["parsed"] == {"indeed": 1, "linkedin": 2, "wellfound": 1}

            mock_ind.search_jobs.assert_awaited_once()
            mock_lk.search_jobs.assert_awaited_once()
            mock_wf.search_jobs.assert_awaited_once()
            assert mock_parser_cls.run_parse.await_count == 3

        async with async_session_maker() as session:
            db_job = await session.get(CronJob, UUID(job_id))
            assert db_job is not None
            assert db_job.last_status == "success"
            assert "indeed: 1" in db_job.last_result_summary
            assert "linkedin: 2" in db_job.last_result_summary
            assert "wellfound: 1" in db_job.last_result_summary
