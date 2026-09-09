"""
Shared pytest fixtures for database cleanup.

After every test that touches the real database, these autouse fixtures
delete any row whose external_id starts with 'test_' (the convention
enforced across all test files).

Tests that use only in-memory / mocked objects are unaffected because the
DELETE statements are no-ops when no matching rows exist.
"""

import pytest
from sqlalchemy import text
from src.core.database import async_session_maker, init_db


@pytest.fixture(autouse=True)
async def cleanup_test_data():
    """
    Yield-fixture: runs after every test function.
    Deletes all rows seeded by tests, identified by the 'test_' prefix
    convention on external_id.
    """
    # Ensure tables exist before any test runs
    await init_db()

    yield  # test runs here

    async with async_session_maker() as session:
        # Raw tables — external_id LIKE 'test_%'
        await session.execute(
            text("DELETE FROM raw_indeed_jobs WHERE external_id LIKE 'test_%'")
        )
        await session.execute(
            text("DELETE FROM raw_linkedin_jobs WHERE external_id LIKE 'test_%'")
        )
        await session.execute(
            text("DELETE FROM raw_wellfound_jobs WHERE external_id LIKE 'test_%'")
        )

        # Unified jobs — external_id LIKE 'test_%'
        await session.execute(
            text("DELETE FROM unified_jobs WHERE external_id LIKE 'test_%'")
        )

        await session.commit()
