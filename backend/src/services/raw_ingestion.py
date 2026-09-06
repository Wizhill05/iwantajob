import logging
from typing import Any
from sqlalchemy import select, or_
from sqlalchemy.dialects.postgresql import insert
from src.core.database import async_session_maker
from src.models.db_entities import RawIndeedJob, RawLinkedInJob, RawWellfoundJob, UnifiedJob
from src.utils.url_normalizer import normalize_job_url

logger = logging.getLogger(__name__)

async def save_raw_indeed_job(data: dict[str, Any]) -> bool:
    """
    Saves a raw Indeed job if it doesn't already exist in raw or unified tables.
    Returns True if newly inserted, False if skipped as duplicate.
    """
    external_id = data["external_id"]
    raw_apply_url = data.get("apply_url")
    norm_apply_url = normalize_job_url(raw_apply_url) if raw_apply_url else None
    view_url = f"https://www.indeed.com/viewjob?jk={external_id}"

    async with async_session_maker() as session:
        # Check raw_indeed_jobs
        exists_raw = await session.execute(
            select(RawIndeedJob.id).where(RawIndeedJob.external_id == external_id)
        )
        if exists_raw.scalar_one_or_none() is not None:
            logger.info(f"Indeed job {external_id} already exists in raw_indeed_jobs, skipping duplicate.")
            return False

        # Check unified_jobs for either external_id or view URL or apply_url
        unified_conds = [
            (UnifiedJob.source == "indeed") & (UnifiedJob.external_id == external_id),
            UnifiedJob.url == view_url,
        ]
        if norm_apply_url and "indeed.com" not in norm_apply_url:
            unified_conds.append(UnifiedJob.url == norm_apply_url)

        exists_unified = await session.execute(
            select(UnifiedJob.id).where(or_(*unified_conds))
        )
        if exists_unified.scalar_one_or_none() is not None:
            logger.info(f"Indeed job {external_id} already exists in unified_jobs, skipping duplicate.")
            return False

        company_name = data.get("company_name") or "Unknown"
        title = data.get("title") or "Unknown"
        stmt = insert(RawIndeedJob).values(
            external_id=external_id,
            tracking_key=data.get("tracking_key"),
            title=title,
            company_name=company_name,
            location_raw=data["location_raw"],
            location_city=data.get("location_city"),
            location_country=data.get("location_country"),
            is_remote=data.get("is_remote", False),
            apply_url=raw_apply_url,
            easy_apply_available=data.get("easy_apply_available", False),
            attributes=data.get("attributes", []),
            salary_raw=data.get("salary_raw"),
            description_html=data.get("description_html"),
            description_text=data["description_text"],
            date_published=data.get("date_published"),
            raw_payload=data.get("raw_payload", {}),
        ).on_conflict_do_nothing(index_elements=[RawIndeedJob.external_id])

        await session.execute(stmt)
        await session.commit()
        return True


async def save_raw_linkedin_job(data: dict[str, Any]) -> bool:
    """
    Saves a raw LinkedIn job if it doesn't already exist in raw or unified tables.
    Returns True if newly inserted, False if skipped as duplicate.
    """
    external_id = data["external_id"]
    job_url = data["url"]
    norm_url = normalize_job_url(job_url)

    async with async_session_maker() as session:
        # Check raw_linkedin_jobs
        exists_raw = await session.execute(
            select(RawLinkedInJob.id).where(
                or_(
                    RawLinkedInJob.external_id == external_id,
                    RawLinkedInJob.url == job_url,
                    RawLinkedInJob.url == norm_url,
                )
            )
        )
        if exists_raw.scalar_one_or_none() is not None:
            logger.info(f"LinkedIn job {external_id} already exists in raw_linkedin_jobs, skipping duplicate.")
            return False

        # Check unified_jobs
        exists_unified = await session.execute(
            select(UnifiedJob.id).where(
                or_(
                    (UnifiedJob.source == "linkedin") & (UnifiedJob.external_id == external_id),
                    UnifiedJob.url == job_url,
                    UnifiedJob.url == norm_url,
                )
            )
        )
        if exists_unified.scalar_one_or_none() is not None:
            logger.info(f"LinkedIn job {external_id} already exists in unified_jobs, skipping duplicate.")
            return False

        company_name = data.get("company_name") or "Company"
        title = data.get("title") or "Unknown"
        stmt = insert(RawLinkedInJob).values(
            external_id=external_id,
            title=title,
            company_name=company_name,
            company_logo_url=data.get("company_logo_url"),
            company_website=data.get("company_website"),
            location_raw=data["location_raw"],
            city=data.get("city"),
            is_remote=data.get("is_remote", False),
            is_international=data.get("is_international", False),
            url=norm_url or job_url,
            salary_raw=data.get("salary_raw"),
            description_html=data.get("description_html"),
            description_text=data["description_text"],
            posted_at=data.get("posted_at"),
            raw_payload=data.get("raw_payload", {}),
        ).on_conflict_do_nothing(index_elements=[RawLinkedInJob.external_id])

        await session.execute(stmt)
        await session.commit()
        return True


async def save_raw_wellfound_job(data: dict[str, Any]) -> bool:
    """
    Saves a raw Wellfound job if it doesn't already exist in raw or unified tables.
    Returns True if newly inserted, False if skipped as duplicate.
    """
    external_id = data["external_id"]
    job_url = data["url"]
    norm_url = normalize_job_url(job_url)

    async with async_session_maker() as session:
        # Check raw_wellfound_jobs
        exists_raw = await session.execute(
            select(RawWellfoundJob.id).where(
                or_(
                    RawWellfoundJob.external_id == external_id,
                    RawWellfoundJob.url == job_url,
                    RawWellfoundJob.url == norm_url,
                )
            )
        )
        if exists_raw.scalar_one_or_none() is not None:
            logger.info(f"Wellfound job {external_id} already exists in raw_wellfound_jobs, skipping duplicate.")
            return False

        # Check unified_jobs
        exists_unified = await session.execute(
            select(UnifiedJob.id).where(
                or_(
                    (UnifiedJob.source == "wellfound") & (UnifiedJob.external_id == external_id),
                    UnifiedJob.url == job_url,
                    UnifiedJob.url == norm_url,
                )
            )
        )
        if exists_unified.scalar_one_or_none() is not None:
            logger.info(f"Wellfound job {external_id} already exists in unified_jobs, skipping duplicate.")
            return False

        company_name = data.get("company_name") or "Startup"
        title = data.get("title") or "Unknown"
        stmt = insert(RawWellfoundJob).values(
            external_id=external_id,
            job_slug=data["job_slug"],
            title=title,
            company_name=company_name,
            company_slug=data.get("company_slug"),
            company_logo_url=data.get("company_logo_url"),
            company_website=data.get("company_website"),
            location_raw=data["location_raw"],
            locations_list=data.get("locations_list", []),
            is_remote=data.get("is_remote", False),
            is_international=data.get("is_international", False),
            salary_raw=data.get("salary_raw"),
            native_years_min=data.get("native_years_min"),
            native_years_max=data.get("native_years_max"),
            live_start_at=data.get("live_start_at"),
            url=norm_url or job_url,
            description_html=data.get("description_html"),
            description_text=data["description_text"],
            posted_at=data.get("posted_at"),
            raw_payload=data.get("raw_payload", {}),
        ).on_conflict_do_nothing(index_elements=[RawWellfoundJob.external_id])

        await session.execute(stmt)
        await session.commit()
        return True
