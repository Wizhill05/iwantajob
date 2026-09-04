# System Design Specification: Autonomous Job Discovery & Scraping Dashboard

**Target Repository / Working Directory:** `/home/azureuser/job-portal`  
**Date:** 2026-09-03  
**Status:** Approved Architecture Draft  

---

## 1. Executive Summary

This document specifies the end-to-end architecture for an autonomous job discovery, deduplication, scoring, and application platform. The system runs entirely on self-hosted hardware.

The platform relies on two main components:
1. **A Python 3.11+ FastAPI Orchestrator:** Manages background discovery workers, runs an APScheduler daemon for customizable cron executions, connects to a private OpenAI-compatible proxy (`freeapiforme.aryansingh.space`) for LLM scoring and skill parsing, and maintains database state.
2. **A Next.js 14 Web Dashboard:** Provides UI controls to configure search parameters (cities, listing age, seniority, international remote flags), inspect live streaming backend logs via Server-Sent Events (SSE), and browse scored jobs.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js 14 Web Dashboard                           │
│   (Filter Knobs, Active Job Feed, Cron Manager, Live Log Streamer)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST & Server-Sent Events (SSE)
┌──────────────────────────────────────v──────────────────────────────────────┐
│                    FastAPI Backend Orchestrator (:8000)                     │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │ Ingestion Engine      │  │ APScheduler Engine    │  │ Log Hub         │  │
│  │ • Direct ATS Clients  │  │ • CronTrigger daemon  │  │ • SSE Streamer  │  │
│  │ • Indeed Mobile GQL   │  │ • Single-flight lock  │  │ • Ring Buffer   │  │
│  │ • LinkedIn Guest API  │  │ • Manual run triggers │  │ • Run History   │  │
│  └──────────┬────────────┘  └───────────────────────┘  └─────────────────┘  │
│             │                                                               │
│  ┌──────────v────────────────────────────────────────────────────────────┐  │
│  │ FreeAPI Enrichment Client (OpenAI SDK)                                │  │
│  │ Target: https://freeapiforme.aryansingh.space/v1                      │  │
│  │ Model: antigravity/gemini-3.7-flash-tiered (Fallback: sonnet-4-6)     │  │
│  └──────────┬────────────────────────────────────────────────────────────┘  │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
┌─────────────v───────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database with pgvector                       │
│    (Tables: jobs, company_registry, harvest_runs, scraper_configs)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ingestion Engine & Source Breakdown

Scraping job aggregator web pages is fragile and triggers Cloudflare or Akamai rate limits. The platform uses a tiered ingestion strategy.

```
                      INGESTION PRIORITY TIERS
                      
    Tier 1 (High Reliability, $0 Cost, No Cloudflare Blocks)
    ┌────────────────────────────────────────────────────────────┐
    │ Direct ATS Public APIs (Greenhouse, Lever, Ashby, Workday) │
    │ 40+ Indian Tech Unicorns + Top Global AI Pioneers          │
    └─────────────────────────────┬──────────────────────────────┘
                                  │
    Tier 2 (Broad Marketplace Coverage via TLS Impersonation)
    ┌─────────────────────────────v──────────────────────────────┐
    │ Indeed Mobile GraphQL API (apis.indeed.com/graphql)        │
    │ Uses static mobile key + iOS headers. 100 jobs/batch       │
    └─────────────────────────────┬──────────────────────────────┘
                                  │
    Tier 3 (Public Guest Endpoints)
    ┌─────────────────────────────v──────────────────────────────┐
    │ LinkedIn Guest API (linkedin.com/jobs-guest/jobs/api/...)  │
    │ Unauthenticated HTML search segments. Offsets of 25        │
    └────────────────────────────────────────────────────────────┘
```

### Tier 1: Direct ATS Ingestion (Primary Source)
Companies publish their open roles via public, unauthenticated REST APIs to render custom career sites (`company.com/careers`). These endpoints return clean JSON, require no proxy rotation, and do not trigger CAPTCHAs.

#### 1. Greenhouse
*   **List Jobs Endpoint:** `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
*   **Job Details & Form Questions:** `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?questions=true`
*   **Response Payload Attributes:** Title, location name, department, raw HTML content, direct application URL.

#### 2. Lever
*   **List Postings Endpoint:** `GET https://api.lever.co/v0/postings/{company_name}?mode=json`
*   **Response Payload Attributes:** `id`, `text` (role title), `descriptionPlain`, `categories` (commitment, team, location), `hostedUrl`, `applyUrl`.

