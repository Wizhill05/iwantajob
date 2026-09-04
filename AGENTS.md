# Centralised Database & Decoupled Parsing Architecture

This document provides documentation for agentic workers, frontend services, and backend maintainers regarding the PostgreSQL database architecture, raw staging tables, normalization pipelines, and manual parsing APIs.

---

## 1. System Overview & Ingestion Flow

The platform uses a decoupled **Bronze-to-Silver** storage architecture:
1. **Bronze Tier (Raw Scrapes)**: Fast, lossless insertion of the exact API responses returned by upstream scrapers. Scraping requests never fail due to parsing, token exhaustion, or LLM latency.
2. **Silver Tier (Unified Clean Jobs)**: Holds only validated, parsed jobs with normalized annual INR salaries and extracted experience bounds.
3. **Decoupled Manual Triggering**: Raw rows are promoted to the unified table **only** when explicitly requested via dedicated `/api/parse/{provider}` endpoints.

```
┌────────────────────────────────────────────────────────┐
│               SCRAPING INGESTION APIS                  │
│    GET /api/scrape/{indeed, linkedin, wellfound}       │
│                  (?persist=true)                       │
└───────────────────────────┬────────────────────────────┘
                            │ 100% Unmodified Raw Data
                            ▼
┌────────────────────────────────────────────────────────┐
│               BRONZE TIER: 3 RAW TABLES                │
│       • raw_indeed_jobs                                │
│       • raw_linkedin_jobs                              │
│       • raw_wellfound_jobs                             │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Manual Trigger via:
                            │ POST /api/parse/{provider}
                            ▼
┌────────────────────────────────────────────────────────┐
│         NORMALIZATION & EXTRACTION ENGINES             │
│   1. PayNormalizer (LPA, USD, EUR, GBP -> INR/yr)      │
│   2. ExperienceExtractor (Freshers, years range)       │
│   3. LLM Fallback (gemini-3.7-flash-tiered)           │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Clean Insert
                            ▼
┌────────────────────────────────────────────────────────┐
│            SILVER TIER: UNIFIED JOBS TABLE             │
│   unified_jobs (Fully parsed, searchable profiles)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. PostgreSQL Connection & Database Details

* **Database Engine:** PostgreSQL 16 with `pgvector`
* **Host / Port:** `localhost:5432`
* **Database Name:** `iwantajob_db`
* **User / Password:** `postgres:postgres`
* **Connection Pool:** Async SQLAlchemy with `NullPool` (eliminates event-loop crossover issues across background workers and test suites)

---

## 3. Database Schemas

### 3.1 `raw_indeed_jobs`
Stores raw results directly from Indeed's Mobile GraphQL Gateway (`apis.indeed.com/graphql`).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique record identifier (`uuid4`) |
| `external_id` | `TEXT` | UNIQUE, NOT NULL | Indeed Job Key (`job.key`, e.g. `67b6957d22787657`) |
| `tracking_key` | `TEXT` | NULLABLE | Indeed internal tracking telemetry string |
| `title` | `TEXT` | NOT NULL | Cleaned role title |
| `company_name` | `TEXT` | NOT NULL | Employer name |
| `location_raw` | `TEXT` | NOT NULL | Formatted short location string |
| `location_city` | `TEXT` | NULLABLE | Parsed city |
| `location_country`| `TEXT` | NULLABLE | Country code (e.g. `IN`, `US`) |
| `is_remote` | `BOOLEAN`| DEFAULT FALSE | Remote/work-from-home flag |
| `apply_url` | `TEXT` | NULLABLE | Direct target URL (Indeed job link or external ATS application) |
| **`easy_apply_available`** | `BOOLEAN` | DEFAULT FALSE | **TRUE** if application is hosted on Indeed; **FALSE** if external ATS redirect |
| `attributes` | `JSONB` | DEFAULT '[]' | Raw list of cards/badges (e.g. `[{"key":"...","label":"Fresher"}]`) |
| `salary_raw` | `TEXT` | NULLABLE | Raw compensation string if available |
| `description_html`| `TEXT` | NULLABLE | Job description HTML |
| `description_text`| `TEXT` | NOT NULL | Plain-text job description with tags stripped |
| `date_published` | `TIMESTAMPTZ` | NULLABLE | Upstream publication timestamp |
| `raw_payload` | `JSONB` | NOT NULL | Complete raw GraphQL result item |
| `scraped_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Ingestion timestamp |

