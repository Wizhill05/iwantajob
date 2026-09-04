# Autonomous Job Discovery API Specification

**Service Version:** `1.0.0`  
**Base URL (Production / Tunnel):** `https://established-loop-purchasing-dealers.trycloudflare.com`  
**Base URL (Localhost):** `http://localhost:8020`  
**Interactive Swagger UI:** `/docs`  
**ReDoc Documentation:** `/redoc`  
**CORS Policy:** Enabled for all origins (`*`) with support for GET, POST, PUT, PATCH, DELETE.

---

## 1. Overview

This backend API provides structured, real-time job scraping and candidate matching capabilities. It interfaces with upstream job aggregator gateways (starting with Indeed Mobile GraphQL) without triggering Cloudflare Turnstile blocks.

This document serves as the interface contract for frontend developers and autonomous agents building dashboard user interfaces.

---

## 2. API Endpoints

### 2.1. System Health Check

Inspect the API service health and runtime readiness.

* **Method:** `GET`
* **Path:** `/health`
* **Authentication:** None
* **Rate Limit:** None

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

### 2.2. Indeed Mobile Scraper Gateway

Queries open roles from Indeed's mobile GraphQL gateway using TLS fingerprint impersonation and mobile app signatures.

* **Method:** `GET`
* **Path:** `/api/scrape/indeed`
* **Authentication:** None

#### Query Parameters

| Parameter | Type | Required | Default | Allowed Values / Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `what` | `string` | **Yes** | `"ai engineer"` | Non-empty string | Job title, role, or keywords. Supports operators: `title:"sdet"`, `"ai engineer"`. |
| `where` | `string` | **Yes** | `"India"` | Non-empty string | Target location (e.g. `Pune`, `Bangalore, Karnataka`, `Remote`, `India`). |
| `limit` | `integer` | No | `20` | `1` to `100` | Maximum number of job postings to return in this single batch. |
| `sort` | `string` | No | `"relevance"` | `"relevance"`, `"date"` | `relevance` matches Indeed App ranking; `date` prioritizes the newest postings. |
| `radius` | `integer` | No | `25` | `0` to `200` | Geographic search distance around the target location. |
| `radius_unit` | `string` | No | `"KILOMETERS"` | `"KILOMETERS"`, `"MILES"`, `"KM"` | Distance measurement unit. |
| `cursor` | `string` | No | `null` | String token | Pagination cursor obtained from `next_cursor` of a prior response. |

---

#### Success Response (`200 OK`)

Returns a top-level payload containing query metadata, pagination cursor, and an array of standardized `items`.

```json
{
  "query": "ai engineer",
  "location": "Bangalore, Karnataka",
  "total_count": 20,
  "next_cursor": "token_string_for_next_page_or_null",
  "sort": "relevance",
  "radius_km": 25,
  "items": [
    {
      "external_id": "4072492aac731c84",
      "title": "Senior Release Engineer",
      "company_name": "GitLab Inc",
      "source": "indeed",
      "location_raw": "Bengaluru, Karnataka",
      "city": "bengaluru",
      "is_remote": false,
      "is_international": false,
      "salary_raw": "2500000 - 4000000 per year",
      "salary_min": 2500000.0,
      "salary_max": 4000000.0,
      "currency": "INR",
      "url": "https://www.indeed.com/viewjob?jk=4072492aac731c84",
      "description_text": "GitLab is the intelligent orchestration platform...",
      "description_html": "<div><p>GitLab is the intelligent...</p></div>",
      "posted_at": "2026-09-04T05:00:00Z"
    }
  ]
}
```

---

#### Item Schema Field Definitions

| Field Name | Type | Nullable | Description |
| :--- | :--- | :---: | :--- |
| `external_id` | `string` | No | Unique alphanumeric job identifier key assigned by Indeed (e.g. `4072492aac731c84`). |
| `title` | `string` | No | Cleaned role / posting title. |
| `company_name` | `string` | No | Employer or recruitment agency name. Defaults to `"Unknown"` if omitted. |
| `source` | `string` | No | Ingestion source origin (`"indeed"`). |
| `location_raw` | `string` | No | Original human-readable location string from the posting card. |
| `city` | `string` | **Yes** | Standardized, normalized lowercase city slug (e.g. `"pune"`, `"bengaluru"`, `"mumbai"`). |
| `is_remote` | `boolean` | No | `true` if remote, work-from-home, or telecommute is detected. |
| `is_international` | `boolean` | No | `true` if the posting is located outside India (e.g. US, UK, Germany, Worldwide). |
| `salary_raw` | `string` | **Yes** | Formatted salary string (e.g. `"₹50 - ₹100 an hour"`, `"2500000 - 4000000 per year"`). |
| `salary_min` | `float` | **Yes** | Normalized minimum numerical compensation bound. |
| `salary_max` | `float` | **Yes** | Normalized maximum numerical compensation bound. |
| `currency` | `string` | No | ISO 4217 Currency code (`"INR"`, `"USD"`, `"EUR"`, `"GBP"`). Defaults to `"INR"`. |
| `url` | `string` | No | Direct canonical URL to the posting on Indeed (`https://www.indeed.com/viewjob?jk={id}`). |
| `description_text` | `string` | No | Cleaned plain-text description with stripped HTML tags and normalized whitespace. |
| `description_html` | `string` | **Yes** | Original HTML body of the job posting (useful for rich rendering in detail drawers). |
| `posted_at` | `string` | **Yes** | ISO 8601 UTC timestamp of when the job was published (e.g. `"2026-09-04T05:00:00Z"`). |
| `experience_min_years` | `integer` | **Yes** | Minimum years of experience required (if stated). |
| `experience_max_years` | `integer` | **Yes** | Maximum years of experience required (if stated). |
| `company_logo_url` | `string` | **Yes** | Direct URL to the company logo image. |
| `company_website` | `string` | **Yes** | Direct URL to the company website. |

