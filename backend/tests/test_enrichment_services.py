import pytest
from src.services.pay_normalizer import PayNormalizer
from src.services.experience_extractor import ExperienceExtractor

def test_pay_normalizer_lpa():
    res = PayNormalizer.normalize(
        raw_salary="₹25L – ₹45L",
        s_min=None,
        s_max=None,
        currency="INR",
        description=""
    )
    assert res["min_inr"] == 2500000
    assert res["max_inr"] == 4500000
    assert res["currency"] == "INR"
    assert res["method"] in ("regex", "native")

def test_pay_normalizer_usd():
    res = PayNormalizer.normalize(
        raw_salary="$25k – $50k",
        s_min=25000.0,
        s_max=50000.0,
        currency="USD",
        description=""
    )
    assert res["min_inr"] == 25000 * 85
    assert res["max_inr"] == 50000 * 85
    assert res["currency"] == "USD"

def test_pay_normalizer_from_description():
    desc = "We offer a competitive compensation package of 12 - 18 LPA depending on interview performance."
    res = PayNormalizer.normalize(
        raw_salary=None,
        s_min=None,
        s_max=None,
        currency="INR",
        description=desc
    )
    assert res["min_inr"] == 1200000
    assert res["max_inr"] == 1800000
    assert res["method"] == "regex"

def test_experience_extractor_native():
    res = ExperienceExtractor.extract(
        native_min=0,
        native_max=2,
        description="Software engineer role",
        attributes=[]
    )
    assert res["min_years"] == 0
    assert res["max_years"] == 2
    assert res["is_fresher_friendly"] is True
    assert res["method"] == "native"

def test_experience_extractor_fresher_regex():
    desc = "Great role for freshers and recent college graduates looking to kickstart their career in python backend development."
    res = ExperienceExtractor.extract(
        native_min=None,
        native_max=None,
        description=desc,
        attributes=[]
    )
    assert res["min_years"] == 0
    assert res["is_fresher_friendly"] is True
    assert res["method"] == "regex"

def test_experience_extractor_bracket_regex():
    desc = "Candidates must possess 3 - 5 years of experience in distributed systems."
    res = ExperienceExtractor.extract(
        native_min=None,
        native_max=None,
        description=desc,
        attributes=[]
    )
    assert res["min_years"] == 3
    assert res["max_years"] == 5
    assert res["is_fresher_friendly"] is False
    assert res["method"] == "regex"

def test_experience_extractor_unicode_dashes():
    desc = "Candidate Profile 3–5 years of relevant software, AI, or GenAI engineering experience."
    res = ExperienceExtractor.extract(description=desc)
    assert res["min_years"] == 3
    assert res["max_years"] == 5
    assert res["is_fresher_friendly"] is False

def test_experience_extractor_standalone_years():
    desc = "10 Years of experience in SoC/IP verification."
    res = ExperienceExtractor.extract(description=desc)
    assert res["min_years"] == 10
    assert res["max_years"] is None

def test_experience_extractor_minimum_pattern():
    desc = "Requirements: Minimum 5 years of design experience in a relevant industry."
    res = ExperienceExtractor.extract(description=desc)
    assert res["min_years"] == 5
    assert res["max_years"] is None

def test_experience_extractor_plus_pattern():
    desc = "Skills: 4+ years of experience in Windows Server support infrastructure."
    res = ExperienceExtractor.extract(description=desc)
    assert res["min_years"] == 4
    assert res["max_years"] is None