---

### 3.2 `raw_linkedin_jobs`
Stores raw job cards and enriched descriptions from LinkedIn's Guest Endpoints (`seeMoreJobPostings` & `jobPosting/{id}`).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique record identifier (`uuid4`) |
| `external_id` | `TEXT` | UNIQUE, NOT NULL | LinkedIn numerical job ID (e.g. `4455902670`) |
| `title` | `TEXT` | NOT NULL | Cleaned role title |
| `company_name` | `TEXT` | NOT NULL | Hiring company name |
| `company_logo_url`| `TEXT` | NULLABLE | Media URL for company logo image asset |
| `company_website` | `TEXT` | NULLABLE | LinkedIn company profile or external company website |
| `location_raw` | `TEXT` | NOT NULL | Location text from card |
| `city` | `TEXT` | NULLABLE | Lowercase city slug |
| `is_remote` | `BOOLEAN`| DEFAULT FALSE | Remote workplace setting |
| `is_international`| `BOOLEAN`| DEFAULT FALSE | Indicates non-domestic role |
| `url` | `TEXT` | NOT NULL | Canonical URL (`https://www.linkedin.com/jobs/view/{id}`) |
| `salary_raw` | `TEXT` | NULLABLE | Raw compensation string |
| `description_html`| `TEXT` | NULLABLE | Raw description HTML markup |
| `description_text`| `TEXT` | NOT NULL | Sanitized description text |
| `posted_at` | `TIMESTAMPTZ` | NULLABLE | Original post timestamp |
| `raw_payload` | `JSONB` | NOT NULL | Full unmodified scraping dictionary |
| `scraped_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Ingestion timestamp |

---

### 3.3 `raw_wellfound_jobs`
Stores raw SSR Apollo Client graph extractions (`__NEXT_DATA__`) from Wellfound.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique record identifier (`uuid4`) |
| `external_id` | `TEXT` | UNIQUE, NOT NULL | Wellfound Apollo listing ID (e.g. `4235671`) |
| `job_slug` | `TEXT` | NOT NULL | URL slug (e.g. `ai-engineer`) |
| `title` | `TEXT` | NOT NULL | Role title |
| `company_name` | `TEXT` | NOT NULL | Startup name |
| `company_slug` | `TEXT` | NULLABLE | Wellfound company handle |
| `company_logo_url`| `TEXT` | NULLABLE | Startup logo image link |
| `company_website` | `TEXT` | NULLABLE | Wellfound company page URL |
| `location_raw` | `TEXT` | NOT NULL | Unparsed location string |
| `locations_list` | `JSONB` | DEFAULT '[]' | Array of target location names |
| `is_remote` | `BOOLEAN`| DEFAULT FALSE | Remote flexibility flag |
| `is_international`| `BOOLEAN`| DEFAULT FALSE | International posting flag |
| `salary_raw` | `TEXT` | NULLABLE | Compensation string (e.g. `₹25L – ₹45L • No equity`) |
| `native_years_min`| `INTEGER`| NULLABLE | Native Apollo `yearsExperienceMin` bound |
| `native_years_max`| `INTEGER`| NULLABLE | Native Apollo `yearsExperienceMax` bound |
| `live_start_at` | `BIGINT` | NULLABLE | Epoch timestamp of role publication |
| `url` | `TEXT` | NOT NULL | Canonical URL (`https://wellfound.com/jobs/{id}-{slug}`) |
| `description_html`| `TEXT` | NULLABLE | Job description HTML |
| `description_text`| `TEXT` | NOT NULL | Sanitized description text |
| `posted_at` | `TIMESTAMPTZ` | NULLABLE | UTC posting timestamp |
| `raw_payload` | `JSONB` | NOT NULL | Full Apollo graph node payload |
| `scraped_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Ingestion timestamp |

---

### 3.4 `unified_jobs` (Clean Standardized Profiles)
Central table containing only parsed, clean, and normalized job postings. Unparsed records remain in raw tables until parsed.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique record identifier (`uuid4`) |
| `source` | `TEXT` | NOT NULL | Aggregator source (`'indeed'`, `'linkedin'`, `'wellfound'`) |
| `external_id` | `TEXT` | NOT NULL | Platform external key |
| `raw_ref_id` | `UUID` | NOT NULL, INDEX | Foreign reference to the source raw table row |
| `url` | `TEXT` | UNIQUE, NOT NULL | Direct canonical job link |
| `title` | `TEXT` | NOT NULL | Role title |
| `company_name` | `TEXT` | NOT NULL | Employer name |
| `company_logo_url`| `TEXT` | NULLABLE | Company logo URL |
| `location_raw` | `TEXT` | NOT NULL | Raw human-readable location |
| `city` | `TEXT` | NULLABLE | Standardized lowercase city slug (`bengaluru`, `pune`, etc.) |
| `is_remote` | `BOOLEAN`| DEFAULT FALSE | Whether remote work is offered |
| `is_international`| `BOOLEAN`| DEFAULT FALSE | International position flag |
| **`easy_apply_available`** | `BOOLEAN`| DEFAULT FALSE | **TRUE** if direct Indeed apply or instant apply is supported |
| **`salary_min_inr_year`** | `BIGINT` | NULLABLE | **Minimum annual salary in integer INR (Rupees per year)** |
| **`salary_max_inr_year`** | `BIGINT` | NULLABLE | **Maximum annual salary in integer INR (Rupees per year)** |
| `salary_raw` | `TEXT` | NULLABLE | Original salary string |
| `salary_currency_raw` | `TEXT` | NULLABLE | Original currency symbol/code (`INR`, `USD`, etc.) |
| `salary_extraction_method` | `TEXT` | NOT NULL | Method used: `'native'`, `'regex'`, `'llm'`, or `'none'` |
| **`experience_min_years`** | `INTEGER`| NULLABLE | **Minimum experience in years (`0` for freshers)** |
| **`experience_max_years`** | `INTEGER`| NULLABLE | Maximum experience in years |
| **`is_fresher_friendly`** | `BOOLEAN`| DEFAULT FALSE | **TRUE if role is tailored for freshers or requires <= 1 year** |
| `experience_extraction_method` | `TEXT` | NOT NULL | Method used: `'native'`, `'regex'`, `'llm'`, or `'none'` |
| `description_text` | `TEXT` | NOT NULL | Sanitized description body |
| `posted_at` | `TIMESTAMPTZ` | NULLABLE | UTC posting timestamp |
| `parsed_at` | `TIMESTAMPTZ` | DEFAULT NOW() | Timestamp when record was promoted to unified |

*Unique Constraint:* `UNIQUE(source, external_id)` prevents duplicate records across repeated parsing batches.

---

## 4. Normalization Rules & Fallbacks

### 4.1 Pay Normalization (`PayNormalizer`)
- **Conversion to Annual INR**:
  - **LPA / Lakhs**: Value multiplied by `100,000`. E.g., `15 - 25 LPA` → `min: 1500000`, `max: 2500000`.
  - **USD ($)**: Converted at 85 INR per USD. E.g., `$25k - $50k` → `min: 2125000`, `max: 4250000`.
  - **EUR (€) / GBP (£)**: Converted at 92 and 108 respectively.
  - **Monthly Pay**: If labeled per month or PM, multiplied by `12`.
  - **Hourly Pay**: Multiplied by `2,000` (standard 40 hrs/week * 50 weeks).
- **LLM Fallback Engine**:
  - If no salary is provided in the card, the plain-text description is scanned using regex. If regex yields nothing and `use_llm=true`, the description is parsed by **Gemini 3.7 Flash Tiered** via FreeAPI configured through environment variables (`FREEAPI_BASE_URL` and `FREEAPI_API_KEY`).

### 4.2 Experience & Fresher Extraction (`ExperienceExtractor`)
- **Fresher Detection**:
  - Automatically flagged as `is_fresher_friendly = TRUE` with `experience_min_years = 0` if:
    - Indeed attributes include `"Fresher"`, `"Internship"`, or `"Entry level"`.
    - Wellfound native `yearsExperienceMin` is `0` or `1`.
    - Description matches keywords: `fresher`, `recent graduate`, `college graduate`, `0-1 years`, `no experience required`, `internship`.
- **Experience Ranges**:
  - Regex detects patterns like `3 - 5 years`, `2+ years`, `minimum 4 years`.
- **LLM Fallback**:
  - When regex yields no experience information and `use_llm=true`, the prompt is dispatched to **Gemini 3.7 Flash Tiered** for JSON extraction.

---

## 5. API Reference for Parsing & Database Management

### 5.1 Pipeline Parsing Status
Inspect how many raw records have been ingested vs promoted to the unified database.

```http
GET /api/status/parsing
```

**Response (`200 OK`):**
```json
{
  "indeed": {
    "total_raw": 150,
    "parsed": 120,
    "unparsed": 30
  },
  "linkedin": {
    "total_raw": 200,
    "parsed": 200,
    "unparsed": 0
  },
  "wellfound": {
    "total_raw": 80,
    "parsed": 75,
    "unparsed": 5
  },
  "unified_total": 395
}
```

---

### 5.2 Manual Parsing Triggers
Parsing is strictly manual and decoupled. Each provider has an isolated endpoint:

#### 1. Parse Indeed Raw Jobs
```http
POST /api/parse/indeed?batch_size=50&use_llm=false
```

#### 2. Parse LinkedIn Raw Jobs
```http
POST /api/parse/linkedin?batch_size=50&use_llm=false
```

#### 3. Parse Wellfound Raw Jobs
```http
POST /api/parse/wellfound?batch_size=50&use_llm=false
```

**Parameters:**
- `batch_size` (integer, default `50`): Maximum unparsed rows to process in this run.
- `use_llm` (boolean, default `false`): When `true`, dispatches unparsed descriptions to Gemini 3.7 Flash Tiered if regex cannot determine salary or experience.

**Response (`200 OK`):**
```json
{
  "source": "indeed",
  "processed": 30,
  "promoted_to_unified": 30,
  "errors": []
}
```

---

### 5.3 Unified Jobs Query Endpoint
Query clean, standardized profiles from `unified_jobs`.

```http
GET /api/jobs/unified?is_fresher_friendly=true&easy_apply_available=true&min_salary_inr=1000000&city=bengaluru&limit=20
```

**Query Parameters:**
- `source` (`string`): Filter by `'indeed'`, `'linkedin'`, or `'wellfound'`.
- `city` (`string`): Filter by lowercase tech city slug (e.g. `'bengaluru'`, `'pune'`, `'delhi-ncr'`).
- `is_fresher_friendly` (`boolean`): Set to `true` to return strictly fresher-eligible roles (`min_years <= 1`).
- `easy_apply_available` (`boolean`): Filter for direct Indeed Apply or instant apply roles.
- `min_salary_inr` (`integer`): Filter by minimum annual compensation in INR (e.g. `1200000` for 12 LPA).
- `limit` (`integer`, default `50`, max `200`): Pagination limit.
- `offset` (`integer`, default `0`): Pagination offset.

---

### 5.4 Scrape Persistence Toggle
To ingest and save new jobs into the raw tables without triggering automatic parsing, pass `persist=true` to any scraping endpoint:

- Indeed: `GET /api/scrape/indeed?what=software+engineer&where=India&persist=true`
- LinkedIn: `GET /api/scrape/linkedin?keywords=python&location=India&persist=true`
- Wellfound: `GET /api/scrape/wellfound?role=ai-engineer&location=india&persist=true`
