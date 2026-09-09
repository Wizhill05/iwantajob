"""
Shared pytest fixtures for database cleanup.

After every test that touches the real database, these autouse fixtures
delete any row whose external_id starts with 'test_' (the convention
enforced across all test files) plus any CronJob rows seeded by tests.

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
    convention on external_id, plus test CronJob rows by name prefix.
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

        # CronJobs inserted by tests — deleted by known test name values.
        # These come from test_scheduler.py, test_cron_model.py,
        # test_cron_api.py, and test_cron_e2e.py.
        await session.execute(
            text(
                """
                DELETE FROM cron_jobs
                WHERE name IN (
                    'Indeed Engineer Daily',
                    'Failing Job',
                    'All Providers Job',
                    'Test Daily Indeed',
                    'Due Job',
                    'Wrong Minute Job',
                    'Disabled Job',
                    'Already Run Job',
                    'Daily Indeed AI Engineer',
                    'Bad Provider',
                    'Bad Hour',
                    'Bad Minute',
                    'Initial Job',
                    'Updated Job Name',
                    'Toggle Test Job',
                    'To Delete Job',
                    'Immediate Run Job',
                    'Indeed Weekdays 6 AM',
                    'Indeed Auto-Parse Job',
                    'Omni Scrape Daily'
                )
                OR name LIKE 'test_%'
                OR name LIKE 'Test %'
                """
            )
        )

        # CronRun history rows created by tests (test job names use the
        # 'test_' / 'Test ' prefixes enforced by this suite).
        await session.execute(
            text("DELETE FROM cron_runs WHERE job_name LIKE 'test_%' OR job_name LIKE 'Test %'")
        )

        await session.commit()