#### 3. Ashby
*   **List Postings Endpoint:** `GET https://api.ashbyhq.com/posting-api/job-board/{company_name}?includeCompensation=true`
*   **Response Payload Attributes:** Structured compensation bands (`compensationTierSummary`, `min`, `max`, `currencyCode`), `isRemote`, department, team, direct job URL.

#### 4. Workday Candidate Experience Service (CXS)
*   **Search & List Endpoint:** `POST https://{tenant}.wd1.myworkdaysite.com/wday/cxs/{tenant}/{site}/jobs`
*   **Payload:** `{"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "AI"}`
*   **Response Payload Attributes:** `title`, `externalPath`, `locationsText`, `postedOn`, `bulletFields`.

#### Initial Company Registry Seed
The registry database maps target companies to their ATS backend:

| Category | Company | ATS Provider | Board Identifier |
| :--- | :--- | :--- | :--- |
| **Global AI Leaders** | OpenAI | Greenhouse | `openai` |
| | Anthropic | Lever | `anthropic` |
| | Cohere | Lever | `cohere` |
| | Perplexity AI | Ashby | `perplexityai` |
| | Cursor (Anysphere) | Ashby | `anysphere` |
| | Scale AI | Greenhouse | `scaleai` |
| | Mistral AI | Lever / Custom | `mistral` |
| **Indian Tech Unicorns** | Swiggy | Lever | `swiggy` |
| | Zomato | Greenhouse | `zomato` |
| | CRED | Lever | `cred` |
| | Zepto | Greenhouse | `zepto` |
| | Razorpay | Greenhouse | `razorpay` |
| | PhonePe | SmartRecruiters | `phonepe` |
| | BrowserStack | Greenhouse | `browserstack` |
| **Indian AI Startups** | Sarvam AI | Ashby | `sarvamai` |
| | Krutrim | Greenhouse | `krutrim` |
| | Yellow.ai | Greenhouse | `yellowai` |
| | Gupshup | Greenhouse | `gupshup` |
| | Fractal Analytics | Workday CXS | `fractal` |
| **Enterprise India Hubs** | Microsoft India | Custom / Careers | `microsoft` |
| | Uber India | Greenhouse | `uber` |
| | Atlassian India | Greenhouse | `atlassian` |

---

### Tier 2: Indeed Mobile GraphQL Ingestion
Instead of parsing desktop search cards that trigger Cloudflare Turnstile challenges, the engine queries Indeed's internal mobile GraphQL gateway.

*   **URL:** `POST https://apis.indeed.com/graphql`
*   **Required Headers:**
    ```http
    Host: apis.indeed.com
    Content-Type: application/json
    indeed-api-key: 161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8
    indeed-locale: en-IN
    indeed-co: IN
    user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Indeed App 193.1
    indeed-app-info: appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone
    ```
*   **GraphQL Payload:**
    ```json
    {
      "query": "query GetJobData { jobSearch(what: \"ai engineer\", location: {where: \"India\", radius: 50, radiusUnit: MILES}, limit: 100, sort: DATE) { pageInfo { nextCursor } results { trackingKey job { key title datePublished description { html } location { city admin1Code countryCode formatted { short } } compensation { estimated { baseSalary { unitOfWork range { ... on Range { min max } } } } } employer { name relativeCompanyPageUrl } } } } }"
    }
    ```
*   **Client Implementation:** Executed using `curl_cffi` impersonating `chrome120` or `safari16` to match TLS ClientHello parameters.

---

### Tier 3: LinkedIn Guest Search Ingestion
Targets public endpoints intended for SEO bots and unauthenticated users.

*   **Search Query URL:**
    ```http
    GET https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={keywords}&location={location}&start={offset}&f_TPR={time}&f_WT={work_type}&f_E={seniority}
    ```
*   **Job Detail URL:**
    ```http
    GET https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}
    ```
*   **Parsing Logic:** Uses BeautifulSoup / Selectors to read `data-entity-urn` (yielding the `job_id`), title inside `.base-search-card__title`, company name, and description markup inside `.show-more-less-html__markup`.
*   **Pagination Ceiling:** Bounded to offsets under 1,000 to prevent automated redirects to `linkedin.com/authwall`.

---

## 4. LLM Enrichment & Scoring Engine

The enrichment service interfaces directly with your private OpenAI-compatible proxy.

