import pytest
from src.services.pay_normalizer import PayNormalizer
from src.services.experience_extractor import ExperienceExtractor
from src.services.llm_parser import LLMJobParser

@pytest.mark.asyncio
async def test_live_freeapi_gemini_37_flash_tiered():
    # 1. Test Experience Extractor LLM fallback
    title = "Junior AI / Python Developer"
    desc = (
        "We are hiring entry-level and fresh engineering graduates for our AI startup in Bengaluru. "
        "No prior industry experience required. We offer intensive training on PyTorch and LLMs."
    )
    exp_res = await ExperienceExtractor.extract_with_llm(title, desc)
    assert exp_res["method"] == "llm"
    assert exp_res["min_years"] == 0
    assert exp_res["is_fresher_friendly"] is True

    # 2. Test Pay Normalizer LLM fallback
    title_pay = "Full Stack Engineer"
    desc_pay = (
        "The selected candidate will receive an annual compensation bracket of 14 to 22 Lakhs INR "
        "along with health insurance and ESOP benefits."
    )
    pay_res = await PayNormalizer.extract_with_llm(title_pay, desc_pay)
    assert pay_res["method"] == "llm"
    assert pay_res["min_inr"] == 1400000
    assert pay_res["max_inr"] == 2200000

@pytest.mark.asyncio
async def test_live_llm_job_parser_monthly_heuristic():
    # Role with ₹20,000 to ₹50,000 (monthly) and 0-1 years / fresher requirements
    title = "Software Engineer Intern / Trainee"
    salary_raw = "₹20,000 - ₹50,000"
    desc = (
        "Join our rapid product engineering team in Gurugram. "
        "Compensation is ₹20,000 - ₹50,000 depending on interview evaluation. "
        "We welcome fresh college graduates and 2025/2026 passouts with zero to one year experience."
    )
    res = await LLMJobParser.parse_job(title=title, description=desc, salary_raw=salary_raw)
    assert res["salary_min_inr_year"] == 240000
    assert res["salary_max_inr_year"] == 600000
    assert res["is_fresher_friendly"] is True
    assert res["experience_min_years"] == 0
