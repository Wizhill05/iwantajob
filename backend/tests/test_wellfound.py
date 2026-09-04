import pytest
from src.clients.wellfound import (
    slugify_term,
    parse_wellfound_compensation,
    WellfoundClient,
)

def test_slugify_term():
    assert slugify_term("AI Engineer") == "ai-engineer"
    assert slugify_term("Software Engineer") == "software-engineer"
    assert slugify_term("Bengaluru, Karnataka") == "bengaluru"
    assert slugify_term("Pune, Maharashtra") == "pune"
    assert slugify_term("Delhi-NCR") == "delhi"
    assert slugify_term("All India") == "india"
    assert slugify_term("Remote") == "remote"

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

@pytest.mark.asyncio
async def test_wellfound_live_search():
    client = WellfoundClient()
    jobs = await client.search_jobs(role="ai-engineer", location="india", limit=5)
    assert len(jobs) > 0
    first = jobs[0]
    assert first.source == "wellfound"
    assert first.url.startswith("https://wellfound.com/jobs/")
    assert first.title
    assert first.company_name