```
Incoming Scraped Job Description
               │
               ▼
   [ Character Truncation ] (Bounded to first 8,000 characters)
               │
               ▼
   [ Prompt Construction ]  (Strict JSON response schema)
               │
               ▼
   POST https://freeapiforme.aryansingh.space/v1/chat/completions
   Header: Authorization: Bearer REDACTED_API_KEY
   Model: antigravity/gemini-3.7-flash-tiered
               │
               ▼
   Parsed JSON Output:
   • technical_skills: ["PyTorch", "vLLM", "Docker"]
   • salary_normalized: { min: 2500000, max: 3500000, currency: "INR" }
   • fit_score: 88
   • score_reasoning: "Matches deep learning criteria..."
```

### Integration Details
*   **Base URL:** `https://freeapiforme.aryansingh.space/v1`
*   **API Key:** `REDACTED_API_KEY` (passed as `FREEAPI_API_KEY`)
*   **Primary Model:** `antigravity/gemini-3.7-flash-tiered`
*   **Fallback Models:** `claude-sonnet-4-6`, `gemini-2.5-flash`
*   **Prompt Specification:**
    ```python
    SYSTEM_PROMPT = """You are an expert technical talent evaluator.
    Analyze the job description and candidate criteria provided.
    Output ONLY a valid JSON object matching this schema:
    {
      "technical_skills": string[],
      "salary": {
        "min": number or null,
        "max": number or null,
        "currency": string or null,
        "period": "YEAR" | "MONTH" | "HOUR" | null
      },
      "experience_min_years": number or null,
      "experience_max_years": number or null,
      "seniority_level": "intern" | "entry" | "mid" | "senior" | "lead" | null,
      "job_category": string or null,
      "requirements_must_have": string[],
      "requirements_nice_to_have": string[],
      "location_type": "remote" | "hybrid" | "onsite",
      "city_identified": string or null,
      "fit_score": integer (0 to 100),
      "score_reasoning": string,
      "key_missing_skills": string[],
      "experience_match": "below" | "fit" | "stretch" | "above" | null
    }
    Exclude generic soft skills like 'teamwork', 'communication', 'leadership'. Return only hard technical skills.
    Seniority mapping rule (use experience_min_years primarily):
    0 + internship keywords = "intern"; 0-2 = "entry"; 2-5 = "mid"; 5-8 = "senior"; 8+ = "lead".
    If only one bound is present, map from that bound. If no experience is mentioned, return nulls (do NOT guess).
    job_category must be one of: "backend", "frontend", "fullstack", "ai-ml", "data", "devops", "sdet", "qa-automation", "qa-manual", "mobile", "other".
    Classify SDET/QA carefully: code-based test automation (Selenium, Playwright, Appium, RestAssured) = "sdet" or "qa-automation"; manual-only = "qa-manual".
    requirements_must_have = hard requirements ("Must have", "Required", "X+ years of Y"); requirements_nice_to_have = "Nice to have", "Preferred", "Bonus".
    experience_match compares candidate_profile.years_experience vs experience range with experience_tolerance_years (default 1):
    below = candidate under min - tolerance; fit = within [min - tolerance, max + tolerance]; stretch = within max + tolerance + 2; above = overqualified.
    """
    ```

### Resilient Fallback Pattern
If the proxy returns an HTTP error or times out:
1. The raw job listing is saved with empty enrichment fields.
2. The job is tagged with `enrichment_status = 'pending_retry'`.
3. The pipeline never drops a valid job posting due to downstream LLM failures.

---

## 5. Next.js 14 Dashboard Specification

The user interface provides complete operational control across four core tabs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PORTAL HEADER: [Job Portal]   [Status: Idle]   [Next Run: 08:00 AM]        │
│                 [Manual Trigger: Run Ingestion Now]                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  NAV TABS: [1. Active Feed]  [2. Filters]  [3. Registry]  [4. Logs & Cron]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  VIEW 1: ACTIVE JOBS FEED                                                   │
│  ┌─────────────────────────┐ ┌───────────────────────────────────────────┐ │
│  │ Job Card (List View)    │ │ Selected Job Detail Pane                  │ │
│  │ • Title & Company Logo  │ │ • Full Markdown description               │ │
│  │ • City: Pune | Remote   │ │ • Extracted Tech Skills Badges            │ │
│  │ • Score: 92% (High Fit) │ │ • Direct Application Link                 │ │
│  │ • Source: Greenhouse    │ │ • Actions: [Bookmark] [Applied] [Dismiss] │ │
│  └─────────────────────────┘ └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tab 1: Configurable Filter Knobs
*   **Role & Domain Keywords:** Multi-tag input for searching specific roles (e.g. `AI Engineer`, `Machine Learning`, `SDET`, `QA Automation`, `Backend Python`).
*   **Maximum Listing Age:** Dropdown selector:
    *   Past 24 Hours (`1d`)
    *   Past 3 Days (`3d`)
    *   Past 7 Days (`7d`)
    *   Past 14 Days (`14d`)
    *   Past 30 Days (`30d`)
