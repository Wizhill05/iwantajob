import pytest
from src.clients.wellfound import (
    resolve_role_slug,
    resolve_location_slug,
    parse_wellfound_compensation,
    WellfoundClient,
    MAX_WELLFOUND_PAGE,
)
from src.clients.wellfound_slugs import (
    SUPPORTED_WELLFOUND_ROLES,
    SUPPORTED_WELLFOUND_LOCATIONS,
)

def test_slug_resolution():
    # Direct valid slugs
    assert resolve_role_slug("ai-engineer") == "ai-engineer"
    assert resolve_role_slug("qa-engineer") == "qa-engineer"
    assert resolve_location_slug("bengaluru") == "bengaluru"
    assert resolve_location_slug("pune") == "pune"

    # Synonyms and freeform phrases
    assert resolve_role_slug("genai") == "ai-engineer"
    assert resolve_role_slug("python developer") == "backend-engineer"
    assert resolve_role_slug("quality assurance") == "qa-engineer"
    assert resolve_location_slug("bangalore") == "bengaluru"
    assert resolve_location_slug("bombay") == "mumbai"
    assert resolve_location_slug("wfh") == "remote"

    # Fallback safety
    assert resolve_role_slug("arbitrary invalid role title 12345") == "software-engineer"
    assert resolve_location_slug("non-existent mars colony") == "india"

def test_parse_wellfound_compensation():
    s_min, s_max, curr = parse_wellfound_compensation("$25k – $50k • 0.0% – 1.0%")
    assert s_min == 25000.0
    assert s_max == 50000.0
    assert curr == "USD"

    s_min, s_max, curr = parse_wellfound_compensation("₹25L – ₹45L • No equity")
    assert s_min == 2500000.0
    assert s_max == 4500000.0
    assert curr == "INR"

    s_min, s_max, curr = parse_wellfound_compensation("₹20,000 – ₹50,000")
    assert s_min == 20000.0
    assert s_max == 50000.0
    assert curr == "INR"

    s_min, s_max, curr = parse_wellfound_compensation(None)
    assert s_min is None
    assert s_max is None

def test_pagination_bounds():
    assert MAX_WELLFOUND_PAGE == 20

def test_slug_catalog_completeness():
    assert len(SUPPORTED_WELLFOUND_ROLES) >= 30
    assert len(SUPPORTED_WELLFOUND_LOCATIONS) >= 10
    assert "ai-engineer" in SUPPORTED_WELLFOUND_ROLES
    assert "backend-engineer" in SUPPORTED_WELLFOUND_ROLES
    assert "sdet" in SUPPORTED_WELLFOUND_ROLES
    assert "bengaluru" in SUPPORTED_WELLFOUND_LOCATIONS
    assert "pune" in SUPPORTED_WELLFOUND_LOCATIONS
