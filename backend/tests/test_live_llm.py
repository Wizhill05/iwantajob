import pytest
from src.services.pay_normalizer import PayNormalizer
from src.services.experience_extractor import ExperienceExtractor

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
