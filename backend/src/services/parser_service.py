import logging
from typing import Any
from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert
from src.core.database import async_session_maker
from src.models.db_entities import (
    RawIndeedJob,
    RawLinkedInJob,
    RawWellfoundJob,
    UnifiedJob,
)
from src.services.pay_normalizer import PayNormalizer
from src.services.experience_extractor import ExperienceExtractor

logger = logging.getLogger(__name__)

class ParserService:
    @classmethod
    async def get_parsing_status(cls) -> dict[str, Any]:
        """Returns the total raw counts and unparsed counts for all 3 sources."""
        async with async_session_maker() as session:
            # Query Raw counts
            raw_indeed_count = (await session.execute(select(RawIndeedJob.id))).scalars().all()
            raw_linkedin_count = (await session.execute(select(RawLinkedInJob.id))).scalars().all()
            raw_wellfound_count = (await session.execute(select(RawWellfoundJob.id))).scalars().all()

            # Query Unified counts grouped by source
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
    async def parse_indeed_jobs(cls, batch_size: int = 50, use_llm: bool = False) -> dict[str, Any]:
        """Manually parse unparsed raw Indeed records into UnifiedJob table."""
        async with async_session_maker() as session:
            # Find raw Indeed records not yet present in UnifiedJob
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "indeed")
            stmt = (
                select(RawIndeedJob)
                .where(RawIndeedJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        processed = 0
        promoted = 0
        errors = []

        for r_job in raw_jobs:
            processed += 1
            try:
                # 1. Pay Normalization
                pay_data = PayNormalizer.normalize(
                    raw_salary=r_job.salary_raw,
                    currency="INR",
                    description=r_job.description_text,
                )
                if pay_data["min_inr"] is None and use_llm:
                    llm_pay = await PayNormalizer.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_pay["min_inr"] is not None:
                        pay_data = llm_pay

                # 2. Experience Extraction
                exp_data = ExperienceExtractor.extract(
                    description=r_job.description_text,
                    attributes=r_job.attributes or [],
                )
                if exp_data["min_years"] is None and use_llm:
                    llm_exp = await ExperienceExtractor.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_exp["min_years"] is not None:
                        exp_data = llm_exp

                url = f"https://www.indeed.com/viewjob?jk={r_job.external_id}"

                # Insert into unified_jobs
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
                    salary_min_inr_year=pay_data["min_inr"],
                    salary_max_inr_year=pay_data["max_inr"],
                    salary_raw=r_job.salary_raw,
                    salary_currency_raw=pay_data["currency"],
                    salary_extraction_method=pay_data["method"],
                    experience_min_years=exp_data["min_years"],
                    experience_max_years=exp_data["max_years"],
                    is_fresher_friendly=exp_data["is_fresher_friendly"],
                    experience_extraction_method=exp_data["method"],
                    description_text=r_job.description_text,
                    posted_at=r_job.date_published,
                ).on_conflict_do_update(
                    constraint="uq_source_external_id",
                    set_={
                        "title": r_job.title,
                        "salary_min_inr_year": pay_data["min_inr"],
                        "salary_max_inr_year": pay_data["max_inr"],
                        "experience_min_years": exp_data["min_years"],
                        "experience_max_years": exp_data["max_years"],
                        "is_fresher_friendly": exp_data["is_fresher_friendly"],
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
            "processed": processed,
            "promoted_to_unified": promoted,
            "errors": errors,
        }

    @classmethod
    async def parse_linkedin_jobs(cls, batch_size: int = 50, use_llm: bool = False) -> dict[str, Any]:
        """Manually parse unparsed raw LinkedIn records into UnifiedJob table."""
        async with async_session_maker() as session:
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "linkedin")
            stmt = (
                select(RawLinkedInJob)
                .where(RawLinkedInJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        processed = 0
        promoted = 0
        errors = []

        for r_job in raw_jobs:
            processed += 1
            try:
                pay_data = PayNormalizer.normalize(
                    raw_salary=r_job.salary_raw,
                    currency="INR",
                    description=r_job.description_text,
                )
                if pay_data["min_inr"] is None and use_llm:
                    llm_pay = await PayNormalizer.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_pay["min_inr"] is not None:
                        pay_data = llm_pay

                exp_data = ExperienceExtractor.extract(
                    description=r_job.description_text,
                    attributes=[],
                )
                if exp_data["min_years"] is None and use_llm:
                    llm_exp = await ExperienceExtractor.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_exp["min_years"] is not None:
                        exp_data = llm_exp

                insert_stmt = insert(UnifiedJob).values(
                    source="linkedin",
                    external_id=r_job.external_id,
                    raw_ref_id=r_job.id,
                    url=r_job.url,
                    title=r_job.title,
                    company_name=r_job.company_name,
                    company_logo_url=r_job.company_logo_url,
                    location_raw=r_job.location_raw,
                    city=r_job.city,
                    is_remote=r_job.is_remote,
                    is_international=r_job.is_international,
                    easy_apply_available=False,
                    salary_min_inr_year=pay_data["min_inr"],
                    salary_max_inr_year=pay_data["max_inr"],
                    salary_raw=r_job.salary_raw,
                    salary_currency_raw=pay_data["currency"],
                    salary_extraction_method=pay_data["method"],
                    experience_min_years=exp_data["min_years"],
                    experience_max_years=exp_data["max_years"],
                    is_fresher_friendly=exp_data["is_fresher_friendly"],
                    experience_extraction_method=exp_data["method"],
                    description_text=r_job.description_text,
                    posted_at=r_job.posted_at,
                ).on_conflict_do_update(
                    constraint="uq_source_external_id",
                    set_={
                        "title": r_job.title,
                        "salary_min_inr_year": pay_data["min_inr"],
                        "salary_max_inr_year": pay_data["max_inr"],
                        "experience_min_years": exp_data["min_years"],
                        "experience_max_years": exp_data["max_years"],
                        "is_fresher_friendly": exp_data["is_fresher_friendly"],
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
            "processed": processed,
            "promoted_to_unified": promoted,
            "errors": errors,
        }

    @classmethod
    async def parse_wellfound_jobs(cls, batch_size: int = 50, use_llm: bool = False) -> dict[str, Any]:
        """Manually parse unparsed raw Wellfound records into UnifiedJob table."""
        async with async_session_maker() as session:
            existing_ref_subquery = select(UnifiedJob.raw_ref_id).where(UnifiedJob.source == "wellfound")
            stmt = (
                select(RawWellfoundJob)
                .where(RawWellfoundJob.id.not_in(existing_ref_subquery))
                .limit(batch_size)
            )
            raw_jobs = (await session.execute(stmt)).scalars().all()

        processed = 0
        promoted = 0
        errors = []

        for r_job in raw_jobs:
            processed += 1
            try:
                pay_data = PayNormalizer.normalize(
                    raw_salary=r_job.salary_raw,
                    currency="INR",
                    description=r_job.description_text,
                )
                if pay_data["min_inr"] is None and use_llm:
                    llm_pay = await PayNormalizer.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_pay["min_inr"] is not None:
                        pay_data = llm_pay

                exp_data = ExperienceExtractor.extract(
                    native_min=r_job.native_years_min,
                    native_max=r_job.native_years_max,
                    description=r_job.description_text,
                )
                if exp_data["min_years"] is None and use_llm:
                    llm_exp = await ExperienceExtractor.extract_with_llm(
                        r_job.title, r_job.description_text
                    )
                    if llm_exp["min_years"] is not None:
                        exp_data = llm_exp

                insert_stmt = insert(UnifiedJob).values(
                    source="wellfound",
                    external_id=r_job.external_id,
                    raw_ref_id=r_job.id,
                    url=r_job.url,
                    title=r_job.title,
                    company_name=r_job.company_name,
                    company_logo_url=r_job.company_logo_url,
                    location_raw=r_job.location_raw,
                    city=None,
                    is_remote=r_job.is_remote,
                    is_international=r_job.is_international,
                    easy_apply_available=False,
                    salary_min_inr_year=pay_data["min_inr"],
                    salary_max_inr_year=pay_data["max_inr"],
                    salary_raw=r_job.salary_raw,
                    salary_currency_raw=pay_data["currency"],
                    salary_extraction_method=pay_data["method"],
                    experience_min_years=exp_data["min_years"],
                    experience_max_years=exp_data["max_years"],
                    is_fresher_friendly=exp_data["is_fresher_friendly"],
                    experience_extraction_method=exp_data["method"],
                    description_text=r_job.description_text,
                    posted_at=r_job.posted_at,
                ).on_conflict_do_update(
                    constraint="uq_source_external_id",
                    set_={
                        "title": r_job.title,
                        "salary_min_inr_year": pay_data["min_inr"],
                        "salary_max_inr_year": pay_data["max_inr"],
                        "experience_min_years": exp_data["min_years"],
                        "experience_max_years": exp_data["max_years"],
                        "is_fresher_friendly": exp_data["is_fresher_friendly"],
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
            "processed": processed,
            "promoted_to_unified": promoted,
            "errors": errors,
        }
