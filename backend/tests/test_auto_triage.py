def test_default_prefs_shape():
    from src.models.db_entities import DEFAULT_PREFS
    assert DEFAULT_PREFS["id"] == "default"
    assert DEFAULT_PREFS["allow_international"] is False
    assert DEFAULT_PREFS["max_experience_years"] == 2
    assert "ai engineer" in DEFAULT_PREFS["preferred_title_keywords"]
    assert "senior" in DEFAULT_PREFS["blocked_title_keywords"]


def test_classify_archives_international():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "AI Engineer", "is_international": True, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, reason = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "archive" and "non-india" in reason


def test_classify_archives_senior_over_limit():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "Senior AI Engineer", "is_international": False, "experience_min_years": 6, "is_fresher_friendly": False, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "archive"


def test_classify_saves_junior_ai_india():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "AI Engineer", "is_international": False, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "save"


def test_classify_leaves_unmatched_active():
    from src.services.auto_triage import AutoTriageService
    from src.models.db_entities import DEFAULT_PREFS
    job = {"title": "Accountant", "is_international": False, "experience_min_years": 0, "is_fresher_friendly": True, "city": "bengaluru", "salary_min_inr_year": None}
    action, _ = AutoTriageService.classify(job, DEFAULT_PREFS)
    assert action == "none"


import pytest


@pytest.mark.asyncio
async def test_prefs_roundtrip_and_dry_run():
    from src.core.database import init_db
    await init_db()
    from fastapi.testclient import TestClient
    from src.main import app
    c = TestClient(app)
    # Reset to known state first: the prefs row persists in the real DB
    # and may have been changed via the /settings UI. Restore it after.
    original_max_exp = c.get("/api/preferences").json()["max_experience_years"]
    r = c.put("/api/preferences", json={"max_experience_years": 2})
    assert r.status_code == 200 and r.json()["max_experience_years"] == 2
    r = c.get("/api/preferences")
    assert r.status_code == 200 and r.json()["max_experience_years"] == 2
    r = c.put("/api/preferences", json={"max_experience_years": 1})
    assert r.json()["max_experience_years"] == 1
    r = c.put("/api/preferences", json={"max_experience_years": original_max_exp})
    assert r.json()["max_experience_years"] == original_max_exp
    r = c.post("/api/jobs/auto-triage?dry_run=true&limit=5")
    assert r.status_code == 200 and "evaluated" in r.json()
