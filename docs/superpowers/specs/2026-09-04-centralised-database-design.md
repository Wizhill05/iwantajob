# Technical Specification: Centralised Database & Decoupled Parsing Pipeline

**Date:** 2026-09-04  
**Status:** Approved Architecture Draft  

## 1. Overview & Architecture

To prevent data loss and prevent scraping runs from aborting or saving half-parsed records when parsing errors occur, the backend implements a decoupled two-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SCRAPING INGESTION LAYER                           │
│  GET /api/scrape/{indeed, linkedin, wellfound}?persist=true                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 100% Unmodified Raw Payload
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BRONZE TIER: 3 RAW TABLES                             │
│   (raw_indeed_jobs, raw_linkedin_jobs, raw_wellfound_jobs)                 │
│   Database: iwantajob_db (PostgreSQL)                                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Manual Trigger
                                       │ POST /api/parse/{indeed, linkedin, wellfound}
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  HYBRID PARSING & NORMALIZATION ENGINE                      │
│   1. PayNormalizer (LPA, INR/mo/hr, USD/EUR/GBP -> INR/Year integer)       │
│   2. ExperienceExtractor (Regex Fresher + LLM Fallback freeapiforme)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Atomic Clean Insert
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SILVER TIER: UNIFIED JOBS TABLE                       │
│   unified_jobs (Fully parsed, searchable, guaranteed clean data)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. PostgreSQL Database Schema (`iwantajob_db`)

### 2.1 Table: `raw_indeed_jobs`
Stores raw GraphQL job items from Indeed mobile API.
- `id` (UUID, Primary Key, `gen_random_uuid()`)
- `external_id` (TEXT, Unique - Indeed job key `job.key`)
- `tracking_key` (TEXT, Nullable)
- `title` (TEXT NOT NULL)
- `company_name` (TEXT NOT NULL)
- `location_raw` (TEXT NOT NULL)
- `location_city` (TEXT, Nullable)
- `location_country` (TEXT, Nullable)
- `is_remote` (BOOLEAN DEFAULT FALSE)
- `apply_url` (TEXT, Nullable)
- `easy_apply_available` (BOOLEAN DEFAULT FALSE)
- `attributes` (JSONB DEFAULT '[]')
- `salary_raw` (TEXT, Nullable)
- `description_html` (TEXT, Nullable)
- `description_text` (TEXT NOT NULL)
- `date_published` (TIMESTAMPTZ, Nullable)
- `raw_payload` (JSONB NOT NULL)
- `scraped_at` (TIMESTAMPTZ DEFAULT NOW())

### 2.2 Table: `raw_linkedin_jobs`
Stores raw job cards and details from LinkedIn guest endpoints.
- `id` (UUID, Primary Key, `gen_random_uuid()`)
- `external_id` (TEXT, Unique - LinkedIn job ID)
- `title` (TEXT NOT NULL)
- `company_name` (TEXT NOT NULL)
- `company_logo_url` (TEXT, Nullable)
- `company_website` (TEXT, Nullable)
- `location_raw` (TEXT NOT NULL)
- `city` (TEXT, Nullable)
- `is_remote` (BOOLEAN DEFAULT FALSE)
- `is_international` (BOOLEAN DEFAULT FALSE)
- `url` (TEXT NOT NULL)
- `salary_raw` (TEXT, Nullable)
- `description_html` (TEXT, Nullable)
- `description_text` (TEXT NOT NULL)
- `posted_at` (TIMESTAMPTZ, Nullable)
- `raw_payload` (JSONB NOT NULL)
- `scraped_at` (TIMESTAMPTZ DEFAULT NOW())

### 2.3 Table: `raw_wellfound_jobs`
Stores raw Apollo GraphQL nodes from Wellfound SSR pages.
- `id` (UUID, Primary Key, `gen_random_uuid()`)
- `external_id` (TEXT, Unique - Wellfound listing ID)
- `job_slug` (TEXT NOT NULL)
- `title` (TEXT NOT NULL)
- `company_name` (TEXT NOT NULL)
- `company_slug` (TEXT, Nullable)
- `company_logo_url` (TEXT, Nullable)
- `company_website` (TEXT, Nullable)
- `location_raw` (TEXT NOT NULL)
- `locations_list` (JSONB DEFAULT '[]')
- `is_remote` (BOOLEAN DEFAULT FALSE)
- `is_international` (BOOLEAN DEFAULT FALSE)
- `salary_raw` (TEXT, Nullable)
- `native_years_min` (INTEGER, Nullable)
- `native_years_max` (INTEGER, Nullable)
- `live_start_at` (BIGINT, Nullable)
- `url` (TEXT NOT NULL)
- `description_html` (TEXT, Nullable)
- `description_text` (TEXT NOT NULL)
- `posted_at` (TIMESTAMPTZ, Nullable)
- `raw_payload` (JSONB NOT NULL)
- `scraped_at` (TIMESTAMPTZ DEFAULT NOW())

