# Indeed Job Scraping API Documentation

This document describes the Indeed Mobile GraphQL scraper endpoints, guardrails, and data schemas for frontend agents and integration services.

## Overview
Indeed protects its desktop search cards behind Cloudflare Turnstile bot challenges. This backend bypasses challenges by connecting directly to Indeed's unauthenticated mobile GraphQL gateway (`https://apis.indeed.com/graphql`) using TLS fingerprint impersonation (`curl_cffi` / iOS Safari 17.2 profile) and static mobile API signatures.

---

## Base URL
* Local: `http://localhost:8020`
* Public Tunnel: `https://established-loop-purchasing-dealers.trycloudflare.com`
* Swagger Interactive Docs: `/docs`
* ReDoc: `/redoc`

---

## Endpoints

### 1. Scrape Indeed Job Postings
Queries job listings matching given keywords, location, sorting preferences, and search radius. Supports cursor-based multi-page pagination.

* **Endpoint:** `GET /api/scrape/indeed`
* **Response Status:** `200 OK`

#### Query Parameters

| Parameter | Type | Required | Default | Allowed Values / Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `what` | `string` | **Yes** | `"ai engineer"` | Non-empty string | Job title, role, or keywords. Supports operators: `title:"sdet"` (title-only) or `"ai engineer"` (exact phrase). |
| `where` | `string` | **Yes** | `"India"` | Non-empty string | Target location (e.g. `Pune`, `Bangalore, Karnataka`, `Remote`, `India`). |
| `limit` | `integer` | No | `20` | `1` to `100` | Maximum number of job postings to return in this batch (clamped to 100 by Indeed API). |
| `sort` | `string` | No | `"relevance"` | `"relevance"`, `"date"` | `relevance` matches Indeed App ranking; `date` prioritizes newest postings first. |
| `radius` | `integer` | No | `25` | `0` to `200` | Geographic search distance around the target location. |
| `radius_unit` | `string` | No | `"KILOMETERS"` | `"KILOMETERS"`, `"MILES"`, `"KM"` | Distance measurement unit. |
| `cursor` | `string` | No | `null` | String token | Pagination cursor obtained from `next_cursor` of a previous response. |

#### Example Request
```http
GET /api/scrape/indeed?what=title:%22ai%20engineer%22&where=Bangalore,%20Karnataka&limit=20&sort=relevance&radius=25&radius_unit=KILOMETERS
```

#### Success Response (`200 OK`)
```json
{
  "query": "title:\"ai engineer\"",
  "location": "Bangalore, Karnataka",
  "total_count": 2,
  "next_cursor": "AAIAAQACAAAAAAAAAAAAAAACYxj34QEAAKimjvf6",
  "sort": "relevance",
  "radius_km": 25,
  "items": [
    {
      "external_id": "d99dd29169aad24d",
      "title": "AI Engineer 4A",
      "company_name": "Genpact",
      "source": "indeed",
      "location_raw": "Bengaluru, Karnataka",
      "city": "bengaluru",
      "is_remote": false,
      "is_international": false,
      "salary_raw": null,
      "salary_min": null,
      "salary_max": null,
      "currency": "INR",
      "url": "https://www.indeed.com/viewjob?jk=d99dd29169aad24d",
      "description_text": "AI Engineer Ready to turn bold ideas into real-world impact...",
      "description_html": "<div>AI Engineer<p></p><p><b>Ready to turn bold ideas...</b></p></div>",
      "posted_at": "2026-09-04T05:00:00Z",
      "experience_min_years": null,
      "experience_max_years": null,
      "company_logo_url": null,
      "company_website": null
    }
  ]
}
```

---

## Data Schema: `JobItem`

| Field Name | Type | Nullable | Description |
| :--- | :--- | :---: | :--- |
| `external_id` | `string` | No | Unique alphanumeric job identifier key assigned by Indeed (e.g. `d99dd29169aad24d`). |
| `title` | `string` | No | Cleaned role title. |
| `company_name` | `string` | No | Employer or recruitment agency name. Defaults to `"Unknown"` if omitted. |
| `source` | `string` | No | Always `"indeed"` for this endpoint. |
| `location_raw` | `string` | No | Original human-readable location string from the job card. |
| `city` | `string` | **Yes** | Standardized, normalized lowercase city slug (e.g. `"pune"`, `"bengaluru"`, `"mumbai"`). |
| `is_remote` | `boolean` | No | `true` if remote, work-from-home, or telecommute is detected. |
| `is_international` | `boolean` | No | `true` if the posting is located outside India. |
| `salary_raw` | `string` | **Yes** | Formatted salary string (e.g. `"₹50 - ₹100 an hour"`, `"2500000 - 4000000 per year"`). |
| `salary_min` | `float` | **Yes** | Normalized minimum numerical compensation bound. |
| `salary_max` | `float` | **Yes** | Normalized maximum numerical compensation bound. |
| `currency` | `string` | No | ISO 4217 Currency code (`"INR"`, `"USD"`, `"EUR"`, `"GBP"`). Defaults to `"INR"`. |
| `url` | `string` | No | Direct canonical URL to the posting on Indeed (`https://www.indeed.com/viewjob?jk={id}`). |
| `description_text` | `string` | No | Cleaned plain-text description with stripped HTML tags and normalized whitespace. |
| `description_html` | `string` | **Yes** | Original HTML body of the job posting for rich detail rendering. |
| `posted_at` | `string` | **Yes** | ISO 8601 UTC timestamp of when the job was published (e.g. `"2026-09-04T05:00:00Z"`). |

---

## Error Handling & Status Codes

All errors return a standardized JSON structure:
```json
{
  "error": "MACHINE_READABLE_CODE",
  "detail": "Human-readable explanation of the issue.",
  "retry_after": null
}
```

| HTTP Status | Error Code (`error`) | Cause | Frontend Action |
| :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | `INVALID_QUERY` / `INVALID_LOCATION` | Missing or empty search string (`what` or `where`). | Show validation message to the user. |
| **`400 Bad Request`** | `GRAPHQL_ERROR` | Upstream GraphQL schema syntax error. | Check query parameters. |
| **`429 Too Many Requests`** | `UPSTREAM_RATE_LIMITED` | Indeed detected high request volume from this IP. `retry_after` indicates seconds to wait. | Display a cooldown notification and disable search button for `retry_after` seconds. |
| **`502 Bad Gateway`** | `UPSTREAM_BLOCKED` | Upstream mobile API key or TLS fingerprint was rejected (401/403). | Alert backend administrator to update `INDEED_API_KEY`. |
| **`500 Internal Error`** | `INTERNAL_SERVER_ERROR` | Unhandled backend exception. | Display generic failure retry notification. |

---

## Built-in Backend Guardrails

1. **Concurrency Lock (Mutex Semaphore):**
   * Only **1 active request** queries Indeed's mobile gateway at any time. Incoming requests queue safely without bursting against Indeed.
2. **Jittered Rate Limiter:**
   * Enforces an automatic **1.2s to 1.6s delay** between upstream requests to prevent rate limit triggers (HTTP 429).
3. **Exponential Backoff Retries:**
   * Transient network errors and HTTP 429s automatically retry up to **2 times** with progressive backoff.
4. **Input Sanitization & Clamping:**
   * Special characters and quotes are sanitized to prevent GraphQL syntax breaks.
   * `limit` is strictly bounded between `1` and `100` (Indeed's maximum per page).

---

## Frontend Integration Example (TypeScript)

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

  const response = await fetch(`/api/scrape/indeed?${query.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}
```
