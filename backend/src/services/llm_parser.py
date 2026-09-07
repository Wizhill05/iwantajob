import asyncio
import json
import logging
import re
from typing import Any
from curl_cffi.requests import AsyncSession
from src.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert recruiter and compensation parser for tech jobs in India and internationally.
Your task is to extract normalized compensation and experience requirements from a job title, raw compensation snippet, and description.

Rules for Compensation (annual INR integer):
1. All final salary bounds ('salary_min_inr_year' and 'salary_max_inr_year') must be annualized integer INR (Rupees per year).
2. CRITICAL - Monthly vs Annual Heuristic:
   - In Indian tech hiring, figures in the range ₹5,000 to ₹150,000 (e.g., '₹20,000 - ₹50,000', '25k - 40k', '30000 - 60000', '₹15,000/month') are MONTHLY salaries or stipends, even if 'per month' or 'pm' is omitted! ₹20,000 to ₹50,000 cannot be for a whole year. You MUST multiply monthly figures by 12 to produce annual INR.
   - Example: '₹20,000 - ₹50,000' -> min: 240,000, max: 600,000.
   - Example: '₹30,000 per month' -> min: 360,000, max: 360,000.
3. LPA / Lakhs:
   - '12 - 18 LPA' or '10 Lacs' -> multiply LPA by 100,000 (e.g., 1,200,000 to 1,800,000).
4. Foreign Currencies:
   - USD ($): Convert to INR at 85 INR/USD. If figures are like '$50k - $80k', annual INR = 50,000 * 85 to 80,000 * 85.
   - EUR (€): Convert to INR at 92 INR/EUR.
   - GBP (£): Convert to INR at 108 INR/GBP.
5. If only a single number is given (e.g. '₹25,000' or '15 LPA'), assign it to both min and max, or min if 'starting from'.
6. If no compensation is stated anywhere, return null for both min and max.

Rules for Experience:
1. 'experience_min_years' (integer or null) and 'experience_max_years' (integer or null).
2. 'is_fresher_friendly' (boolean):
   - Set to TRUE if the role welcomes freshers, recent college graduates, interns, entry-level, 'batch of 2024/2025/2026', 'no experience required', or requires <= 1 year of experience.
   - When fresher-friendly with no minimum years specified, 'experience_min_years' should be 0.
3. If an explicit range is mentioned (e.g. '3-5 years'), min: 3, max: 5. If '3+ years', min: 3, max: null.

Output format:
Respond ONLY with a valid JSON object matching this schema:
{
  "salary_min_inr_year": integer or null,
  "salary_max_inr_year": integer or null,
  "salary_raw": string or null,
  "currency": string or null,
  "experience_min_years": integer or null,
  "experience_max_years": integer or null,
  "is_fresher_friendly": boolean
}
"""


SYSTEM_BATCH_PROMPT = """You are an expert recruiter and compensation parser for tech jobs in India and internationally.
Your task is to extract normalized compensation and experience requirements for a LIST of jobs.

Rules for Compensation (annual INR integer):
1. All final salary bounds ('salary_min_inr_year' and 'salary_max_inr_year') must be annualized integer INR (Rupees per year).
2. CRITICAL - Monthly vs Annual Heuristic:
   - In Indian tech hiring, figures in the range ₹5,000 to ₹150,000 (e.g., '₹20,000 - ₹50,000', '25k - 40k', '30000 - 60000', '₹15,000/month') are MONTHLY salaries or stipends, even if 'per month' or 'pm' is omitted! ₹20,000 to ₹50,000 cannot be for a whole year. You MUST multiply monthly figures by 12 to produce annual INR.
   - Example: '₹20,000 - ₹50,000' -> min: 240000, max: 600000.
3. LPA / Lakhs:
   - '12 - 18 LPA' or '10 Lacs' -> multiply LPA by 100,000 (e.g., 1,200,000 to 1,800,000).
4. Foreign Currencies:
   - USD ($): Convert to INR at 85 INR/USD.
   - EUR (€): Convert to INR at 92 INR/EUR.
   - GBP (£): Convert to INR at 108 INR/GBP.
5. If only a single number is given, assign it to both min and max.
6. If no compensation is stated anywhere, return null for both min and max.

Rules for Experience:
1. 'experience_min_years' (integer or null) and 'experience_max_years' (integer or null).
2. 'is_fresher_friendly' (boolean):
   - Set to TRUE if the role welcomes freshers, recent college graduates, interns, entry-level, 'batch of 2024/2025/2026', 'no experience required', or requires <= 1 year of experience.
   - When fresher-friendly with no minimum years specified, 'experience_min_years' should be 0.
3. If an explicit range is mentioned (e.g. '3-5 years'), min: 3, max: 5. If '3+ years', min: 3, max: null.

