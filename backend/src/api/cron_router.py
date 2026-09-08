import logging
from datetime import datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from src.core.database import async_session_maker
from src.models.db_entities import CronJob
from src.services.scheduler import execute_cron_job

logger = logging.getLogger(__name__)

router = APIRouter()


class CronJobCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Friendly name for the cron job")
    provider: Literal["indeed", "linkedin", "wellfound", "all"] = Field(
        ..., description="Scraping target: indeed, linkedin, wellfound, or all"
    )
    hour: int = Field(..., ge=0, le=23, description="Hour of the day in UTC (0-23)")
    minute: int = Field(..., ge=0, le=59, description="Minute of the hour (0-59)")
    days_of_week: list[int] = Field(
        default_factory=list,
        description="Days of the week (0=Mon, 6=Sun). Empty list means run every day.",
    )
    search_params: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters passed into scraper (e.g. keywords, location, limit)",
    )
    auto_parse: bool = Field(
        default=False,
        description="Whether to immediately trigger ParserService on scraped results",
    )
    is_enabled: bool = Field(
        default=True,
        description="Whether the schedule is active",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("name must not be empty")
        return stripped

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v: list[int]) -> list[int]:
        for day in v:
            if not (0 <= day <= 6):
                raise ValueError("days_of_week elements must be between 0 (Monday) and 6 (Sunday)")
        return v


class CronJobUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    provider: Literal["indeed", "linkedin", "wellfound", "all"] | None = None
    hour: int | None = Field(default=None, ge=0, le=23)
    minute: int | None = Field(default=None, ge=0, le=59)
    days_of_week: list[int] | None = None
    search_params: dict[str, Any] | None = None
    auto_parse: bool | None = None
    is_enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("name must not be empty")
            return stripped
        return None

    @field_validator("days_of_week")
    @classmethod
    def validate_days_of_week(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            for day in v:
                if not (0 <= day <= 6):
                    raise ValueError("days_of_week elements must be between 0 (Monday) and 6 (Sunday)")
        return v


class CronJobResponse(BaseModel):
    id: str
    name: str
    provider: str
    hour: int
    minute: int
    days_of_week: list[int]
    search_params: dict[str, Any]
    auto_parse: bool
    is_enabled: bool
    last_run_at: datetime | None = None
    last_status: str | None = None
    last_result_summary: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


def _parse_uuid(job_id: str) -> UUID:
    try:
        return UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Invalid cron job ID: {job_id}")


def serialize_cron_job(job: CronJob) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "name": job.name,
        "provider": job.provider,
        "hour": job.hour,
        "minute": job.minute,
        "days_of_week": job.days_of_week if job.days_of_week is not None else [],
        "search_params": job.search_params if job.search_params is not None else {},
        "auto_parse": bool(job.auto_parse),
        "is_enabled": bool(job.is_enabled),
        "last_run_at": job.last_run_at,
        "last_status": job.last_status,
        "last_result_summary": job.last_result_summary,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@router.get("", response_model=list[CronJobResponse], summary="List all cron jobs")
async def list_cron_jobs():
    """Returns all configured cron jobs ordered by creation date descending."""
    async with async_session_maker() as session:
        stmt = select(CronJob).order_by(CronJob.created_at.desc())
        result = await session.execute(stmt)
        jobs = result.scalars().all()
        return [serialize_cron_job(j) for j in jobs]


@router.post(
    "",
    response_model=CronJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new scheduled cron job",
)
async def create_cron_job(payload: CronJobCreateRequest):
    """Creates a new automated scraper cron job."""
    async with async_session_maker() as session:
        job = CronJob(
            id=uuid4(),
            name=payload.name,
            provider=payload.provider,
            hour=payload.hour,
            minute=payload.minute,
            days_of_week=payload.days_of_week,
            search_params=payload.search_params,
            auto_parse=payload.auto_parse,
            is_enabled=payload.is_enabled,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return serialize_cron_job(job)


@router.put("/{job_id}", response_model=CronJobResponse, summary="Update an existing cron job")
async def update_cron_job(job_id: str, payload: CronJobUpdateRequest):
    """Updates fields of an existing cron job."""
    jid = _parse_uuid(job_id)
    async with async_session_maker() as session:
        job = await session.get(CronJob, jid)
        if not job:
            raise HTTPException(status_code=404, detail=f"CronJob {job_id} not found")

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(job, key, value)

        await session.commit()
        await session.refresh(job)
        return serialize_cron_job(job)


@router.delete("/{job_id}", summary="Delete a cron job")
async def delete_cron_job(job_id: str):
    """Permanently deletes a cron job."""
    jid = _parse_uuid(job_id)
    async with async_session_maker() as session:
        job = await session.get(CronJob, jid)
        if not job:
            raise HTTPException(status_code=404, detail=f"CronJob {job_id} not found")

        await session.delete(job)
        await session.commit()
        return {"deleted": True, "id": str(jid)}


@router.patch("/{job_id}/toggle", response_model=CronJobResponse, summary="Toggle cron job enabled state")
async def toggle_cron_job(job_id: str):
    """Toggles a cron job between active (enabled) and inactive (disabled)."""
    jid = _parse_uuid(job_id)
    async with async_session_maker() as session:
        job = await session.get(CronJob, jid)
        if not job:
            raise HTTPException(status_code=404, detail=f"CronJob {job_id} not found")

        job.is_enabled = not job.is_enabled
        await session.commit()
        await session.refresh(job)
        return serialize_cron_job(job)


@router.post("/{job_id}/run", summary="Trigger immediate cron job execution")
async def run_cron_job(job_id: str):
    """Manually triggers immediate execution of the specified cron job."""
    jid = _parse_uuid(job_id)
    async with async_session_maker() as session:
        job = await session.get(CronJob, jid)
        if not job:
            raise HTTPException(status_code=404, detail=f"CronJob {job_id} not found")

    result = await execute_cron_job(job_id)
    return result
