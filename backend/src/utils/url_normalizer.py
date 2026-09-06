import re
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "trk", "trkinfo", "trackingid", "ref", "refid", "from", "vjs", "tk",
    "gclid", "fbclid", "mc_cid", "mc_eid", "context", "midtoken", "origin",
}

def normalize_job_url(url: str | None) -> str:
    """
    Normalizes job URLs by:
    1. Stripping tracking parameters (utm_*, trk, ref, trackingId, etc.)
    2. Enforcing HTTPS scheme and lowercasing hostname
    3. Canonicalizing common job portal URLs (Indeed, LinkedIn, Wellfound)
    4. Stripping trailing slashes
    """
    if not url or not isinstance(url, str):
        return ""

    clean = url.strip()
    if not clean:
        return ""

    try:
        parsed = urlparse(clean)
    except Exception:
        return clean

    scheme = "https" if parsed.scheme in ("http", "https") else (parsed.scheme or "https")
    netloc = parsed.netloc.lower()

    # Canonicalize LinkedIn URLs:
    # https://www.linkedin.com/jobs/view/123456789/... -> https://www.linkedin.com/jobs/view/123456789
    if "linkedin.com" in netloc:
        match = re.search(r"/jobs/view/([^/?#]+)", parsed.path)
        if match:
            job_id = match.group(1)
            return f"https://www.linkedin.com/jobs/view/{job_id}"

    # Canonicalize Indeed URLs:
    # https://www.indeed.com/viewjob?jk=abcdef -> https://www.indeed.com/viewjob?jk=abcdef
    if "indeed.com" in netloc:
        # Check if jk is in query params
        query_dict = dict(parse_qsl(parsed.query, keep_blank_values=False))
        jk = query_dict.get("jk")
        if jk:
            return f"https://www.indeed.com/viewjob?jk={jk}"
        # Check if jk is in path /viewjob/abcdef or /rc/clk?jk=abcdef
        jk_match = re.search(r"[?&]jk=([a-zA-Z0-9]+)", clean)
        if jk_match:
            return f"https://www.indeed.com/viewjob?jk={jk_match.group(1)}"

    # Canonicalize Wellfound URLs:
    # https://wellfound.com/jobs/12345-title -> https://wellfound.com/jobs/12345
    if "wellfound.com" in netloc or "angel.co" in netloc:
        match = re.search(r"/jobs/(\d+)", parsed.path)
        if match:
            job_id = match.group(1)
            # Retain slug if present, but strip query params
            slug_match = re.search(r"/jobs/(\d+-[a-zA-Z0-9\-]+)", parsed.path)
            path_val = f"/jobs/{slug_match.group(1)}" if slug_match else f"/jobs/{job_id}"
            return f"https://wellfound.com{path_val}"

    # General URL cleaning: strip tracking parameters
    filtered_queries = [
        (k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS
    ]
    query_str = urlencode(filtered_queries)
    path = parsed.path.rstrip("/") if parsed.path != "/" else "/"

    normalized = urlunparse((
        scheme,
        netloc,
        path,
        parsed.params,
        query_str,
        ""  # Strip fragment
    ))
    return normalized.rstrip("/")
