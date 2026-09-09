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
    from src.core.database import init_db, async_session_maker
    await init_db()
    from fastapi.testclient import TestClient
    from src.main import app
    from src.models.db_entities import UserPreference
    c = TestClient(app)
    # Reset to known state first: the prefs row persists in the real DB.
    # Read the current value, exercise the ORM roundtrip, then restore it.
    async with async_session_maker() as session:
        prefs = await session.get(UserPreference, "default")
        assert prefs is not None
        original_max_exp = prefs.max_experience_years

        prefs.max_experience_years = 2
        await session.commit()

        refreshed = await session.get(UserPreference, "default")
        assert refreshed.max_experience_years == 2

        refreshed.max_experience_years = 1
        await session.commit()

        refreshed = await session.get(UserPreference, "default")
        assert refreshed.max_experience_years == 1

        refreshed.max_experience_years = original_max_exp
        await session.commit()

    r = c.post("/api/jobs/auto-triage?dry_run=true&limit=5")
    assert r.status_code == 200 and "evaluated" in r.json()
