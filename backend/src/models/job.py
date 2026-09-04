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
    external_id: str
    title: str
    company_name: str
    source: str = "indeed"
    location_raw: str
    city: str | None = None
    is_remote: bool = False
    is_international: bool = False
    salary_raw: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str = "INR"
    url: str
    description_text: str
    description_html: str | None = None
    posted_at: datetime | None = None