---

### 2.3. Wellfound (AngelList) Ingestion Gateway

Queries startup job postings from Wellfound using Apollo SSR state extraction, Cloudflare clearance impersonation, and canonical slug normalization.

* **Method:** `GET`
* **Path:** `/api/scrape/wellfound`
* **Authentication:** None

#### Query Parameters

| Parameter | Type | Required | Default | Allowed Values / Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `role` | `string` | No | `"ai-engineer"` | Canonical slug or role title (e.g. `ai-engineer`, `backend-engineer`, `frontend-engineer`, `sdet`, `full-stack-engineer`). |
| `location` | `string` | No | `"india"` | Canonical location slug (e.g. `india`, `bengaluru`, `pune`, `mumbai`, `delhi`, `remote`). |
| `page` | `integer` | No | `1` | `1` to `50` | Pagination page number. |
| `limit` | `integer` | No | `30` | `1` to `100` | Maximum items to return per page. |
| `max_age_days` | `integer` | No | `null` | `1` to `180` | Optional maximum listing age in days. |

#### Response (`200 OK`)
Returns an array of standardized `JobItem` objects matching the item schema described in §2.2.

---

## 3. Error Handling & Guardrails

The API provides standardized JSON error payloads matching the `ErrorDetail` model:

```json
{
  "error": "MACHINE_READABLE_CODE",
  "detail": "Human-readable explanation of the issue.",
  "retry_after": null
}
```

### HTTP Status Codes

| HTTP Status | Error Code (`error`) | Cause | Frontend Action |
| :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | `INVALID_QUERY` / `INVALID_LOCATION` | Missing or empty search string (`what` or `where`). | Show validation error message to the user. |
| **`400 Bad Request`** | `GRAPHQL_ERROR` | Upstream GraphQL schema syntax error. | Review input parameters. |
| **`429 Too Many Requests`** | `UPSTREAM_RATE_LIMITED` | Indeed detected high request volume from this IP. `retry_after` indicates seconds to wait. | Display a cooldown toast and disable search button for `retry_after` seconds. |
| **`502 Bad Gateway`** | `UPSTREAM_BLOCKED` | Upstream mobile API key or TLS fingerprint was rejected (401/403). | Notify backend administrator to rotate `INDEED_API_KEY`. |
| **`500 Internal Error`** | `INTERNAL_SERVER_ERROR` | Unhandled backend exception. | Display generic failure retry notification. |

---

## 4. Built-in Backend Safeguards

The backend includes autonomous guardrails to prevent upstream blocking:

1. **Concurrency Lock (Mutex Semaphore):**
   * Only **1 active request** is executed against Indeed's mobile gateway at any given moment.
   * Concurrent incoming queries queue automatically rather than bursting in parallel.
2. **Jittered Rate Limiter:**
   * An automatic **1.2s to 1.6s delay** is enforced between upstream requests.
3. **Exponential Backoff Retries:**
   * Transient network errors or upstream 429s automatically retry up to **2 times** with progressive backoff before failing.
4. **Input Sanitization & Clamping:**
   * Quotes, backslashes, and special characters are escaped to prevent GraphQL syntax crashes.
   * `limit` is strictly bounded between `1` and `100` (Indeed's maximum per page).

---

## 5. Frontend Integration Guide

### 5.1. TypeScript Interface Definitions

```typescript
export interface JobItem {
  external_id: string;
  title: string;
  company_name: string;
  source: 'indeed';
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
}

export interface JobSearchResponse {
  query: string;
  location: string;
  total_count: number;
  next_cursor: string | null;
  sort: 'relevance' | 'date';
  radius_km: number;
  items: JobItem[];
}

export interface ApiError {
  error: string;
  detail: string;
  retry_after?: number | null;
}
```

### 5.2. Fetch Snippet with Pagination Support

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020';

export async function fetchIndeedJobs(params: {
  what: string;
  where: string;
  limit?: number;
  sort?: 'relevance' | 'date';
  radius?: number;
  cursor?: string | null;
}): Promise<JobSearchResponse> {
  const query = new URLSearchParams({
    what: params.what,
    where: params.where,
    limit: (params.limit || 20).toString(),
    sort: params.sort || 'relevance',
    radius: (params.radius || 25).toString(),
  });

  if (params.cursor) {
    query.set('cursor', params.cursor);
  }

  const response = await fetch(`${BASE_URL}/api/scrape/indeed?${query.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      error: 'NETWORK_ERROR',
      detail: response.statusText,
    }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}
```

---

## 6. Search Targeting Tips for UI Builders

When implementing search UI components:
* **Target Role Titles Strictly:** Prepend `title:"..."` to the query (e.g. `title:"AI Engineer"`) to restrict results to job titles rather than broad body descriptions.
* **Exact Multi-Word Matching:** Wrap terms in double quotes (e.g. `"QA Automation"`).
* **Location Strings:** Use `City, State` format (e.g. `Bangalore, Karnataka` or `Pune, Maharashtra`) for the highest geographical accuracy.