### 2.4 Table: `unified_jobs`
Central clean database containing only successfully parsed, standardized jobs.
- `id` (UUID, Primary Key, `gen_random_uuid()`)
- `source` (TEXT NOT NULL: `'indeed' | 'linkedin' | 'wellfound'`)
- `external_id` (TEXT NOT NULL)
- `raw_ref_id` (UUID NOT NULL - foreign key pointer to raw table row)
- `url` (TEXT UNIQUE NOT NULL)
- `title` (TEXT NOT NULL)
- `company_name` (TEXT NOT NULL)
- `company_logo_url` (TEXT, Nullable)
- `location_raw` (TEXT NOT NULL)
- `city` (TEXT, Nullable)
- `is_remote` (BOOLEAN DEFAULT FALSE)
- `is_international` (BOOLEAN DEFAULT FALSE)
- `easy_apply_available` (BOOLEAN DEFAULT FALSE)
- `salary_min_inr_year` (BIGINT, Nullable)
- `salary_max_inr_year` (BIGINT, Nullable)
- `salary_raw` (TEXT, Nullable)
- `salary_currency_raw` (TEXT, Nullable)
- `salary_extraction_method` (TEXT NOT NULL: `'native' | 'regex' | 'llm' | 'none'`)
- `experience_min_years` (INTEGER, Nullable)
- `experience_max_years` (INTEGER, Nullable)
- `is_fresher_friendly` (BOOLEAN DEFAULT FALSE)
- `experience_extraction_method` (TEXT NOT NULL: `'native' | 'regex' | 'llm' | 'none'`)
- `description_text` (TEXT NOT NULL)
- `posted_at` (TIMESTAMPTZ, Nullable)
- `parsed_at` (TIMESTAMPTZ DEFAULT NOW())
- Unique constraint: `UNIQUE(source, external_id)`

---

## 3. Parsing & Extraction Specifications

### 3.1 Pay Normalization (`PayNormalizer`)
- Extracts salary strings from explicit fields or regex matching patterns in description (`salary_min`, `salary_max`, `currency`, `period`).
- Currency exchange multipliers:
  - `INR`: 1
  - `USD`: 85
  - `EUR`: 92
  - `GBP`: 108
- Unit conversions:
  - `LPA` / `Lakhs`: Value * 100,000
  - `K` / `Thousand`: Value * 1,000
  - `per month`: Annual = Monthly * 12
  - `per hour`: Annual = Hourly * 2,000
- LLM Fallback:
  - If no salary is detected by regex or native fields, optionally queries `freeapiforme.aryansingh.space/v1` (`gemini-2.5-flash`).

### 3.2 Experience Extractor (`ExperienceExtractor`)
- Native extraction:
  - Wellfound provides `native_years_min`, `native_years_max`.
  - Indeed attributes flag `"Fresher"` -> `min=0, max=1, is_fresher_friendly=True`.
- Regex extraction:
  - Patterns like `(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)`, `(\d+)\+\s*(?:years?|yrs?)`.
  - Fresher keywords: `fresher`, `entry level`, `recent graduate`, `0-1 year`, `internship`, `no prior experience required`.
- LLM Fallback:
  - Truncated description prompt to extract `{"min_years": ..., "max_years": ..., "is_fresher_friendly": ...}`.

---

## 4. API Endpoints

1. **Scraping Ingestion with Persistence**:
   - `GET /api/scrape/indeed?persist=true` -> Persists raw items to `raw_indeed_jobs`
   - `GET /api/scrape/linkedin?persist=true` -> Persists raw items to `raw_linkedin_jobs`
   - `GET /api/scrape/wellfound?persist=true` -> Persists raw items to `raw_wellfound_jobs`

2. **Manual Dedicated Parsing APIs**:
   - `POST /api/parse/indeed` -> Parses unparsed rows from `raw_indeed_jobs` into `unified_jobs`
   - `POST /api/parse/linkedin` -> Parses unparsed rows from `raw_linkedin_jobs` into `unified_jobs`
   - `POST /api/parse/wellfound` -> Parses unparsed rows from `raw_wellfound_jobs` into `unified_jobs`
   - Accepts parameters: `batch_size: int = 50`, `use_llm_fallback: bool = True`

3. **Status & Unified Jobs Browser**:
   - `GET /api/status/parsing` -> Shows raw vs parsed counts per provider
   - `GET /api/jobs/unified` -> Filter and browse clean jobs (`city`, `is_fresher_friendly`, `min_salary_inr`, `easy_apply_available`, `source`)
