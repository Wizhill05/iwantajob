import asyncio
import logging
from typing import Any
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from src.core.database import async_session_maker
from src.models.db_entities import (
    RawIndeedJob,
    RawLinkedInJob,
    RawWellfoundJob,
    UnifiedJob,
)
from src.services.llm_parser import LLMJobParser
from src.utils.url_normalizer import normalize_job_url

logger = logging.getLogger(__name__)

LLM_BATCH_CHUNK_SIZE = 25


class ParserService:
    @classmethod
    async def get_parsing_status(cls) -> dict[str, Any]:
        """Returns the total raw counts and unparsed counts for all 3 sources."""
        async with async_session_maker() as session:
            raw_indeed_count = (await session.execute(select(RawIndeedJob.id))).scalars().all()
            raw_linkedin_count = (await session.execute(select(RawLinkedInJob.id))).scalars().all()
            raw_wellfound_count = (await session.execute(select(RawWellfoundJob.id))).scalars().all()

            unified_rows = (await session.execute(select(UnifiedJob.source, UnifiedJob.raw_ref_id))).all()

            indeed_parsed_ids = {row[1] for row in unified_rows if row[0] == "indeed"}
            linkedin_parsed_ids = {row[1] for row in unified_rows if row[0] == "linkedin"}
            wellfound_parsed_ids = {row[1] for row in unified_rows if row[0] == "wellfound"}

            return {
                "indeed": {
                    "total_raw": len(raw_indeed_count),
                    "parsed": len(indeed_parsed_ids),
                    "unparsed": len(raw_indeed_count) - len(indeed_parsed_ids),
                },
                "linkedin": {
                    "total_raw": len(raw_linkedin_count),
                    "parsed": len(linkedin_parsed_ids),
                    "unparsed": len(raw_linkedin_count) - len(linkedin_parsed_ids),
                },
                "wellfound": {
                    "total_raw": len(raw_wellfound_count),
                    "parsed": len(wellfound_parsed_ids),
                    "unparsed": len(raw_wellfound_count) - len(wellfound_parsed_ids),
                },
                "unified_total": len(unified_rows),
            }

    @classmethod
    async def parse_indeed_jobs(cls, batch_size: int = 50, use_llm: bool = True) -> dict[str, Any]:
        """Manually parse unparsed raw Indeed records into UnifiedJob table in batches of 25 using Gemini LLM."""
        async with async_session_maker() as session:
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "indeed")
            stmt = (
                select(RawIndeedJob)
                .where(RawIndeedJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        if not raw_jobs:
            return {"source": "indeed", "processed": 0, "promoted_to_unified": 0, "errors": []}

        promoted = 0
        errors = []

        for i in range(0, len(raw_jobs), LLM_BATCH_CHUNK_SIZE):
            chunk = raw_jobs[i : i + LLM_BATCH_CHUNK_SIZE]
            chunk_items = [
                {
                    "id": str(r.id),
                    "title": r.title,
                    "salary_raw": r.salary_raw,
                    "attributes": r.attributes or [],
                    "description": r.description_text,
                }
                for r in chunk
            ]

            if use_llm:
                parsed_map = await LLMJobParser.parse_jobs_batch(chunk_items)
            else:
                parsed_map = {
                    str(r.id): LLMJobParser._empty_result(
                        salary_raw=r.salary_raw,
                        title=r.title,
                        description=r.description_text,
                        attributes=r.attributes or [],
                    )
                    for r in chunk
                }

            for r_job in chunk:
                try:
                    url = f"https://www.indeed.com/viewjob?jk={r_job.external_id}"
                    raw_apply_url = r_job.apply_url
                    norm_apply_url = normalize_job_url(raw_apply_url) if raw_apply_url else None

                    # Check if URL already exists in unified_jobs
                    async with async_session_maker() as s_check:
                        existing_url_check = await s_check.execute(
                            select(UnifiedJob.id).where(
                                (UnifiedJob.url == url) |
                                ((UnifiedJob.url == norm_apply_url) if norm_apply_url and "indeed.com" not in norm_apply_url else False)
                            )
                        )
                        existing_id = existing_url_check.scalar_one_or_none()
                        if existing_id is not None:
                            logger.info(f"Indeed job {r_job.external_id} URL already exists in unified_jobs, linking ref.")
                            async with async_session_maker() as s_link:
                                await s_link.execute(
                                    update(UnifiedJob).where(UnifiedJob.id == existing_id).values(raw_ref_id=r_job.id)
                                )
                                await s_link.commit()
                            promoted += 1
                            continue

                    parsed = parsed_map.get(str(r_job.id)) or LLMJobParser._empty_result(
                        salary_raw=r_job.salary_raw,
                        title=r_job.title,
                        description=r_job.description_text,
                        attributes=r_job.attributes or [],
                    )

                    insert_stmt = insert(UnifiedJob).values(
                        source="indeed",
                        external_id=r_job.external_id,
                        raw_ref_id=r_job.id,
                        url=url,
                        title=r_job.title,
                        company_name=r_job.company_name,
                        company_logo_url=None,
                        location_raw=r_job.location_raw,
                        city=r_job.location_city,
                        is_remote=r_job.is_remote,
                        is_international=False,
                        easy_apply_available=r_job.easy_apply_available,
                        salary_min_inr_year=parsed["salary_min_inr_year"],
                        salary_max_inr_year=parsed["salary_max_inr_year"],
                        salary_raw=r_job.salary_raw,
                        salary_currency_raw=parsed["salary_currency_raw"],
                        experience_min_years=parsed["experience_min_years"],
                        experience_max_years=parsed["experience_max_years"],
                        is_fresher_friendly=parsed["is_fresher_friendly"],
                        description_text=r_job.description_text,
                        posted_at=r_job.date_published,
                    ).on_conflict_do_update(
                        constraint="uq_source_external_id",
                        set_={
                            "title": r_job.title,
                            "salary_min_inr_year": parsed["salary_min_inr_year"],
                            "salary_max_inr_year": parsed["salary_max_inr_year"],
                            "experience_min_years": parsed["experience_min_years"],
                            "experience_max_years": parsed["experience_max_years"],
                            "is_fresher_friendly": parsed["is_fresher_friendly"],
                        }
                    )

                    async with async_session_maker() as s2:
                        await s2.execute(insert_stmt)
                        await s2.commit()
                    promoted += 1
                except Exception as e:
                    logger.error(f"Failed to parse indeed job {r_job.external_id}: {e}")
                    errors.append({"id": str(r_job.id), "error": str(e)})

        return {
            "source": "indeed",
            "processed": len(raw_jobs),
            "promoted_to_unified": promoted,
            "errors": errors,
        }

    @classmethod
    async def parse_linkedin_jobs(cls, batch_size: int = 50, use_llm: bool = True) -> dict[str, Any]:
        """Manually parse unparsed raw LinkedIn records into UnifiedJob table in batches of 25 using Gemini LLM."""
        async with async_session_maker() as session:
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "linkedin")
            stmt = (
                select(RawLinkedInJob)
                .where(RawLinkedInJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        if not raw_jobs:
            return {"source": "linkedin", "processed": 0, "promoted_to_unified": 0, "errors": []}

        promoted = 0
        errors = []

        for i in range(0, len(raw_jobs), LLM_BATCH_CHUNK_SIZE):
            chunk = raw_jobs[i : i + LLM_BATCH_CHUNK_SIZE]
            chunk_items = [
                {
                    "id": str(r.id),
                    "title": r.title,
                    "salary_raw": r.salary_raw,
                    "description": r.description_text,
                }
                for r in chunk
            ]

            if use_llm:
                parsed_map = await LLMJobParser.parse_jobs_batch(chunk_items)
            else:
                parsed_map = {
                    str(r.id): LLMJobParser._empty_result(
                        salary_raw=r.salary_raw,
                        title=r.title,
                        description=r.description_text,
                    )
                    for r in chunk
                }

            for r_job in chunk:
                try:
                    norm_url = normalize_job_url(r_job.url) or r_job.url
                    # Check if URL already exists in unified_jobs under another entry
                    async with async_session_maker() as s_check:
                        existing_url_check = await s_check.execute(
                            select(UnifiedJob.id).where(
                                (UnifiedJob.url == norm_url) &
                                ~((UnifiedJob.source == "linkedin") & (UnifiedJob.external_id == r_job.external_id))
                            )
                        )
                        existing_id = existing_url_check.scalar_one_or_none()
                        if existing_id is not None:
                            logger.info(f"LinkedIn job {r_job.external_id} URL already exists in unified_jobs, linking ref.")
                            async with async_session_maker() as s_link:
                                await s_link.execute(
                                    update(UnifiedJob).where(UnifiedJob.id == existing_id).values(raw_ref_id=r_job.id)
                                )
                                await s_link.commit()
                            promoted += 1
                            continue

                    parsed = parsed_map.get(str(r_job.id)) or LLMJobParser._empty_result(
                        salary_raw=r_job.salary_raw,
                        title=r_job.title,
                        description=r_job.description_text,
                    )

                    insert_stmt = insert(UnifiedJob).values(
                        source="linkedin",
                        external_id=r_job.external_id,
                        raw_ref_id=r_job.id,
                        url=norm_url,
                        title=r_job.title,
                        company_name=r_job.company_name,
                        company_logo_url=r_job.company_logo_url,
                        location_raw=r_job.location_raw,
                        city=r_job.city,
                        is_remote=r_job.is_remote,
                        is_international=r_job.is_international,
                        easy_apply_available=False,
                        salary_min_inr_year=parsed["salary_min_inr_year"],
                        salary_max_inr_year=parsed["salary_max_inr_year"],
                        salary_raw=r_job.salary_raw,
                        salary_currency_raw=parsed["salary_currency_raw"],
                        experience_min_years=parsed["experience_min_years"],
                        experience_max_years=parsed["experience_max_years"],
                        is_fresher_friendly=parsed["is_fresher_friendly"],
                        description_text=r_job.description_text,
                        posted_at=r_job.posted_at,
                    ).on_conflict_do_update(
                        constraint="uq_source_external_id",
                        set_={
                            "title": r_job.title,
                            "salary_min_inr_year": parsed["salary_min_inr_year"],
                            "salary_max_inr_year": parsed["salary_max_inr_year"],
                            "experience_min_years": parsed["experience_min_years"],
                            "experience_max_years": parsed["experience_max_years"],
                            "is_fresher_friendly": parsed["is_fresher_friendly"],
                        }
                    )

                    async with async_session_maker() as s2:
                        await s2.execute(insert_stmt)
                        await s2.commit()
                    promoted += 1
                except Exception as e:
                    logger.error(f"Failed to parse linkedin job {r_job.external_id}: {e}")
                    errors.append({"id": str(r_job.id), "error": str(e)})

        return {
            "source": "linkedin",
            "processed": len(raw_jobs),
            "promoted_to_unified": promoted,
            "errors": errors,
        }

    @classmethod
    async def parse_wellfound_jobs(cls, batch_size: int = 50, use_llm: bool = True) -> dict[str, Any]:
        """Manually parse unparsed raw Wellfound records into UnifiedJob table in batches of 25 using Gemini LLM."""
        async with async_session_maker() as session:
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "wellfound")
            stmt = (
                select(RawWellfoundJob)
                .where(RawWellfoundJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        if not raw_jobs:
            return {"source": "wellfound", "processed": 0, "promoted_to_unified": 0, "errors": []}

        promoted = 0
        errors = []

        for i in range(0, len(raw_jobs), LLM_BATCH_CHUNK_SIZE):
            chunk = raw_jobs[i : i + LLM_BATCH_CHUNK_SIZE]
            chunk_items = [
                {
                    "id": str(r.id),
                    "title": r.title,
                    "salary_raw": r.salary_raw,
                    "native_min_years": r.native_years_min,
                    "native_max_years": r.native_years_max,
                    "description": r.description_text,
                }
                for r in chunk
            ]

            if use_llm:
                parsed_map = await LLMJobParser.parse_jobs_batch(chunk_items)
            else:
                parsed_map = {
                    str(r.id): LLMJobParser._empty_result(
                        salary_raw=r.salary_raw,
                        title=r.title,
                        description=r.description_text,
                        native_min_years=r.native_years_min,
                        native_max_years=r.native_years_max,
                    )
                    for r in chunk
                }

            for r_job in chunk:
                try:
                    norm_url = normalize_job_url(r_job.url) or r_job.url
                    # Check if URL already exists in unified_jobs under another entry
                    async with async_session_maker() as s_check:
                        existing_url_check = await s_check.execute(
                            select(UnifiedJob.id).where(
                                (UnifiedJob.url == norm_url) &
                                ~((UnifiedJob.source == "wellfound") & (UnifiedJob.external_id == r_job.external_id))
                            )
                        )
                        existing_id = existing_url_check.scalar_one_or_none()
                        if existing_id is not None:
                            logger.info(f"Wellfound job {r_job.external_id} URL already exists in unified_jobs, linking ref.")
                            async with async_session_maker() as s_link:
                                await s_link.execute(
                                    update(UnifiedJob).where(UnifiedJob.id == existing_id).values(raw_ref_id=r_job.id)
                                )
                                await s_link.commit()
                            promoted += 1
                            continue

                    parsed = parsed_map.get(str(r_job.id)) or LLMJobParser._empty_result(
                        salary_raw=r_job.salary_raw,
                        title=r_job.title,
                        description=r_job.description_text,
                        native_min_years=r_job.native_years_min,
                        native_max_years=r_job.native_years_max,
                    )

                    insert_stmt = insert(UnifiedJob).values(
                        source="wellfound",
                        external_id=r_job.external_id,
                        raw_ref_id=r_job.id,
                        url=norm_url,
                        title=r_job.title,
                        company_name=r_job.company_name,
                        company_logo_url=r_job.company_logo_url,
                        location_raw=r_job.location_raw,
                        city=None,
                        is_remote=r_job.is_remote,
                        is_international=r_job.is_international,
                        easy_apply_available=False,
                        salary_min_inr_year=parsed["salary_min_inr_year"],
                        salary_max_inr_year=parsed["salary_max_inr_year"],
                        salary_raw=r_job.salary_raw,
                        salary_currency_raw=parsed["salary_currency_raw"],
                        experience_min_years=parsed["experience_min_years"],
                        experience_max_years=parsed["experience_max_years"],
                        is_fresher_friendly=parsed["is_fresher_friendly"],
                        description_text=r_job.description_text,
                        posted_at=r_job.posted_at,
                    ).on_conflict_do_update(
                        constraint="uq_source_external_id",
                        set_={
                            "title": r_job.title,
                            "salary_min_inr_year": parsed["salary_min_inr_year"],
                            "salary_max_inr_year": parsed["salary_max_inr_year"],
                            "experience_min_years": parsed["experience_min_years"],
                            "experience_max_years": parsed["experience_max_years"],
                            "is_fresher_friendly": parsed["is_fresher_friendly"],
                        }
                    )

                    async with async_session_maker() as s2:
                        await s2.execute(insert_stmt)
                        await s2.commit()
                    promoted += 1
                except Exception as e:
                    logger.error(f"Failed to parse wellfound job {r_job.external_id}: {e}")
                    errors.append({"id": str(r_job.id), "error": str(e)})

        return {
            "source": "wellfound",
            "processed": len(raw_jobs),
            "promoted_to_unified": promoted,
            "errors": errors,
        }
