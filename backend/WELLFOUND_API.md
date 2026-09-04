# Wellfound Job Scraping API Documentation

This document describes the Wellfound scraper endpoints, guardrails, and data schemas for frontend agents and integration services.

## Overview
Wellfound protects its standard search feed and internal GraphQL endpoint behind Cloudflare Turnstile bot challenges. This backend bypasses those challenges by leveraging public, Server-Side Rendered (SSR) search directory landing pages (`/role/l/{role_slug}/{location_slug}`) and extracting the normalized Apollo Client cache (`__NEXT_DATA__`).

---

## Base URL
* Local: `http://localhost:8020`
* Public Tunnel: `https://established-loop-purchasing-dealers.trycloudflare.com`

---

## Endpoints

### 1. Get Supported Roles & Locations
Provides the curated list of verified roles, locations, and pagination ceilings. Use this to populate frontend select inputs and validate user filters.

* **Endpoint:** `GET /api/wellfound/roles`
* **Response Status:** `200 OK`
* **Response Payload:**
```json
{
  "roles": [
    { "slug": "ai-engineer", "name": "AI Engineer" },
    { "slug": "machine-learning-engineer", "name": "Machine Learning Engineer" },
    { "slug": "deep-learning-engineer", "name": "Deep Learning Engineer" },
    { "slug": "data-scientist", "name": "Data Scientist" },
    { "slug": "backend-engineer", "name": "Backend Engineer" },
    { "slug": "frontend-engineer", "name": "Frontend Engineer" },
    { "slug": "full-stack-engineer", "name": "Full Stack Engineer" },
    { "slug": "qa-engineer", "name": "QA Engineer" },
    { "slug": "sdet", "name": "SDET" },
    { "slug": "devops-engineer", "name": "DevOps Engineer" },
    { "slug": "prompt-engineer", "name": "Prompt Engineer" },
    { "slug": "intern", "name": "Engineering Intern" }
  ],
  "locations": [
    { "slug": "india", "name": "All India" },
    { "slug": "bengaluru", "name": "Bengaluru (Karnataka)" },
    { "slug": "pune", "name": "Pune (Maharashtra)" },
    { "slug": "mumbai", "name": "Mumbai (Maharashtra)" },
    { "slug": "delhi", "name": "Delhi-NCR" },
    { "slug": "hyderabad", "name": "Hyderabad (Telangana)" },
    { "slug": "chennai", "name": "Chennai (Tamil Nadu)" },
    { "slug": "gurgaon", "name": "Gurgaon (Haryana)" },
    { "slug": "noida", "name": "Noida (Uttar Pradesh)" },
    { "slug": "remote", "name": "Remote (Anywhere)" },
    { "slug": "united-states", "name": "United States" }
  ],
  "pagination_limit": 20
}
```

---

### 2. Search Wellfound Jobs
Queries Wellfound's SSR Apollo extraction pipeline for a specific role and location.

* **Endpoint:** `GET /api/scrape/wellfound`
* **Query Parameters:**

| Parameter | Type | Required | Default | Description & Guardrails |
| :--- | :--- | :--- | :--- | :--- |
| `role` | string | No | `ai-engineer` | Role slug or search term. Automatically mapped against `SUPPORTED_WELLFOUND_ROLES` or fallback synonyms (`python` -> `backend-engineer`, `sde` -> `software-engineer`). |
| `location` | string | No | `india` | Location slug. Automatically mapped against `SUPPORTED_WELLFOUND_LOCATIONS` or synonyms (`bangalore` -> `bengaluru`, `wfh` -> `remote`). |
| `page` | integer | No | `1` | Page number. **Hard ceiling enforced:** minimum `1`, maximum `20`. Exceeding 20 returns 422 or auto-clamps to 20. |
| `limit` | integer | No | `30` | Maximum items to return (1 to 100). |
| `max_age_days` | integer | No | `null` | Filters out postings older than N days using `liveStartAt` timestamp. E.g. `3` (fresh past 3 days), `7`, `14`, `30`. |
| `include_all_company_jobs` | boolean | No | `false` | When `false`, returns spotlighted roles (`highlightedJobListings`). When `true`, expands and returns all detected company job nodes in the page's graph. |

* **Example Request:**
```bash
curl -X GET "https://established-loop-purchasing-dealers.trycloudflare.com/api/scrape/wellfound?role=ai-engineer&location=bengaluru&page=1&limit=15&max_age_days=14"
```

* **Response Status:** `200 OK`
* **Response Item Schema:**
```json
[
  {
    "external_id": "4666122",
    "title": "AI Engineer",
    "company_name": "GoComet",
    "source": "wellfound",
    "location_raw": "Bengaluru",
    "city": "bengaluru",
    "is_remote": false,
    "is_international": false,
    "salary_raw": "₹25L – ₹45L • No equity",
    "salary_min": 2500000.0,
    "salary_max": 4500000.0,
    "currency": "INR",
    "url": "https://wellfound.com/jobs/4666122-ai-engineer",
    "description_text": "AI SSE — Agentic AI Systems. Location: Bangalore. Experience: 3–8 years...",
    "description_html": "<p>AI SSE — Agentic AI Systems<br>Location: Bangalore...</p>",
    "posted_at": "2026-09-03T07:25:10Z",
    "experience_min_years": 3,
    "experience_max_years": 8,
    "company_logo_url": "https://photos.wellfound.com/startups/i/1093483-...jpg",
    "company_website": "https://wellfound.com/company/gocomet"
  }
]
```

---

### 3. Fetch Company All Jobs
Fetches all open job listings directly for a specific company slug.

* **Endpoint:** `GET /api/scrape/wellfound/company/{company_slug}`
* **Path Parameter:**
  * `company_slug` (string, required): The company slug identifier (e.g., `evam-labs`, `gocomet`, `smart-audit-1`).
* **Query Parameter:**
  * `limit` (integer, optional, default `50`): Max jobs to return.
* **Example Request:**
```bash
curl -X GET "https://established-loop-purchasing-dealers.trycloudflare.com/api/scrape/wellfound/company/evam-labs?limit=10"
```
* **Response Status:** `200 OK` (list of `JobItem` objects matching the schema above).

---

## Error Handling & Status Codes
* `200 OK`: Successful crawl and Apollo extraction. Returns JSON array (empty list if no matching roles found).
* `422 Unprocessable Entity`: Invalid query parameters (e.g. `page < 1` or `page > 20`).
* `500 Internal Server Error`: Server-side extraction or network failure with JSON error detail.

---

## Built-In Guardrails

1. **Strict Pagination Ceiling:** Hard-coded maximum of 20 pages. Prevents redirection to auth walls and Cloudflare threat escalation.
2. **Slug Normalization & Fallbacks:** Validates all incoming roles and locations against verified canonical dictionaries. Unrecognized strings safely map to `software-engineer` and `india` rather than triggering 404 or redirect errors.
3. **Rotating TLS Fingerprints:** Cycles browser ClientHello signatures (`chrome`, `safari`, `safari_ios`, `edge`) via `curl_cffi` to evade fingerprint tracking.
4. **Rate Limit Backoff:** Detects HTTP 429 and performs automated exponential backoff with randomized jitter before failing or falling back to `httpx`.
5. **Direct Clickable URLs:** Generates canonical URLs (`https://wellfound.com/jobs/{id}-{slug}`) that link directly to active jobs without intermediary tracking redirects.
