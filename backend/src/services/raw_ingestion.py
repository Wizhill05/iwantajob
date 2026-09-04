import logging
from typing import Any
from sqlalchemy.dialects.postgresql import insert
from src.core.database import async_session_maker
from src.models.db_entities import RawIndeedJob, RawLinkedInJob, RawWellfoundJob

logger = logging.getLogger(__name__)

async def save_raw_indeed_job(data: dict[str, Any]) -> None:
    stmt = insert(RawIndeedJob).values(
        external_id=data["external_id"],
        tracking_key=data.get("tracking_key"),
        title=data["title"],
        company_name=data["company_name"],
        location_raw=data["location_raw"],
        location_city=data.get("location_city"),
        location_country=data.get("location_country"),
        is_remote=data.get("is_remote", False),
        apply_url=data.get("apply_url"),
        easy_apply_available=data.get("easy_apply_available", False),
        attributes=data.get("attributes", []),
        salary_raw=data.get("salary_raw"),
        description_html=data.get("description_html"),
        description_text=data["description_text"],
        date_published=data.get("date_published"),
        raw_payload=data.get("raw_payload", {}),
    ).on_conflict_do_update(
        index_elements=[RawIndeedJob.external_id],
        set_={
            "title": data["title"],
            "company_name": data["company_name"],
            "location_raw": data["location_raw"],
            "apply_url": data.get("apply_url"),
            "easy_apply_available": data.get("easy_apply_available", False),
            "attributes": data.get("attributes", []),
            "salary_raw": data.get("salary_raw"),
            "description_html": data.get("description_html"),
            "description_text": data["description_text"],
            "raw_payload": data.get("raw_payload", {}),
        }
    )
    async with async_session_maker() as session:
        await session.execute(stmt)
        await session.commit()

async def save_raw_linkedin_job(data: dict[str, Any]) -> None:
    stmt = insert(RawLinkedInJob).values(
        external_id=data["external_id"],
        title=data["title"],
        company_name=data["company_name"],
        company_logo_url=data.get("company_logo_url"),
        company_website=data.get("company_website"),
        location_raw=data["location_raw"],
        city=data.get("city"),
        is_remote=data.get("is_remote", False),
        is_international=data.get("is_international", False),
        url=data["url"],
        salary_raw=data.get("salary_raw"),
        description_html=data.get("description_html"),
        description_text=data["description_text"],
        posted_at=data.get("posted_at"),
        raw_payload=data.get("raw_payload", {}),
    ).on_conflict_do_update(
        index_elements=[RawLinkedInJob.external_id],
        set_={
            "title": data["title"],
            "company_name": data["company_name"],
            "company_logo_url": data.get("company_logo_url"),
            "company_website": data.get("company_website"),
            "location_raw": data["location_raw"],
            "salary_raw": data.get("salary_raw"),
            "description_html": data.get("description_html"),
            "description_text": data["description_text"],
            "raw_payload": data.get("raw_payload", {}),
        }
    )
    async with async_session_maker() as session:
        await session.execute(stmt)
        await session.commit()

async def save_raw_wellfound_job(data: dict[str, Any]) -> None:
    stmt = insert(RawWellfoundJob).values(
        external_id=data["external_id"],
        job_slug=data["job_slug"],
        title=data["title"],
        company_name=data["company_name"],
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
        url=data["url"],
        description_html=data.get("description_html"),
        description_text=data["description_text"],
        posted_at=data.get("posted_at"),
        raw_payload=data.get("raw_payload", {}),
    ).on_conflict_do_update(
        index_elements=[RawWellfoundJob.external_id],
        set_={
            "title": data["title"],
            "company_name": data["company_name"],
            "company_logo_url": data.get("company_logo_url"),
            "company_website": data.get("company_website"),
            "location_raw": data["location_raw"],
            "locations_list": data.get("locations_list", []),
            "salary_raw": data.get("salary_raw"),
            "native_years_min": data.get("native_years_min"),
            "native_years_max": data.get("native_years_max"),
            "description_html": data.get("description_html"),
            "description_text": data["description_text"],
            "raw_payload": data.get("raw_payload", {}),
        }
    )
    async with async_session_maker() as session:
        await session.execute(stmt)
        await session.commit()
