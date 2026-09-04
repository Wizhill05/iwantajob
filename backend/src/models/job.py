from pydantic import BaseModel, Field
from datetime import datetime
import re
from bs4 import BeautifulSoup

def clean_html(html_content: str | None) -> str:
    """Strip HTML tags and normalize whitespace."""
    if not html_content:
        return ""
    soup = BeautifulSoup(html_content, "html.parser")
    text = soup.get_text(separator=" ")
    return re.sub(r"\s+", " ", text).strip()

INDIAN_TECH_CITIES = {
    "pune", "mumbai", "bengaluru", "bangalore", "delhi", "new delhi",
    "gurgaon", "gurugram", "noida", "hyderabad", "chennai", "kolkata",
    "ahmedabad", "jaipur", "kochi", "coimbatore", "chandigarh", "indore"
}

def parse_location(location_str: str | None) -> tuple[str | None, bool, bool]:
    """
    Parse location string into (city, is_remote, is_international).
    """
    if not location_str:
        return None, False, False

    loc = location_str.lower().strip()
    is_remote = any(k in loc for k in ["remote", "work from home", "wfh", "anywhere", "telecommute"])
    
    city = None
    for c in INDIAN_TECH_CITIES:
        pattern = r"\b" + re.escape(c) + r"\b"
        if re.search(pattern, loc):
            city = "bengaluru" if c == "bangalore" else ("delhi-ncr" if c in ["delhi", "new delhi", "gurgaon", "gurugram", "noida"] else c)
            break

    is_international = False
    intl_indicators = ["united states", "usa", "us", "uk", "united kingdom", "london", "canada", "germany", "berlin", "singapore", "europe", "australia"]
    if any(re.search(r"\b" + re.escape(ind) + r"\b", loc) for ind in intl_indicators):
        if not city:
            is_international = True

    return city, is_remote, is_international

class JobItem(BaseModel):
    external_id: str = Field(description="Unique job key identifier from Indeed")
    title: str = Field(description="Role title")
    company_name: str = Field(description="Employer name")
    source: str = Field(default="indeed", description="Source aggregator/board")
    location_raw: str = Field(description="Raw location string from source")
    city: str | None = Field(default=None, description="Normalized city (e.g. pune, bengaluru)")
    is_remote: bool = Field(default=False, description="Whether the job is remote/WFH")
    is_international: bool = Field(default=False, description="Whether the role is located outside India")
    salary_raw: str | None = Field(default=None, description="Formatted human-readable salary string")
    salary_min: float | None = Field(default=None, description="Minimum numeric salary")
    salary_max: float | None = Field(default=None, description="Maximum numeric salary")
    currency: str = Field(default="INR", description="Currency code (e.g. INR, USD, EUR)")
    url: str = Field(description="Direct URL to the job posting")
    description_text: str = Field(description="Sanitized plain text description snippet/body")
    description_html: str | None = Field(default=None, description="Raw HTML description if available")
    posted_at: datetime | None = Field(default=None, description="ISO datetime of when the role was posted")
    experience_min_years: int | None = Field(default=None, description="Minimum experience required in years")
    experience_max_years: int | None = Field(default=None, description="Maximum experience required in years")
    company_logo_url: str | None = Field(default=None, description="Company logo image URL")
    company_website: str | None = Field(default=None, description="Company website or profile URL")

class JobSearchResponse(BaseModel):
    query: str = Field(description="The role / query executed")
    location: str = Field(description="The location queried")
    total_count: int = Field(description="Number of jobs returned in this batch")
    next_cursor: str | None = Field(default=None, description="Cursor token for fetching the next page of results")
    sort: str = Field(description="Sort order used ('relevance' or 'date')")
    radius_km: int = Field(description="Search radius in kilometers")
    items: list[JobItem] = Field(description="List of scraped job items")

class ErrorDetail(BaseModel):
    error: str = Field(description="Machine-readable error code")
    detail: str = Field(description="Human-readable explanation of failure")
    retry_after: float | None = Field(default=None, description="Suggested backoff duration in seconds if rate limited")
