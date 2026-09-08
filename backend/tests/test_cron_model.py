import pytest
from src.core.database import init_db, async_session_maker
from src.models.db_entities import CronJob
from sqlalchemy import select

@pytest.mark.asyncio
async def test_cron_job_create_and_query():
    await init_db()
    async with async_session_maker() as session:
        job = CronJob(
            name="Test Daily Indeed",
            provider="indeed",
            hour=6,
            minute=0,
            days_of_week=[0, 1, 2, 3, 4],
            search_params={"what": "engineer", "where": "India"},
            auto_parse=True,
            is_enabled=True,
        )
        session.add(job)
        await session.commit()

        result = await session.execute(select(CronJob).where(CronJob.id == job.id))
        queried = result.scalar_one_or_none()
        assert queried is not None
        assert queried.name == "Test Daily Indeed"
        assert queried.hour == 6
        assert queried.days_of_week == [0, 1, 2, 3, 4]