*   **Indian Target Cities:** Quick toggle badges + free-form tag input:
    *   [x] Pune
    *   [x] Mumbai
    *   [x] Bengaluru (Karnataka)
    *   [x] Delhi-NCR (Gurgaon / Noida)
    *   [x] Hyderabad
    *   [x] Chennai
    *   Custom input: Add any other city
*   **International Remote Toggle:** Boolean switch:
    *   *OFF (Default):* Strictly filters for positions in India or Indian-remote.
    *   *ON:* Ingests global remote roles (US, Europe, Worldwide) and highlights compensation currency badges (USD, EUR).
*   **Compensation Floor:** Minimum annual salary slider (e.g., minimum 15 LPA for INR, minimum $90k for USD).
*   **Seniority Tiers:** Checkbox matrix (mapped from `experience_min/max_years` in §4):
    *   Internship (`intern`, 0 yrs + internship keywords)
    *   Entry-Level (`entry`, 0–2 years)
    *   Mid-Level (`mid`, 2–5 years)
    *   Senior (`senior`, 5–8 years)
    *   Lead / Staff / Principal (`lead`, 8+ years)
    *   Unspecified (no experience stated — show separately, never auto-filter out)
*   **Candidate Profile (new, drives personal matcher):** Single form persisted to `scraper_configs.candidate_profile`:
    *   Years of experience (number, e.g. `3`)
    *   My skills (tag input, e.g. `Python, Playwright, FastAPI`)
    *   Target categories (multi-select: `backend`, `ai-ml`, `sdet`, `qa-automation`, etc.)
    *   Preferred locations (defaults to Indian Target Cities + Remote)
*   **Job Category Filter:** Multi-select matching `jobs.job_category` (§6). SDET / QA-Automation split explicitly so backend roles don't drown QA roles.
*   **Experience Match Filter:** Dropdown: `Fit only` (`experience_match = 'fit'`) / `Fit + Stretch` (default) / `Show all incl. below/above`. Job cards show badge: `Requires 2–4y (Mid) — You: 3y — Fit`.

---

### Tab 2: Cron Scheduler & Automation Controls
*   **Visual Recurrence Builder:**
    *   *Frequency:* Every N hours (3, 6, 12, 24).
    *   *Fixed Daily Time:* Pick specific times (e.g., `08:00 AM IST` and `06:00 PM IST`).
    *   *Weekday Constraint:* Checkbox selector to run strictly on weekdays (Monday through Friday).
*   **Raw Cron Input:** For power-user configurations (e.g., `0 8 * * 1-5` for 8:00 AM on weekdays).
*   **Execution Mutex Lock:** Prevents overlapping runs if an ingestion cycle takes longer than expected.
*   **Ad-Hoc Execution:** `[Trigger Run Now]` button sends a POST request to `/api/scheduler/trigger` to launch an immediate background crawl without waiting for the next cron interval.

---

### Tab 3: Live Backend Logs & Observability
*   **Real-Time Terminal Stream:** Connected via Server-Sent Events (`GET /api/logs/stream`). Uses monospace styling with color-coded severity tags:
    *   `[INFO]` Gray / Cyan
    *   `[WARN]` Yellow
    *   `[ERROR]` Bright Red
*   **Run History Ledger:** Table displaying past ingestion executions:
    *   Run ID and trigger mechanism (Scheduled Cron vs. Manual Run).
    *   Start time, end time, and duration.
    *   Items discovered, new records inserted, and duplicate matches skipped.
    *   Status badge: `SUCCESS`, `PARTIAL_FAILURE`, or `FAILED`.
    *   Expandable JSON drawer showing stack traces, failing URLs, and HTTP error responses.

---

## 6. Database Schema (PostgreSQL with pgvector)

