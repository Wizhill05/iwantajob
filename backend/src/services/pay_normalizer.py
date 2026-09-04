import json
import logging
import re
from typing import Any
from curl_cffi.requests import AsyncSession
from src.core.config import settings

logger = logging.getLogger(__name__)

# Currency conversion rates to INR
CURRENCY_RATES = {
    "INR": 1.0,
    "₹": 1.0,
    "RS": 1.0,
    "RUPEES": 1.0,
    "USD": 85.0,
    "$": 85.0,
    "EUR": 92.0,
    "€": 92.0,
    "GBP": 108.0,
    "£": 108.0,
    "CAD": 62.0,
    "AUD": 55.0,
    "SGD": 64.0,
}

class PayNormalizer:
    """
    Extracts and normalizes compensation into annual integer INR (Rupees per year).
    """

    @classmethod
    def _detect_currency(cls, text: str, default_curr: str = "INR") -> str:
        t = text.upper()
        if "$" in t or "USD" in t:
            return "USD"
        if "€" in t or "EUR" in t:
            return "EUR"
        if "£" in t or "GBP" in t:
            return "GBP"
        if "₹" in t or "INR" in t or "LPA" in t or "LAKH" in t:
            return "INR"
        return default_curr.upper()

    @classmethod
    def _parse_raw_numbers(cls, text: str) -> list[float]:
        # First check if the whole text has an overarching unit (like '12 - 18 LPA' or '25 - 45 Lacs')
        overall_unit = ""
        m_unit = re.search(r"\b(lpa|lac|lacs|lakh|lakhs|cr|crore|crores|k|thousand)\b", text, flags=re.IGNORECASE)
        if m_unit:
            overall_unit = m_unit.group(1).lower()

        matches = re.findall(
            r"([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)\s*(k|kilo|thousand|l|lac|lacs|lakh|lakhs|cr|crore|crores)?\b",
            text,
            flags=re.IGNORECASE,
        )
        values: list[float] = []
        for num_str, unit in matches:
            cleaned = num_str.replace(",", "")
            try:
                val = float(cleaned)
                u = unit.lower() if unit else overall_unit
                if u in ("k", "kilo", "thousand"):
                    val *= 1000
                elif u in ("l", "lac", "lacs", "lakh", "lakhs", "lpa"):
                    val *= 100000
                elif u in ("cr", "crore", "crores"):
                    val *= 10000000
                # Filter out obvious years (like 2024, 2025, 2026) if no multiplier
                if not u and 1990 <= val <= 2030:
                    continue
                values.append(val)
            except ValueError:
                continue
        return values

    @classmethod
    def normalize(
        cls,
        raw_salary: str | None,
        s_min: float | None = None,
        s_max: float | None = None,
        currency: str = "INR",
        description: str | None = None,
    ) -> dict[str, Any]:
        """
        Normalizes salary into min_inr, max_inr (annual integers), currency, and method.
        """
        curr = currency.upper() if currency else "INR"
        rate = CURRENCY_RATES.get(curr, 1.0)

        # 1. Check direct structured bounds if provided (e.g. from Wellfound or Indeed API)
        if s_min is not None or s_max is not None:
            # Check period: hourly or monthly
            period_mult = 1.0
            if raw_salary:
                raw_lower = raw_salary.lower()
                if "hour" in raw_lower or "/hr" in raw_lower:
                    period_mult = 2000.0  # ~40 hrs * 50 weeks
                elif "month" in raw_lower or "/mo" in raw_lower or "pm" in raw_lower:
                    period_mult = 12.0
                curr = cls._detect_currency(raw_salary, curr)
                rate = CURRENCY_RATES.get(curr, rate)

            min_inr = int(s_min * rate * period_mult) if s_min is not None else None
            max_inr = int(s_max * rate * period_mult) if s_max is not None else None
            return {
                "min_inr": min_inr,
                "max_inr": max_inr,
                "currency": curr,
                "method": "native",
            }

        # 2. Check raw_salary string using regex
        if raw_salary:
            curr = cls._detect_currency(raw_salary, curr)
            rate = CURRENCY_RATES.get(curr, rate)
            vals = cls._parse_raw_numbers(raw_salary)
            if vals:
                period_mult = 1.0
                raw_lower = raw_salary.lower()
                if "hour" in raw_lower or "/hr" in raw_lower:
                    period_mult = 2000.0
                elif "month" in raw_lower or "/mo" in raw_lower:
                    period_mult = 12.0

                min_val = vals[0]
                max_val = vals[1] if len(vals) > 1 else None
                return {
                    "min_inr": int(min_val * rate * period_mult),
                    "max_inr": int(max_val * rate * period_mult) if max_val is not None else None,
                    "currency": curr,
                    "method": "regex",
                }

        # 3. Extract from description text using targeted compensation patterns
        if description:
            desc_patterns = [
                r"(?:salary|ctc|stipend|compensation|package|pay)\s*(?:is|of|:|-)?\s*([₹$€£]?[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?\s*(?:-|to)?\s*[0-9]*(?:,[0-9]+)*(?:\.[0-9]+)?\s*(?:lpa|lacs?|lakhs?|k|thousand|per annum|p\.a\.|per month|pm)?)",
                r"([0-9]+(?:\.[0-9]+)?\s*(?:-|to)\s*[0-9]+(?:\.[0-9]+)?\s*(?:lpa|lacs?|lakhs?))",
            ]
            for pat in desc_patterns:
                m = re.search(pat, description, flags=re.IGNORECASE)
                if m:
                    snippet = m.group(1)
                    matched_curr = cls._detect_currency(snippet, "INR")
                    matched_rate = CURRENCY_RATES.get(matched_curr, 1.0)
                    vals = cls._parse_raw_numbers(snippet)
                    if vals:
                        period_mult = 1.0
                        if "month" in snippet.lower() or "pm" in snippet.lower():
                            period_mult = 12.0
                        min_v = vals[0]
                        max_v = vals[1] if len(vals) > 1 else None
                        return {
                            "min_inr": int(min_v * matched_rate * period_mult),
                            "max_inr": int(max_v * matched_rate * period_mult) if max_v is not None else None,
                            "currency": matched_curr,
                            "method": "regex",
                        }

        return {
            "min_inr": None,
            "max_inr": None,
            "currency": curr,
            "method": "none",
        }

    @classmethod
    async def extract_with_llm(cls, title: str, description: str) -> dict[str, Any]:
        """
        LLM fallback extraction for compensation via Gemini 3.7 Flash Tiered.
        """
        if not description or len(description.strip()) < 50:
            return {"min_inr": None, "max_inr": None, "currency": "INR", "method": "none"}

        truncated_desc = description[:4000]
        prompt = (
            f"Analyze this job title and description and extract salary/compensation details.\n"
            f"Job Title: {title}\n"
            f"Job Description: {truncated_desc}\n\n"
            f"Respond ONLY with a valid JSON object matching this schema:\n"
            f'{{"min_inr_annual": integer or null, "max_inr_annual": integer or null, "currency": string}}\n'
            f"Rules:\n"
            f"- Convert all figures into integer ANNUAL INR (Rupees per year).\n"
            f"- If in USD, convert to INR at 85 rate.\n"
            f"- If in LPA, 1 LPA = 100000 INR.\n"
            f"- If no salary/stipend is mentioned, return nulls."
        )

        if not settings.freeapi_api_key:
            logger.warning("FREEAPI_API_KEY is not configured; skipping LLM fallback.")
            return {"min_inr": None, "max_inr": None, "currency": "INR", "method": "none"}

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
                    clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.MULTILINE).strip()
                    parsed = json.loads(clean_json)
                    min_inr = parsed.get("min_inr_annual")
                    max_inr = parsed.get("max_inr_annual")
                    if min_inr is not None or max_inr is not None:
                        return {
                            "min_inr": int(min_inr) if min_inr is not None else None,
                            "max_inr": int(max_inr) if max_inr is not None else None,
                            "currency": parsed.get("currency", "INR"),
                            "method": "llm",
                        }
        except Exception as exc:
            logger.warning(f"LLM pay extraction failed: {exc}")

        return {"min_inr": None, "max_inr": None, "currency": "INR", "method": "none"}
