import json
import logging
import re
from typing import Any
from curl_cffi.requests import AsyncSession
from src.core.config import settings

logger = logging.getLogger(__name__)

DASH_CHARS = r"[\-\u2010-\u2015\u2212\uFF0D~]"

FRESHER_KEYWORDS = [
    r"\bfreshers?\b",
    r"\brecent graduate\b",
    r"\bcollege graduate\b",
    r"\bentry[- ]level\b",
    rf"\b0\s*(?:{DASH_CHARS}|to)\s*1\s*(?:years?|yrs?)\b",
    rf"\b0\s*(?:{DASH_CHARS}|to)\s*2\s*(?:years?|yrs?)\b",
    r"\bno experience (?:required|needed)\b",
    r"\bintern(?:ship)?\b",
    r"\btrainee\b",
]

class ExperienceExtractor:
    """
    Extracts experience minimum and maximum years, identifying fresher-friendly roles.
    """

    @classmethod
    def extract(
        cls,
        native_min: int | None = None,
        native_max: int | None = None,
        description: str | None = None,
        attributes: list[Any] | None = None,
    ) -> dict[str, Any]:
        """
        Extracts min_years, max_years, is_fresher_friendly, and method.
        """
        # 1. Native API bounds (Wellfound)
        if native_min is not None or native_max is not None:
            min_y = native_min
            max_y = native_max
            is_fresher = (min_y is not None and min_y <= 1)
            return {
                "min_years": min_y,
                "max_years": max_y,
                "is_fresher_friendly": is_fresher,
                "method": "native",
            }

        # 2. Check Indeed card attributes
        if attributes:
            for attr in attributes:
                label = ""
                if isinstance(attr, dict):
                    label = attr.get("label", "")
                elif isinstance(attr, str):
                    label = attr
                if "fresher" in label.lower() or "intern" in label.lower() or "entry level" in label.lower():
                    return {
                        "min_years": 0,
                        "max_years": 1,
                        "is_fresher_friendly": True,
                        "method": "native",
                    }

        desc = description or ""
        desc_lower = desc.lower()

        # 3. Check Fresher keywords via regex
        for kw in FRESHER_KEYWORDS:
            if re.search(kw, desc_lower):
                m = re.search(rf"0\s*(?:{DASH_CHARS}|to)\s*([0-9]+)\s*(?:years?|yrs?)", desc_lower)
                max_y = int(m.group(1)) if m else 1
                return {
                    "min_years": 0,
                    "max_years": max_y,
                    "is_fresher_friendly": True,
                    "method": "regex",
                }

        # 4. Explicit experience range in description (handles unicode dashes, "to", etc.)
        # e.g. "3 - 5 years of experience", "4 - 8 years of professional software development experience", "3–5 years"
        range_match = re.search(
            rf"(?:minimum\s+|at\s+least\s+)?([0-9]+)\s*(?:{DASH_CHARS}|to)\s*([0-9]+)\s*(?:years?|yrs?)(?:\s+of\s+[\w\s,/\-]+experience|\s+experience|\s+software|\s+professional)?",
            desc_lower,
        )
        if range_match:
            min_y = int(range_match.group(1))
            max_y = int(range_match.group(2))
            if min_y <= 25 and max_y <= 35:
                return {
                    "min_years": min_y,
                    "max_years": max_y,
                    "is_fresher_friendly": min_y <= 1,
                    "method": "regex",
                }

        # 5. Plus experience pattern (e.g. "4+ years", "3+ years of experience")
        plus_match = re.search(
            rf"([0-9]+)\s*\+\s*(?:years?|yrs?)(?:\s+of\s+[\w\s,/\-]+experience|\s+experience)?",
            desc_lower,
        )
        if plus_match:
            min_y = int(plus_match.group(1))
            # Guard against company age phrases like "for over 25+ years"
            company_age_check = re.search(rf"(?:for|over|history of|serving)\s+(?:over\s+)?{min_y}\s*\+\s*years", desc_lower)
            if not company_age_check and min_y <= 25:
                return {
                    "min_years": min_y,
                    "max_years": None,
                    "is_fresher_friendly": min_y <= 1,
                    "method": "regex",
                }

        # 6. Minimum / at least pattern (e.g. "minimum 5 years", "at least 3 years")
        min_match = re.search(
            rf"(?:minimum|at\s+least)(?:\s+of)?\s*([0-9]+)\s*(?:years?|yrs?)",
            desc_lower,
        )
        if min_match:
            min_y = int(min_match.group(1))
            if min_y <= 25:
                return {
                    "min_years": min_y,
                    "max_years": None,
                    "is_fresher_friendly": min_y <= 1,
                    "method": "regex",
                }

        # 7. Standalone "X years of experience" pattern (e.g. "10 Years of experience in SoC/IP verification")
        years_of_exp_match = re.search(
            rf"([0-9]+)\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[\w\s,/\-]{{0,50}}?)?experience",
            desc_lower,
        )
        if years_of_exp_match:
            min_y = int(years_of_exp_match.group(1))
            company_age_check = re.search(rf"(?:for|over|history of|founded)\s+(?:over\s+)?{min_y}\s*(?:years?|yrs?)", desc_lower)
            if not company_age_check and min_y <= 25:
                return {
                    "min_years": min_y,
                    "max_years": None,
                    "is_fresher_friendly": min_y <= 1,
                    "method": "regex",
                }

        # 8. Check for months of experience (e.g. "6 months of hands-on experience")
        months_match = re.search(r"([0-9]+)\s*(?:months?|mos?)\s+(?:of\s+)?(?:[\w\s,/\-]{0,50}?)?experience", desc_lower)
        if months_match:
            return {
                "min_years": 0,
                "max_years": 1,
                "is_fresher_friendly": True,
                "method": "regex",
            }

        return {
            "min_years": None,
            "max_years": None,
            "is_fresher_friendly": False,
            "method": "none",
        }

    @classmethod
    async def extract_with_llm(cls, title: str, description: str) -> dict[str, Any]:
        """
        LLM fallback extraction for ambiguous job descriptions via FreeAPI.
        """
        if not description or len(description.strip()) < 50:
            return {"min_years": None, "max_years": None, "is_fresher_friendly": False, "method": "none"}

        truncated_desc = description[:10000]
        prompt = (
            f"Analyze this job title and description and extract the required professional experience in years.\n"
            f"Job Title: {title}\n"
            f"Job Description: {truncated_desc}\n\n"
            f"Respond ONLY with a valid JSON object matching this schema:\n"
            f'{{"min_years": integer or null, "max_years": integer or null, "is_fresher_friendly": boolean}}\n'
            f"Rules:\n"
            f"- If the role welcomes freshers, recent graduates, interns, or specifies <= 1 year, set is_fresher_friendly=true and min_years=0.\n"
            f"- Look under Qualifications, Requirements, Minimum Qualifications, and Candidate Profile for required years.\n"
            f"- If a range is given like '3-5 years', min_years=3, max_years=5. If '4+ years', min_years=4, max_years=null."
        )

        if not settings.freeapi_api_key:
            logger.warning("FREEAPI_API_KEY is not configured; skipping LLM fallback.")
            return {"min_years": None, "max_years": None, "is_fresher_friendly": False, "method": "none"}

        headers = {
            "Authorization": f"Bearer {settings.freeapi_api_key}",
            "Content-Type": "application/json",
        }
        endpoint = f"{settings.freeapi_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": settings.freeapi_model,
            "messages": [
                {"role": "system", "content": "You are a specialized recruiting data parser. Output valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
        }

        try:
            async with AsyncSession(timeout=10.0) as session:
                resp = await session.post(endpoint, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"].strip()
                    # Clean markdown codeblocks
                    clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.MULTILINE).strip()
                    parsed = json.loads(clean_json)
                    return {
                        "min_years": parsed.get("min_years"),
                        "max_years": parsed.get("max_years"),
                        "is_fresher_friendly": bool(parsed.get("is_fresher_friendly", False)),
                        "method": "llm",
                    }
        except Exception as exc:
            logger.warning(f"LLM experience extraction failed: {exc}")

        return {"min_years": None, "max_years": None, "is_fresher_friendly": False, "method": "none"}
