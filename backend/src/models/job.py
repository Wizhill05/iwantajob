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
    external_id: str = Field(
        description="Unique alphanumeric job identifier assigned by the upstream platform (e.g. '4430825102' for LinkedIn, 'd99dd29169aad24d' for Indeed, '4666122' for Wellfound).",
        examples=["4430825102"],
    )
    title: str = Field(
        description="Cleaned, human-readable job role title.",
        examples=["Senior AI Engineer - Agentic Systems"],
    )
    company_name: str = Field(
        description="Name of the hiring company or recruitment agency.",
        examples=["Shamrock AI"],
    )
    source: str = Field(
        default="indeed",
        description="Ingestion aggregator source platform. One of: 'indeed', 'wellfound', 'linkedin'.",
        examples=["linkedin"],
    )
    location_raw: str = Field(
        description="Original unparsed location string as returned by the platform.",
        examples=["Bengaluru, Karnataka, India"],
    )
    city: str | None = Field(
        default=None,
        description="Standardized lowercase tech hub slug (e.g. 'bengaluru', 'pune', 'delhi-ncr', 'hyderabad', 'mumbai').",
        examples=["bengaluru"],
    )
    is_remote: bool = Field(
        default=False,
        description="Whether the posting indicates remote or work-from-home flexibility.",
        examples=[True],
    )
    is_international: bool = Field(
        default=False,
        description="Whether the job is explicitly located outside the domestic target market (India).",
        examples=[False],
    )
    salary_raw: str | None = Field(
        default=None,
        description="Raw compensation string as stated on the job card (e.g. '₹25L – ₹45L • No equity', '$120k – $160k').",
        examples=["₹30L – ₹45L"],
    )
    salary_min: float | None = Field(
        default=None,
        description="Normalized minimum numerical annual/base salary amount.",
        examples=[3000000.0],
    )
    salary_max: float | None = Field(
        default=None,
        description="Normalized maximum numerical annual/base salary amount.",
        examples=[4500000.0],
    )
    currency: str = Field(
        default="INR",
        description="ISO 4217 currency code (e.g. 'INR', 'USD', 'EUR', 'GBP'). Defaults to 'INR'.",
        examples=["INR"],
    )
    url: str = Field(
        description="Direct canonical URL to the job posting without tracking or intermediary redirects.",
        examples=["https://www.linkedin.com/jobs/view/4430825102"],
    )
    description_text: str = Field(
        description="Sanitized plain text job description with HTML tags stripped and whitespace normalized.",
        examples=["We are building production agentic systems using LLMs..."],
    )
    description_html: str | None = Field(
        default=None,
        description="Sanitized original HTML markup of the job description for rich frontend rendering.",
        examples=["<p>We are building <strong>production agentic systems</strong>...</p>"],
    )
    posted_at: datetime | None = Field(
        default=None,
        description="ISO 8601 UTC timestamp of when the role was posted or indexed.",
        examples=["2026-09-01T00:00:00Z"],
    )
    experience_min_years: int | None = Field(
        default=None,
        description="Minimum years of professional experience required, if stated.",
        examples=[3],
    )
    experience_max_years: int | None = Field(
        default=None,
        description="Maximum years of professional experience required or upper bracket.",
        examples=[7],
    )
    company_logo_url: str | None = Field(
        default=None,
        description="Direct URL to company logo asset.",
        examples=["https://media.licdn.com/dms/image/v2/company-logo.png"],
    )
    company_website: str | None = Field(
        default=None,
        description="URL to company profile or direct website.",
        examples=["https://www.linkedin.com/company/shamrock-ai"],
    )
    is_in_db: bool = Field(
        default=False,
        description="Whether this job posting already exists in the database (raw or unified).",
        examples=[False],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "external_id": "4430825102",
                    "title": "Senior AI Engineer",
                    "company_name": "Shamrock AI",
                    "source": "linkedin",
                    "location_raw": "Bengaluru, Karnataka, India",
                    "city": "bengaluru",
                    "is_remote": True,
                    "is_international": False,
                    "salary_raw": "₹30L – ₹45L",
                    "salary_min": 3000000.0,
                    "salary_max": 4500000.0,
                    "currency": "INR",
                    "url": "https://www.linkedin.com/jobs/view/4430825102",
                    "description_text": "We are looking for an AI Engineer to design and scale production LLM agentic pipelines...",
                    "description_html": "<p>We are looking for an <strong>AI Engineer</strong> to design and scale production LLM agentic pipelines...</p>",
                    "posted_at": "2026-09-01T00:00:00Z",
                    "experience_min_years": 3,
                    "experience_max_years": 6,
                    "company_logo_url": "https://media.licdn.com/dms/image/v2/company-logo.png",
                    "company_website": "https://www.linkedin.com/company/shamrock-ai",
                }
            ]
        }
    }

class JobSearchResponse(BaseModel):
    query: str = Field(description="The role query string executed.", examples=["ai engineer"])
    location: str = Field(description="The geographic location queried.", examples=["India"])
    total_count: int = Field(description="Number of job postings returned in this payload.", examples=[20])
    next_cursor: str | None = Field(
        default=None,
        description="Cursor token to pass in subsequent requests for pagination.",
        examples=["AAIAAQACAAAAAAAAAAAAAAACYxj34QEAAKimjvf6"],
    )
    sort: str = Field(description="Sort order applied ('relevance' or 'date').", examples=["relevance"])
    radius_km: int = Field(description="Effective search radius in kilometers.", examples=[25])
    items: list[JobItem] = Field(description="List of standardized JobItem results.")

class ErrorDetail(BaseModel):
    error: str = Field(description="Standardized machine-readable error token.", examples=["UPSTREAM_RATE_LIMITED"])
    detail: str = Field(description="Human-readable explanation of the issue and resolution advice.", examples=["Rate limit triggered on upstream provider."])
    retry_after: float | None = Field(
        default=None,
        description="Suggested backoff duration in seconds if the request was rate limited.",
        examples=[5.0],
    )
