import pytest
from sqlalchemy import text
from src.core.database import async_session_maker, init_db

@pytest.mark.asyncio
async def test_init_db_creates_tables():
    await init_db()
    async with async_session_maker() as session:
        result = await session.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        )
        tables = [row[0] for row in result.fetchall()]
        assert "raw_indeed_jobs" in tables
        assert "raw_linkedin_jobs" in tables
        assert "raw_wellfound_jobs" in tables
        assert "unified_jobs" in tables
