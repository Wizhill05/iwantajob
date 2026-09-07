class AutoTriageService:
    """Strict pass/fail classifier mapping a unified job + prefs to save/archive/none."""

    @staticmethod
    def classify(job: dict, prefs: dict) -> tuple[str, str]:
        title = (job.get("title") or "").lower()
        if job.get("is_international") and not prefs.get("allow_international", False):
            return ("archive", "non-india")
        exp_min = job.get("experience_min_years")
        max_exp = prefs.get("max_experience_years", 2)
        if exp_min is not None and max_exp is not None and exp_min > max_exp:
            return ("archive", f"experienced-{exp_min}y-over-limit")
        for kw in prefs.get("blocked_title_keywords") or []:
            if kw.lower() in title:
                return ("archive", f"blocked-title:{kw}")
        if prefs.get("require_fresher_friendly") and not job.get("is_fresher_friendly"):
            return ("none", "not-fresher")
        min_sal = prefs.get("min_salary_inr_year")
        if min_sal is not None and (job.get("salary_min_inr_year") or 0) < min_sal:
            return ("none", "below-min-salary")
        cities = prefs.get("preferred_cities") or []
        if cities and (job.get("city") or "") not in [c.lower() for c in cities]:
            return ("none", "city-not-preferred")
        for kw in prefs.get("preferred_title_keywords") or []:
            if kw.lower() in title:
                return ("save", f"matched:{kw}")
        return ("none", "no-match")
