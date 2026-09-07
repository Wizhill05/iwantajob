import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from src.main import app
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    async with async_session_maker() as session:
        await session.execute(CronJob.__table__.delete())
        await session.commit()


@pytest.mark.asyncio
async def test_create_and_list_cron_jobs():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a new cron job
        payload = {
            "name": "Daily Indeed AI Engineer",
            "provider": "indeed",
            "hour": 8,
            "minute": 30,
            "days_of_week": [0, 1, 2, 3, 4],
            "search_params": {"what": "ai engineer", "where": "India"},
            "auto_parse": True,
            "is_enabled": True,
        }
        res = await client.post("/api/cron", json=payload)
        assert res.status_code in (200, 201)
        data = res.json()
        assert data["name"] == "Daily Indeed AI Engineer"
        assert data["provider"] == "indeed"
        assert data["hour"] == 8
        assert data["minute"] == 30
        assert data["days_of_week"] == [0, 1, 2, 3, 4]
        assert data["search_params"] == {"what": "ai engineer", "where": "India"}
        assert data["auto_parse"] is True
        assert data["is_enabled"] is True
        job_id = data["id"]
        assert job_id is not None

        # List cron jobs
        list_res = await client.get("/api/cron")
        assert list_res.status_code == 200
        jobs = list_res.json()
        assert len(jobs) == 1
        assert jobs[0]["id"] == job_id


@pytest.mark.asyncio
async def test_create_cron_job_validation_errors():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Invalid provider
        bad_provider = {
            "name": "Bad Provider",
            "provider": "unknown_provider",
            "hour": 10,
            "minute": 0,
        }
        res = await client.post("/api/cron", json=bad_provider)
        assert res.status_code == 422

        # Invalid hour (> 23)
        bad_hour = {
            "name": "Bad Hour",
            "provider": "indeed",
            "hour": 24,
            "minute": 0,
        }
        res = await client.post("/api/cron", json=bad_hour)
        assert res.status_code == 422

        # Invalid minute (> 59)
        bad_min = {
            "name": "Bad Minute",
            "provider": "indeed",
            "hour": 10,
            "minute": 60,
        }
        res = await client.post("/api/cron", json=bad_min)
        assert res.status_code == 422

        # Empty name
        bad_name = {
            "name": "",
            "provider": "indeed",
            "hour": 10,
            "minute": 0,
        }
        res = await client.post("/api/cron", json=bad_name)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_cron_job():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create initial
        payload = {
            "name": "Initial Job",
            "provider": "linkedin",
            "hour": 10,
            "minute": 0,
            "days_of_week": [1],
            "search_params": {"keywords": "python"},
            "auto_parse": False,
            "is_enabled": True,
        }
        create_res = await client.post("/api/cron", json=payload)
        assert create_res.status_code in (200, 201)
        job_id = create_res.json()["id"]

        # Update
        update_payload = {
            "name": "Updated Job Name",
            "hour": 11,
            "minute": 45,
            "auto_parse": True,
        }
        put_res = await client.put(f"/api/cron/{job_id}", json=update_payload)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["name"] == "Updated Job Name"
        assert updated["hour"] == 11
        assert updated["minute"] == 45
        assert updated["auto_parse"] is True
        assert updated["provider"] == "linkedin"

        # 404 on non-existent UUID
        rand_id = str(uuid4())
        put_not_found = await client.put(f"/api/cron/{rand_id}", json=update_payload)
        assert put_not_found.status_code == 404


@pytest.mark.asyncio
async def test_toggle_cron_job():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create initially enabled
        payload = {
            "name": "Toggle Test Job",
            "provider": "wellfound",
            "hour": 12,
            "minute": 0,
            "is_enabled": True,
        }
        create_res = await client.post("/api/cron", json=payload)
        job_id = create_res.json()["id"]
        assert create_res.json()["is_enabled"] is True

        # Toggle to disabled
        res1 = await client.patch(f"/api/cron/{job_id}/toggle")
        assert res1.status_code == 200
        assert res1.json()["is_enabled"] is False

        # Toggle back to enabled
        res2 = await client.patch(f"/api/cron/{job_id}/toggle")
        assert res2.status_code == 200
        assert res2.json()["is_enabled"] is True

        # 404 on non-existent UUID
        rand_id = str(uuid4())
        toggle_not_found = await client.patch(f"/api/cron/{rand_id}/toggle")
        assert toggle_not_found.status_code == 404


@pytest.mark.asyncio
async def test_delete_cron_job():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "name": "To Delete Job",
            "provider": "all",
            "hour": 7,
            "minute": 15,
        }
        create_res = await client.post("/api/cron", json=payload)
        job_id = create_res.json()["id"]

        # Delete
        del_res = await client.delete(f"/api/cron/{job_id}")
        assert del_res.status_code in (200, 204)

        # Confirm 404 on subsequent toggle or update
        toggle_res = await client.patch(f"/api/cron/{job_id}/toggle")
        assert toggle_res.status_code == 404

        # Confirm empty list
        list_res = await client.get("/api/cron")
        assert len(list_res.json()) == 0

        # 404 on non-existent UUID delete
        rand_id = str(uuid4())
        del_not_found = await client.delete(f"/api/cron/{rand_id}")
        assert del_not_found.status_code == 404


@pytest.mark.asyncio
async def test_run_cron_job_immediate():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "name": "Immediate Run Job",
            "provider": "indeed",
            "hour": 14,
            "minute": 0,
            "search_params": {"what": "ml engineer"},
        }
        create_res = await client.post("/api/cron", json=payload)
        job_id = create_res.json()["id"]

        with patch("src.api.cron_router.execute_cron_job", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "job_id": job_id,
                "provider": "indeed",
                "details": "Scraped indeed (indeed: 10)",
            }

            run_res = await client.post(f"/api/cron/{job_id}/run")
            assert run_res.status_code == 200
            run_data = run_res.json()
            assert run_data["status"] == "success"
            assert run_data["job_id"] == job_id
            mock_exec.assert_awaited_once_with(job_id)

        # 404 on non-existent UUID run
        rand_id = str(uuid4())
        run_not_found = await client.post(f"/api/cron/{rand_id}/run")
        assert run_not_found.status_code == 404


@pytest.mark.asyncio
async def test_lifespan_startup_and_shutdown():
    from src.main import lifespan
    with patch("src.main.init_db", new_callable=AsyncMock) as mock_init_db, \
         patch("src.main.start_scheduler_loop") as mock_start_loop, \
         patch("src.main.stop_scheduler_loop") as mock_stop_loop:
        async with lifespan(app):
            mock_init_db.assert_awaited_once()
            mock_start_loop.assert_called_once()
            mock_stop_loop.assert_not_called()
        mock_stop_loop.assert_called_once()

