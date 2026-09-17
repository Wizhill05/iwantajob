import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/iwantajob_db"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def init_db() -> None:
    # Import entities so they register with Base.metadata
    import src.models.db_entities  # noqa: F401
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Additive-only migration for tables created before the blocked-companies
        # feature: create_all never alters existing tables.
        for table in (
            "raw_indeed_jobs",
            "raw_linkedin_jobs",
            "raw_wellfound_jobs",
            "raw_glassdoor_jobs",
        ):
            await conn.execute(
                text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "
                    "skipped_as_blocked BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
        await conn.execute(
            text(
                "ALTER TABLE blocked_companies ADD COLUMN IF NOT EXISTS "
                "blocked_attempts INTEGER NOT NULL DEFAULT 0"
            )
        )
