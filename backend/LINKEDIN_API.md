# LinkedIn Job Scraping API Documentation

This document describes the LinkedIn Guest Scraper endpoints, guardrails, and data schemas for frontend agents and integration services.

## Overview
LinkedIn protects authenticated desktop and mobile search sessions behind strict login walls and multi-factor bot challenges. This backend bypasses authentication requirements by targeting LinkedIn's public unauthenticated guest search (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`) and single job posting details (`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}`) endpoints. It utilizes browser TLS ClientHello impersonation (`curl_cffi` / Chrome 120 profile) with automatic fallback to `httpx`.

---

## Base URL
* Local: `http://localhost:8030`
* Public Tunnel: `https://discipline-joining-preparing-runs.trycloudflare.com`
* Swagger Interactive Docs: `/docs`
* Interactive Test Portal: `/linkedin`

---

## Endpoints

### 1. Scrape LinkedIn Job Postings
Queries job listings matching keywords, location, workplace type, time freshness, and seniority. Returns standardized job listings with direct canonical URLs and optional rich HTML descriptions.

* **Endpoint:** `GET /api/scrape/linkedin`
* **Response Status:** `200 OK`

#### Query Parameters

| Parameter | Type | Required | Default | Allowed Values / Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `keywords` | `string` | No | `"software engineer"` | Non-empty string | Role, skills, or job title search query (e.g. `ai engineer`, `backend engineer`, `devops`). |
| `location` | `string` | No | `"India"` | Non-empty string | Target country or city (e.g. `India`, `Bengaluru`, `Pune`, `Delhi`). |
| `start` | `integer` | No | `0` | `0` to `975` | Pagination start offset. **Hard ceiling enforced at 975** to prevent automated redirects to `linkedin.com/authwall`. |
| `limit` | `integer` | No | `20` | `1` to `100` | Maximum number of job postings to return in this request. |
| `time_range` | `string` | No | `null` | `r86400`, `r604800`, `r2592000` | Freshness filter: `r86400` (past 24 hours), `r604800` (past week), `r2592000` (past month). |
| `work_type` | `string` | No | `null` | `"1"`, `"2"`, `"3"` | Workplace setting: `"1"` (On-site), `"2"` (Remote), `"3"` (Hybrid). |
| `seniority` | `string` | No | `null` | `"1"`, `"2"`, `"3"`, `"4"`, `"5"` | Seniority level: `"1"` (Internship), `"2"` (Entry Level), `"3"` (Associate), `"4"` (Mid-Senior), `"5"` (Director). |
| `fetch_descriptions` | `boolean` | No | `true` | `true`, `false` | When `true`, concurrently fetches full job descriptions from the single job endpoint. Backed by a 24-hour LRU cache. |

#### Example Request
```http
GET /api/scrape/linkedin?keywords=ai+engineer&location=Bengaluru&work_type=2&time_range=r604800&limit=15&fetch_descriptions=true
```

#### Success Response (`200 OK`)
```json
[
  {
    "external_id": "4430825102",
    "title": "AI Engineer",
    "company_name": "Shamrock AI",
    "source": "linkedin",
    "location_raw": "Bengaluru, Karnataka, India",
    "city": "bengaluru",
    "is_remote": true,
    "is_international": false,
    "salary_raw": null,
    "salary_min": null,
    "salary_max": null,
    "currency": "INR",
    "url": "https://www.linkedin.com/jobs/view/4430825102",
    "description_text": "You will build the AI layer that makes our platform work...",
    "description_html": "<div class=\"show-more-less-html__markup\">You will build the AI layer...</div>",
    "posted_at": "2026-06-22T00:00:00Z",
    "experience_min_years": null,
    "experience_max_years": null,
    "company_logo_url": "https://media.licdn.com/dms/image/v2/.../company-logo.png",
    "company_website": "https://www.linkedin.com/company/shamrock-ai"
  }
]
```

---

## Data Schema: `JobItem`