```sql
-- Enable pgvector extension for semantic candidate matching
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Scraped Job Listings
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,                  -- 'greenhouse', 'lever', 'ashby', 'indeed', 'linkedin'
    external_id TEXT NOT NULL,             -- Unique ID from source platform
    title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    location_raw TEXT NOT NULL,
    city TEXT,                             -- Normalized city: 'pune', 'bengaluru', 'mumbai', etc.
    is_remote BOOLEAN DEFAULT FALSE,
    is_international BOOLEAN DEFAULT FALSE,
    experience_min_years INTEGER,          -- Extracted min years (LLM), null if not stated
    experience_max_years INTEGER,          -- Extracted max years (LLM), null if not stated
    seniority_level TEXT,                  -- 'intern', 'entry', 'mid', 'senior', 'lead'
    job_category TEXT,                     -- 'backend', 'ai-ml', 'sdet', 'qa-automation', etc.
    requirements_must_have JSONB DEFAULT '[]',
    requirements_nice_to_have JSONB DEFAULT '[]',
    experience_match TEXT,                 -- 'below', 'fit', 'stretch', 'above' vs candidate_profile
    salary_raw TEXT,
    salary_min NUMERIC,
    salary_max NUMERIC,
    currency TEXT DEFAULT 'INR',
    url TEXT UNIQUE NOT NULL,
    description_text TEXT NOT NULL,
    description_html TEXT,
    technical_skills JSONB DEFAULT '[]',   -- Extracted via Gemini 3.7 Flash
    embedding vector(1536),                -- FUTURE: not populated in v1 personal-matcher
    fit_score INTEGER,                     -- 0 to 100 calculated by LLM
    score_reasoning TEXT,
    enrichment_status TEXT DEFAULT 'done', -- 'done', 'pending_retry', 'failed'
    status TEXT DEFAULT 'new',             -- 'new', 'bookmarked', 'applied', 'dismissed'
    posted_at TIMESTAMP WITH TIME ZONE,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jobs_city ON jobs(city);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_fit_score ON jobs(fit_score DESC);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at DESC);
CREATE INDEX idx_jobs_seniority ON jobs(seniority_level);
CREATE INDEX idx_jobs_category ON jobs(job_category);
CREATE INDEX idx_jobs_exp_match ON jobs(experience_match);

-- 2. Company ATS Target Registry
CREATE TABLE company_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    ats_provider TEXT NOT NULL,            -- 'greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday'
    board_token TEXT NOT NULL,             -- e.g. 'stripe', 'swiggy', 'sarvamai'
    country_focus TEXT DEFAULT 'india',    -- 'india', 'global', 'us'
    is_active BOOLEAN DEFAULT TRUE,
    last_scraped_at TIMESTAMP WITH TIME ZONE,
    total_jobs_found INTEGER DEFAULT 0
);

-- 3. Execution Run History
CREATE TABLE harvest_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by TEXT NOT NULL,            -- 'cron', 'manual'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL,                  -- 'running', 'completed', 'failed', 'partial'
    total_found INTEGER DEFAULT 0,
    new_inserted INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    log_summary JSONB DEFAULT '{}'
);

-- 4. Dynamic Scraper Configuration
CREATE TABLE scraper_configs (
    id TEXT PRIMARY KEY DEFAULT 'default',
    target_keywords JSONB NOT NULL DEFAULT '["AI Engineer", "Machine Learning", "QA Automation"]',
    target_cities JSONB NOT NULL DEFAULT '["Pune", "Mumbai", "Bengaluru", "Delhi"]',
    max_age_days INTEGER DEFAULT 7,
    include_international BOOLEAN DEFAULT FALSE,
    candidate_profile JSONB NOT NULL DEFAULT '{"years_experience": null, "skills": [], "target_categories": ["backend", "ai-ml", "sdet", "qa-automation"], "seniority_allowlist": ["entry", "mid"], "preferred_locations": ["Pune", "Mumbai", "Bengaluru", "Remote"]}',
    experience_tolerance_years INTEGER DEFAULT 1,
    cron_expression TEXT DEFAULT '0 8 * * 1-5', -- Weekdays at 8:00 AM
    is_scheduler_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 7. Backend API Specification (FastAPI)

```
GET    /api/jobs                # List jobs with query filters (city, age, score, status, seniority, category, experience_match)
GET    /api/jobs/{id}           # Fetch single job detail (incl. experience_min/max, seniority_level, job_category, must_have/nice_to_have)
PATCH  /api/jobs/{id}/status    # Update job state ('bookmarked', 'applied', 'dismissed')

