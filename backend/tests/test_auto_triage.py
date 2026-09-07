def test_default_prefs_shape():
    from src.models.db_entities import DEFAULT_PREFS
    assert DEFAULT_PREFS["id"] == "default"
    assert DEFAULT_PREFS["allow_international"] is False
    assert DEFAULT_PREFS["max_experience_years"] == 2
    assert "ai engineer" in DEFAULT_PREFS["preferred_title_keywords"]
    assert "senior" in DEFAULT_PREFS["blocked_title_keywords"]