Output format:
Respond ONLY with a JSON array where each object matches this schema:
{
  "id": string (must match the input job id exactly),
  "salary_min_inr_year": integer or null,
  "salary_max_inr_year": integer or null,
  "currency": string or null,
  "experience_min_years": integer or null,
  "experience_max_years": integer or null,
  "is_fresher_friendly": boolean
}
"""


class LLMJobParser:
    """
    Direct LLM parser utilizing Gemini via FreeAPI to reliably extract compensation & experience.
    """

    @classmethod
    async def parse_job(
        cls,
        title: str,
        description: str,
        salary_raw: str | None = None,
        attributes: list[Any] | None = None,
        native_min_years: int | None = None,
        native_max_years: int | None = None,
    ) -> dict[str, Any]:
        """
        Parses compensation and experience directly using the LLM with fallback handling.
        """
        # Truncate description safely
        desc_snippet = (description or "").strip()[:5000]
        attrs_str = ", ".join([str(a.get("label", a) if isinstance(a, dict) else a) for a in (attributes or [])])

        user_content = (
            f"Role Title: {title}\n"
            f"Raw Salary Snippet: {salary_raw or 'None'}\n"
            f"Attributes / Tags: {attrs_str or 'None'}\n"
            f"Native Experience Min: {native_min_years}\n"
            f"Native Experience Max: {native_max_years}\n\n"
            f"Job Description:\n{desc_snippet}"
        )

        if not settings.freeapi_api_key:
            logger.warning("FREEAPI_API_KEY is not configured; returning empty parse result.")
            return cls._empty_result(
                salary_raw=salary_raw,
                title=title,
                description=description,
                attributes=attributes,
                native_min_years=native_min_years,
                native_max_years=native_max_years,
            )

        headers = {
            "Authorization": f"Bearer {settings.freeapi_api_key}",
            "Content-Type": "application/json",
        }
        endpoint = f"{settings.freeapi_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": settings.freeapi_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.0,
        }

        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                async with AsyncSession(timeout=15.0) as session:
                    resp = await session.post(endpoint, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        content = data["choices"][0]["message"]["content"].strip()
                        clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.MULTILINE).strip()
                        parsed = json.loads(clean_json)

                        min_sal = parsed.get("salary_min_inr_year")
                        max_sal = parsed.get("salary_max_inr_year")
                        min_exp = parsed.get("experience_min_years")
                        max_exp = parsed.get("experience_max_years")
                        fresher = bool(parsed.get("is_fresher_friendly", False))

                        return {
                            "salary_min_inr_year": int(min_sal) if min_sal is not None else None,
                            "salary_max_inr_year": int(max_sal) if max_sal is not None else None,
                            "salary_currency_raw": parsed.get("currency") or "INR",
                            "experience_min_years": int(min_exp) if min_exp is not None else (0 if fresher else None),
                            "experience_max_years": int(max_exp) if max_exp is not None else None,
                            "is_fresher_friendly": fresher,
                        }
                    elif resp.status_code == 429 and attempt < max_retries:
                        delay = 0.5 * (attempt + 1)
                        logger.warning(f"LLM parsing rate limited (429), retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.warning(f"LLM parsing returned status code {resp.status_code}: {resp.text}")
                        break
            except Exception as exc:
                logger.warning(f"LLM parsing invocation failed (attempt {attempt + 1}): {exc}")
                if attempt < max_retries:
                    await asyncio.sleep(0.5 * (attempt + 1))
                else:
                    break

        return cls._empty_result(
            salary_raw=salary_raw,
            title=title,
            description=description,
            attributes=attributes,
            native_min_years=native_min_years,
            native_max_years=native_max_years,
        )

    @classmethod
    def _empty_result(
        cls,
        salary_raw: str | None = None,
        title: str = "",
        description: str = "",
        attributes: list[Any] | None = None,
        native_min_years: int | None = None,
        native_max_years: int | None = None,
    ) -> dict[str, Any]:
        from src.services.pay_normalizer import PayNormalizer
        from src.services.experience_extractor import ExperienceExtractor

        pay_res = PayNormalizer.normalize(raw_salary=salary_raw, description=description)
        exp_res = ExperienceExtractor.extract(
            native_min=native_min_years,
            native_max=native_max_years,
            description=description,
            attributes=attributes,
        )

        return {
            "salary_min_inr_year": pay_res.get("min_inr"),
            "salary_max_inr_year": pay_res.get("max_inr"),
            "salary_currency_raw": pay_res.get("currency") or "INR",
            "experience_min_years": exp_res.get("min_years"),
            "experience_max_years": exp_res.get("max_years"),
            "is_fresher_friendly": exp_res.get("is_fresher_friendly", False),
        }

    @classmethod
    async def parse_jobs_batch(
        cls,
        jobs: list[dict[str, Any]],
    ) -> dict[str, dict[str, Any]]:
        """
        Parses a batch of up to 25+ jobs in a single LLM request.
        Returns a dict mapping job ID -> parsed fields dict.
        Falls back cleanly to regex normalization for any failed/missing jobs.
        """
        if not jobs:
            return {}

        results: dict[str, dict[str, Any]] = {}

        # Prepare payload for LLM
        llm_input = []
        for j in jobs:
            jid = str(j["id"])
            attrs = j.get("attributes") or []
            attrs_str = ", ".join([str(a.get("label", a) if isinstance(a, dict) else a) for a in attrs])
            desc_snip = (j.get("description") or j.get("description_text") or "").strip()[:2000]
            item = {
                "id": jid,
                "title": j.get("title", ""),
                "salary_raw": j.get("salary_raw"),
                "attributes": attrs_str or None,
                "native_min_years": j.get("native_min_years"),
                "native_max_years": j.get("native_max_years"),
                "description": desc_snip,
            }
            llm_input.append(item)

        if not settings.freeapi_api_key:
            logger.warning("FREEAPI_API_KEY is not configured; using regex fallback for all batch jobs.")
            for j in jobs:
                jid = str(j["id"])
                results[jid] = cls._empty_result(
                    salary_raw=j.get("salary_raw"),
                    title=j.get("title", ""),
                    description=j.get("description") or j.get("description_text") or "",
                    attributes=j.get("attributes"),
                    native_min_years=j.get("native_min_years"),
                    native_max_years=j.get("native_max_years"),
                )
            return results

        user_content = f"Please parse the following {len(llm_input)} jobs:\n" + json.dumps(llm_input, indent=2)

        headers = {
            "Authorization": f"Bearer {settings.freeapi_api_key}",
            "Content-Type": "application/json",
        }
        endpoint = f"{settings.freeapi_base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": settings.freeapi_model,
            "messages": [
                {"role": "system", "content": SYSTEM_BATCH_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.0,
        }

        parsed_list = None
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                timeout_s = min(90.0, max(20.0, len(jobs) * 2.5))
                async with AsyncSession(timeout=timeout_s) as session:
                    resp = await session.post(endpoint, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        content = data["choices"][0]["message"]["content"].strip()
                        clean_json = re.sub(r"^```(?:json)?\s*", "", content)
                        clean_json = re.sub(r"\s*```$", "", clean_json).strip()
                        loaded = json.loads(clean_json)
                        if isinstance(loaded, list):
                            parsed_list = loaded
                            break
                        elif isinstance(loaded, dict) and "jobs" in loaded and isinstance(loaded["jobs"], list):
                            parsed_list = loaded["jobs"]
                            break
                    elif resp.status_code == 429 and attempt < max_retries:
                        delay = 1.0 * (attempt + 1)
                        logger.warning(f"Batch LLM rate limited (429), retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.warning(f"Batch LLM parsing returned status {resp.status_code}: {resp.text[:300]}")
                        break
            except Exception as exc:
                logger.warning(f"Batch LLM invocation error (attempt {attempt + 1}): {exc}")
                if attempt < max_retries:
                    await asyncio.sleep(1.0 * (attempt + 1))
                else:
                    break

        # Map parsed responses by ID
        if parsed_list:
            for item in parsed_list:
                if not isinstance(item, dict):
                    continue
                item_id = str(item.get("id"))
                min_sal = item.get("salary_min_inr_year")
                max_sal = item.get("salary_max_inr_year")
                min_exp = item.get("experience_min_years")
                max_exp = item.get("experience_max_years")
                fresher = bool(item.get("is_fresher_friendly", False))

                results[item_id] = {
                    "salary_min_inr_year": int(min_sal) if min_sal is not None else None,
                    "salary_max_inr_year": int(max_sal) if max_sal is not None else None,
                    "salary_currency_raw": item.get("currency") or "INR",
                    "experience_min_years": int(min_exp) if min_exp is not None else (0 if fresher else None),
                    "experience_max_years": int(max_exp) if max_exp is not None else None,
                    "is_fresher_friendly": fresher,
                }

        # Fallback for any missing items in results
        for j in jobs:
            jid = str(j["id"])
            if jid not in results:
                logger.info(f"Job {jid} missing from LLM batch output, falling back to regex.")
                results[jid] = cls._empty_result(
                    salary_raw=j.get("salary_raw"),
                    title=j.get("title", ""),
                    description=j.get("description") or j.get("description_text") or "",
                    attributes=j.get("attributes"),
                    native_min_years=j.get("native_min_years"),
                    native_max_years=j.get("native_max_years"),
                )

        return results