GET    /api/config              # Get current filter knobs and cron settings
PUT    /api/config              # Update filter knobs and cron schedule

GET    /api/registry            # List all target companies in ATS registry
POST   /api/registry            # Add new company to ATS registry
POST   /api/registry/test       # Test company ATS endpoint before saving
PATCH  /api/registry/{id}       # Toggle company active/inactive

POST   /api/scheduler/trigger   # Trigger immediate manual harvest run
GET    /api/scheduler/status    # Inspect scheduler state & next execution time

GET    /api/runs                # List past execution histories
GET    /api/runs/{id}           # Get detailed run log and error traces
GET    /api/logs/stream         # Server-Sent Events (SSE) live log stream
```

---

## 8. Directory Layout

The project structure keeps frontend and backend concerns isolated within the repository:

```
/home/azureuser/job-portal/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── jobs.py             # Job listing and status routes
│   │   │   ├── config.py           # Knobs and configuration routes
│   │   │   ├── registry.py         # Company ATS targets
│   │   │   ├── scheduler.py        # Cron management and manual triggers
│   │   │   └── logs.py             # SSE log streaming and run history
│   │   ├── clients/
│   │   │   ├── greenhouse.py       # Greenhouse public REST client
│   │   │   ├── lever.py            # Lever public REST client
│   │   │   ├── ashby.py            # Ashby posting API client
│   │   │   ├── indeed.py           # Indeed mobile GraphQL client (curl_cffi)
│   │   │   └── linkedin.py         # LinkedIn guest scraper (curl_cffi)
│   │   ├── core/
│   │   │   ├── config.py           # App settings (Pydantic Settings)
│   │   │   ├── database.py         # SQLAlchemy engine and session makers
│   │   │   └── logger.py           # Ring buffer and log broadcaster
│   │   ├── models/                 # SQLAlchemy DB models
│   │   ├── services/
│   │   │   ├── enrichment.py       # FreeAPI Gemini 3.7 Flash extraction client
│   │   │   ├── deduplication.py    # Title and company hashing + vector similarity
│   │   │   └── harvest_manager.py  # Crawl orchestration pipeline
│   │   └── main.py                 # FastAPI application entrypoint
│   ├── alembic/                    # Database migrations
│   ├── pyproject.toml              # UV / Poetry dependencies
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Active Jobs Feed (Main View)
│   │   │   ├── config/page.tsx     # Filter Knobs & Settings View
│   │   │   ├── registry/page.tsx   # Company ATS Registry Manager
│   │   │   └── logs/page.tsx       # Live Terminal Stream & Run Ledger
│   │   ├── components/             # Reusable UI elements (Tailwind CSS)
│   │   └── lib/                    # API client fetching from backend
│   ├── package.json
│   └── tailwind.config.js
├── docker-compose.yml              # Local database and service definitions
└── README.md
```

---

## 9. Implementation Milestones

1. **Milestone 1: Backend Foundation & ATS Ingestion**
   - Initialize the FastAPI app with PostgreSQL and SQLAlchemy.
   - Implement Greenhouse, Lever, and Ashby REST ingestion adapters.
   - Seed company registry with initial Indian unicorn and global AI targets.
   - Verify unauthenticated retrieval of clean job JSON feeds.

2. **Milestone 2: Secondary Crawlers & FreeAPI Enrichment**
   - Build Indeed mobile GraphQL and LinkedIn guest crawlers using `curl_cffi`.
   - Wire the OpenAI SDK client to `https://freeapiforme.aryansingh.space/v1` with `gemini-3.7-flash-tiered`.
   - Test JSON output parsing for technical skills, salary normalization, and fit scoring.

3. **Milestone 3: Scheduler Engine & Logging Hub**
   - Configure APScheduler with persistent PostgreSQL job stores.
   - Implement cron triggers for weekday constraints and specific hours.
   - Build in-memory log broadcaster and Server-Sent Events endpoint (`/api/logs/stream`).

4. **Milestone 4: Next.js 14 Dashboard**
   - Scaffold the Next.js project with Tailwind CSS.
   - Build the Filter Knobs page, Cron Scheduler manager, and Company Registry view.
   - Implement the Active Jobs Feed with split-pane markdown viewing.
   - Integrate the real-time SSE streaming log terminal.

5. **Milestone 5: Verification & End-to-End Validation**
   - Execute a live harvest run against Indian tech targets.
   - Verify deduplication logic across repeated crawls.
   - Confirm proper log streaming and error capture for blocked endpoints.
