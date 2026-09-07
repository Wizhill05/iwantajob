import uuid
from datetime import datetime
from typing import Any
from sqlalchemy import (
    Column,
    String,
    Boolean,
    BigInteger,
    Integer,
    DateTime,
    Text,
    func,
    UniqueConstraint,
    Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from src.core.database import Base

class RawIndeedJob(Base):
    __tablename__ = "raw_indeed_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id = Column(String, unique=True, nullable=False, index=True)
    tracking_key = Column(String, nullable=True)
    title = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    location_raw = Column(String, nullable=False)
    location_city = Column(String, nullable=True)
    location_country = Column(String, nullable=True)
    is_remote = Column(Boolean, default=False, nullable=False)
    apply_url = Column(String, nullable=True)
    easy_apply_available = Column(Boolean, default=False, nullable=False)
    attributes = Column(JSONB, default=list, nullable=False)
    salary_raw = Column(String, nullable=True)
    description_html = Column(Text, nullable=True)
    description_text = Column(Text, nullable=False)
    date_published = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=False)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class RawLinkedInJob(Base):
    __tablename__ = "raw_linkedin_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    company_logo_url = Column(String, nullable=True)
    company_website = Column(String, nullable=True)
    location_raw = Column(String, nullable=False)
    city = Column(String, nullable=True)
    is_remote = Column(Boolean, default=False, nullable=False)
    is_international = Column(Boolean, default=False, nullable=False)
    url = Column(String, nullable=False)
    salary_raw = Column(String, nullable=True)
    description_html = Column(Text, nullable=True)
    description_text = Column(Text, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=False)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class RawWellfoundJob(Base):
    __tablename__ = "raw_wellfound_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id = Column(String, unique=True, nullable=False, index=True)
    job_slug = Column(String, nullable=False)
    title = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    company_slug = Column(String, nullable=True)
    company_logo_url = Column(String, nullable=True)
    company_website = Column(String, nullable=True)
    location_raw = Column(String, nullable=False)
    locations_list = Column(JSONB, default=list, nullable=False)
    is_remote = Column(Boolean, default=False, nullable=False)
    is_international = Column(Boolean, default=False, nullable=False)
    salary_raw = Column(String, nullable=True)
    native_years_min = Column(Integer, nullable=True)
    native_years_max = Column(Integer, nullable=True)
    live_start_at = Column(BigInteger, nullable=True)
    url = Column(String, nullable=False)
    description_html = Column(Text, nullable=True)
    description_text = Column(Text, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=False)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class UnifiedJob(Base):
    __tablename__ = "unified_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String, nullable=False, index=True)  # 'indeed', 'linkedin', 'wellfound'
    external_id = Column(String, nullable=False)
    raw_ref_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    url = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False, index=True)
    company_logo_url = Column(String, nullable=True)
    location_raw = Column(String, nullable=False)
    city = Column(String, nullable=True, index=True)
    is_remote = Column(Boolean, default=False, nullable=False, index=True)
    is_international = Column(Boolean, default=False, nullable=False)
    easy_apply_available = Column(Boolean, default=False, nullable=False, index=True)

    # Normalized Salary in INR / Year Integer
    salary_min_inr_year = Column(BigInteger, nullable=True, index=True)
    salary_max_inr_year = Column(BigInteger, nullable=True, index=True)
    salary_raw = Column(String, nullable=True)
    salary_currency_raw = Column(String, nullable=True)

    # Normalized Experience (Fresher Focus)
    experience_min_years = Column(Integer, nullable=True, index=True)
    experience_max_years = Column(Integer, nullable=True, index=True)
    is_fresher_friendly = Column(Boolean, default=False, nullable=False, index=True)

    # Triage State (Saved & Archived)
    is_saved = Column(Boolean, default=False, nullable=False, index=True)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)

    description_text = Column(Text, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    parsed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_source_external_id"),
    )

class CronJob(Base):
    __tablename__ = "cron_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)  # 'indeed', 'linkedin', 'wellfound', or 'all'
    hour = Column(Integer, nullable=False)
    minute = Column(Integer, nullable=False)
    days_of_week = Column(JSONB, default=list, nullable=False)
    search_params = Column(JSONB, default=dict, nullable=False)
    auto_parse = Column(Boolean, default=False, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_status = Column(String, nullable=True)
    last_result_summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