| Field Name | Type | Nullable | Description |
| :--- | :--- | :---: | :--- |
| `external_id` | `string` | No | Numerical job identifier assigned by LinkedIn parsed from `urn:li:jobPosting:{id}` (e.g. `4430825102`). |
| `title` | `string` | No | Cleaned role title. |
| `company_name` | `string` | No | Employer name. |
| `source` | `string` | No | Always `"linkedin"` for this endpoint. |
| `location_raw` | `string` | No | Original human-readable location string from the job card. |
| `city` | `string` | **Yes** | Standardized, normalized lowercase tech city slug (e.g. `"bengaluru"`, `"pune"`, `"delhi-ncr"`). |
| `is_remote` | `boolean` | No | `true` if remote, work-from-home, or remote workplace flag is detected. |
| `is_international` | `boolean` | No | `true` if the posting is located outside domestic India market. |
| `salary_raw` | `string` | **Yes** | Raw compensation string if specified. |
| `salary_min` | `float` | **Yes** | Normalized minimum numerical compensation bound. |
| `salary_max` | `float` | **Yes** | Normalized maximum numerical compensation bound. |
| `currency` | `string` | No | ISO 4217 Currency code (`"INR"`, `"USD"`, etc.). Defaults to `"INR"`. |
| `url` | `string` | No | Canonical, direct view URL (`https://www.linkedin.com/jobs/view/{external_id}`). |
| `description_text` | `string` | No | Cleaned plain-text description with HTML tags stripped and whitespace normalized. |
| `description_html` | `string` | **Yes** | Rich HTML body of the job posting from `.show-more-less-html__markup`. |
| `posted_at` | `string` | **Yes** | ISO 8601 UTC timestamp extracted from the posting's `<time datetime="...">` attribute. |
| `experience_min_years` | `integer` | **Yes** | Minimum experience years required. |
| `experience_max_years` | `integer` | **Yes** | Maximum experience years required. |
| `company_logo_url` | `string` | **Yes** | URL to employer logo image asset. |
| `company_website` | `string` | **Yes** | URL to employer LinkedIn company page. |

---

## Built-In Backend Guardrails

1. **Strict 975 Pagination Ceiling:**
   * LinkedIn unauthenticated guest search strictly caps offsets below 1,000. Offsets at or above 1,000 trigger automated HTTP 302 redirects to `linkedin.com/authwall`.
   * The backend automatically clamps `start = min(start, 975)`.
2. **In-Memory 24-Hour TTL Description Cache:**
   * Full job detail responses are cached in-memory keyed by `job_id`. Repeated searches containing identical roles do not make redundant upstream detail requests, minimizing IP traffic.
3. **Concurrency Semaphore & Throttling:**
   * Detail fetches run through an `asyncio.Semaphore(5)` with a 100ms throttle buffer between requests to prevent HTTP 429 burst rate limits.
4. **HTML Parsing Anomaly Detection:**
   * If an upstream response exceeds 5,000 bytes but yields 0 parsed cards, the backend logs an alert indicating possible upstream CSS class name changes.
5. **TLS ClientHello Impersonation:**
   * Employs `curl_cffi` using the `chrome120` profile to replicate realistic browser cipher suites, with automated fallback to `httpx`.

---

## Frontend Integration Example (TypeScript)

```typescript
export interface JobItem {
  external_id: string;
  title: string;
  company_name: string;
  source: 'linkedin';
  location_raw: string;
  city: string | null;
  is_remote: boolean;
  is_international: boolean;
  salary_raw: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  url: string;
  description_text: string;
  description_html: string | null;
  posted_at: string | null;
  company_logo_url: string | null;
  company_website: string | null;
}

export async function fetchLinkedInJobs(params: {
  keywords?: string;
  location?: string;
  start?: number;
  limit?: number;
  timeRange?: 'r86400' | 'r604800' | 'r2592000';
  workType?: '1' | '2' | '3';
  seniority?: '1' | '2' | '3' | '4' | '5';
  fetchDescriptions?: boolean;
}): Promise<JobItem[]> {
  const query = new URLSearchParams();
  if (params.keywords) query.set('keywords', params.keywords);
  if (params.location) query.set('location', params.location);
  if (params.start !== undefined) query.set('start', Math.min(params.start, 975).toString());
  if (params.limit !== undefined) query.set('limit', params.limit.toString());
  if (params.timeRange) query.set('time_range', params.timeRange);
  if (params.workType) query.set('work_type', params.workType);
  if (params.seniority) query.set('seniority', params.seniority);
  if (params.fetchDescriptions !== undefined) {
    query.set('fetch_descriptions', params.fetchDescriptions.toString());
  }

  const response = await fetch(`/api/scrape/linkedin?${query.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `LinkedIn search failed with status ${response.status}`);
  }

  return response.json();
}
```
