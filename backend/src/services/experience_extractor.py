import json
import logging
import re
from typing import Any
from curl_cffi.requests import AsyncSession
from src.core.config import settings

logger = logging.getLogger(__name__)

FRESHER_KEYWORDS = [
    r"\bfreshers?\b",
    r"\brecent graduate\b",
    r"\bcollege graduate\b",
    r"\bentry[- ]level\b",
    r"\b0[- ](?:to[- ])?1\s*(?:years?|yrs?)\b",
    r"\b0[- ](?:to[- ])?2\s*(?:years?|yrs?)\b",
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
                # Also try to check if there is an upper bound (e.g. 0-2 years)
                m = re.search(r"0\s*(?:-|to)\s*([0-9]+)\s*(?:years?|yrs?)", desc_lower)
                max_y = int(m.group(1)) if m else 1
                return {
                    "min_years": 0,
                    "max_years": max_y,
                    "is_fresher_friendly": True,
                    "method": "regex",
                }

        # 4. Standard experience range pattern in description
        # e.g. "3 - 5 years of experience", "2+ years", "minimum 4 years"
        range_match = re.search(
            r"([0-9]+)\s*(?:-|to)\s*([0-9]+)\s*(?:years?|yrs?)(?:\s+of\s+experience)?",
            desc_lower,
        )
        if range_match:
            min_y = int(range_match.group(1))
            max_y = int(range_match.group(2))
            return {
                "min_years": min_y,
                "max_years": max_y,
                "is_fresher_friendly": min_y <= 1,
                "method": "regex",
            }

        plus_match = re.search(
            r"([0-9]+)\s*\+\s*(?:years?|yrs?)(?:\s+of\s+experience)?",
            desc_lower,
        )
        if plus_match:
            min_y = int(plus_match.group(1))
            return {
                "min_years": min_y,
                "max_years": None,
                "is_fresher_friendly": min_y <= 1,
                "method": "regex",
            }

        min_match = re.search(
            r"(?:minimum|at least)\s*([0-9]+)\s*(?:years?|yrs?)",
            desc_lower,
        )
        if min_match:
            min_y = int(min_match.group(1))
            return {
                "min_years": min_y,
                "max_years": None,
                "is_fresher_friendly": min_y <= 1,
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

        truncated_desc = description[:4000]
        prompt = (
            f"Analyze this job title and description and extract years of experience required.\n"
            f"Job Title: {title}\n"
            f"Job Description: {truncated_desc}\n\n"
            f"Respond ONLY with a valid JSON object matching this schema:\n"
            f'{{"min_years": integer or null, "max_years": integer or null, "is_fresher_friendly": boolean}}\n'
            f"Rules: If role mentions fresher, internship, or 0-1 year, is_fresher_friendly=true and min_years=0."
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
