# Technical Specification: Glassdoor Provider — Full Bronze-to-Silver Parity

**Date:** 2026-09-13
**Status:** Approved design (pending implementation plan)
**Scope:** Full parity with Indeed / LinkedIn / Wellfound — scrape + bronze + parse + MCP + UI
**Sources of truth:** `AGENTS.md` (Bronze-to-Silver), `DESIGN_SPECIFICATION.md`, `backend/src/main.py`, `backend/src/mcp_server.py`, `frontend/lib/api.ts`, `frontend/lib/types.ts`

---

## 1. Overview & Goals

Add Glassdoor as a 4th first-class provider following the exact decoupled pattern in `AGENTS.md`:

```
GET /api/scrape/glassdoor?persist=true
  → raw_glassdoor_jobs (bronze, lossless)
  → POST /api/parse/glassdoor (manual, background, PIPELINE_LOCK)
  → PayNormalizer + ExperienceExtractor + Gemini LLM fallback
  → unified_jobs WHERE source='glassdoor' (silver)
```

Goals:
1. `GET /api/scrape/glassdoor` with `persist` toggle, `is_in_db` marking, typed errors.
2. `raw_glassdoor_jobs` bronze table + `save_raw_glassdoor_job()` dedup.
3. `POST /api/parse/glassdoor` background parse + status + reparse coverage.
4. MCP tools `scrape_glassdoor` / `parse_glassdoor_jobs`, extended `scrape_all_providers` + `search_unified_jobs`.
5. UI: 4th scraper tab + `GlassdoorTester`, 4th pipeline parse circle, `source=glassdoor` filters everywhere.
6. Tests for client parsing, ingest dedup, parse promotion, status, MCP smoke.

Non-goals:
- No change to `unified_jobs` columns (reuse salary/experience/triage).
- No change to parsing semantics (same normalizers + LLM model).
- No cron/scheduler changes (manual triggers only, per `AGENTS.md` §5.2).
- No Wellfound-style company-bulk endpoint for v1 (single search endpoint only; company page only if trivial reuse).

---

## 2. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│ FRONTEND                          MCP (stdio → REST)         │
│ scrapers?tab=glassdoor            scrape_glassdoor           │
│ pipeline (Parse Glassdoor)        parse_glassdoor_jobs       │
│ jobs filter source=glassdoor      search_unified_jobs        │
└──────────────────────┬───────────────────┬───────────────────┘
                       │ HTTP              │ HTTP
┌──────────────────────▼───────────────────▼───────────────────┐
│ FastAPI (:8020)                                              │
│ GET /api/scrape/glassdoor (?persist=true)                    │
│ POST /api/parse/glassdoor (background, PIPELINE_LOCK)        │
│ GET /api/status/parsing (+glassdoor)                         │
│ GET /api/jobs/unified?source=glassdoor                       │
│ GlassdoorClient (curl_cffi, chrome120)                       │
└──────────────────────┬───────────────────────────────────────┘
                       │ lossless raw dict
┌──────────────────────▼───────────────────────────────────────┐
│ BRONZE  raw_glassdoor_jobs                                   │
│  id, external_id UNIQUE, title, company_*, location_raw,     │
│  city, is_remote, is_international, url, salary_raw,         │
│  company_rating, easy_apply_available, description_*,        │
│  posted_at, raw_payload, scraped_at                          │
└──────────────────────┬───────────────────────────────────────┘
                       │ POST /api/parse/glassdoor
┌──────────────────────▼───────────────────────────────────────┐
│ ParserService.parse_glassdoor_jobs                           │
│  chunk 10 → LLMJobParser.parse_jobs_batch                    │
│  → _empty_result (regex) when use_llm=false                  │
│  → normalize_job_url → upsert unified_jobs                   │
└──────────────────────┬───────────────────────────────────────┘
                       │ UNIQUE(source, external_id)
┌──────────────────────▼───────────────────────────────────────┐
│ SILVER  unified_jobs (source='glassdoor')                    │
└──────────────────────────────────────────────────────────────┘
```

Dedup invariant (same as LinkedIn/Wellfound): a job is skipped at ingest if `raw_glassdoor_jobs.external_id/url` exists OR `unified_jobs` has `(source='glassdoor', external_id)` or matching `url`. At parse time, URL collision under a different `(source, external_id)` links `raw_ref_id` instead of double-inserting (see `parser_service.py` LinkedIn/Wellfound branches).

---

## 3. Ingestion Approach (decision)

**Chosen: Approach A — guest/search impersonation via `curl_cffi` (mirrors `linkedin.py`).**
- Probe Glassdoor public job search + job detail endpoints with `chrome120` TLS impersonation, browser headers, jittered throttle, concurrency semaphore (max 5), 24h LRU detail cache, strict page/offset ceiling, authwall/block anomaly detection.
- Why: best contract parity, reuses proven guardrails, no new infra. Glassdoor protection is stricter than LinkedIn so the probe phase is time-boxed.
- Rejected B (SSR `__NEXT_DATA__` extraction): no evidence Glassdoor embeds clean Apollo state; likely fragile selectors for same bot cost.
- Fallback C (plumbing-first stub): only if the live probe is hard-blocked (HTTP 403 + challenge on all vectors). Then land the identical contract with a stubbed `GlassdoorClient` marked `experimental` and harden fetch in a follow-up — no silent scope cut.

Probe exit criteria: HTTP 200 with ≥1 parsed card for `keywords="software engineer", location="India"`; detail fetch returns description text; block signal (403/captcha/authwall) is detectable and mapped to `GLASSDOOR_BLOCKED` (502) vs `UPSTREAM_RATE_LIMITED` (429).

---

## 4. Database

### 4.1 New table `raw_glassdoor_jobs` (`backend/src/models/db_entities.py` → `RawGlassdoorJob`)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, `uuid4` | — |
| `external_id` | TEXT | UNIQUE, NOT NULL, index | Glassdoor job ID (numeric string) |
| `title` | TEXT | NOT NULL | cleaned role title |
| `company_name` | TEXT | NOT NULL | default `"Company"` if missing |
| `company_logo_url` | TEXT | NULLABLE | logo asset if present |
| `company_website` | TEXT | NULLABLE | company profile / external site |
| `company_rating` | NUMERIC(2,1) | NULLABLE | Glassdoor-native rating (e.g. 4.2); kept in bronze only, **not** promoted to unified v1 |
| `location_raw` | TEXT | NOT NULL | card location string |
| `city` | TEXT | NULLABLE | lowercase slug via `parse_location()` |
| `is_remote` | BOOLEAN | NOT NULL DEFAULT FALSE | via `parse_location()` |
| `is_international` | BOOLEAN | NOT NULL DEFAULT FALSE | via `parse_location()` |
| `url` | TEXT | NOT NULL | canonical `https://www.glassdoor.com/...` job link, stored normalized |
| `salary_raw` | TEXT | NULLABLE | raw pay string if card shows one |
| `easy_apply_available` | BOOLEAN | NOT NULL DEFAULT FALSE | Glassdoor Easy Apply flag if detectable, else FALSE |
| `description_html` | TEXT | NULLABLE | detail HTML |
| `description_text` | TEXT | NOT NULL | sanitized via `clean_html()` |
| `posted_at` | TIMESTAMPTZ | NULLABLE | parsed post date if available |
| `raw_payload` | JSONB | NOT NULL | full unmodified scrape dict |
| `scraped_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | — |

DDL follows existing models (SQLAlchemy `Column` + `JSONB`, `server_default=func.now()`). Migration via `init_db()` / Alembic alongside the other raw tables.

### 4.2 `unified_jobs` — no schema change
- `source` gains `'glassdoor'` value (code-level allowlist + docs; CHECK constraint only if one already exists — none today).
- `company_rating` stays bronze-only for v1 (avoids silver migration; can promote later).
- `easy_apply_available` reuses existing unified column (Glassdoor Easy Apply → TRUE).
- `UNIQUE(source, external_id)` already prevents re-parse duplicates.

### 4.3 Touchpoints in `main.py` DB maintenance
- `delete_unified_jobs`: add `"glassdoor": RawGlassdoorJob` to `raw_models` cascade map.
- `clear_bronze`: add Glassdoor to `raw_models`, `silver_ref_ids`/`silver_external_ids`, and `deleted` response key `raw_glassdoor_jobs`.
- `reset_database`: `delete(RawGlassdoorJob)`.
- `clear_test_data`: add `DELETE FROM raw_glassdoor_jobs WHERE external_id ~ '^(test_|wf_|li_|gd_)'`; new Glassdoor test seeds MUST use `gd_` prefix.

---

## 5. Backend Service

### 5.1 New client `backend/src/clients/glassdoor.py`
Mirror structure of `backend/src/clients/linkedin.py` (~390 lines):
- Constants: `GLASSDOOR_BASE_URL`, `GLASSDOOR_SEARCH_URL`, `GLASSDOOR_JOB_DETAIL_URL`, `GLASSDOOR_DEFAULT_HEADERS` (Chrome120 UA, Accept-Language, Sec-Fetch-*).
- `build_glassdoor_search_url(keywords, location, start/page, time_range?, work_type?, seniority?)` with hard ceiling (to be fixed in probe; default cap mirrors LinkedIn `start ≤ 975` or Wellfound `page ≤ 20` — whichever vector wins).
- `parse_glassdoor_job_cards(html, fallback_loc)` → `list[JobItem]`: extract ID (URL or `data-` attr), title, company, location_raw → `parse_location()` → city/remote/international, salary via `extract_glassdoor_salary()` (`$ ₹ LPA /mo /hr` patterns), `url` canonical, `source="glassdoor"`.
- `parse_glassdoor_detail(html)` → `(description_html, description_text, salary_raw?)`; `clean_html()` for text.
- `class GlassdoorClient`: `async search_jobs(keywords, location, start=0, limit=20, time_range=None, work_type=None, seniority=None, fetch_descriptions=True)` with `httpx`/`curl_cffi` session, semaphore 5 for details, 24h in-memory LRU cache, throttle + jitter, empty-payload anomaly log, typed errors (`UpstreamBlockedError`, `UpstreamRateLimitError` reuse from `indeed.py` or local).
- `JobItem.source` in `backend/src/models/job.py`: extend literal to `'indeed' | 'linkedin' | 'wellfound' | 'glassdoor'`.
- New doc `backend/GLASSDOOR_API.md` mirroring `LINKEDIN_API.md` (endpoints hit, headers, params, guardrails, sample payload, block signals).

### 5.2 `GET /api/scrape/glassdoor` (`main.py`, tag `Glassdoor`)
Params (final names frozen after probe; defaults mirror LinkedIn):
`keywords="software engineer", location="India", start=0 (0–975), limit=20 (1–100), time_range? (r86400/r604800/r2592000), work_type? (1/2/3), seniority? (1–5), fetch_descriptions=true, persist=false`.
Behavior: validate non-empty keywords/location → `GlassdoorClient.search_jobs()` → if `persist`, `save_raw_glassdoor_job()` per item → `check_jobs_exist_in_db()` to set `is_in_db` → return `list[JobItem]`. Errors: 400 invalid params, 429 rate/authwall, 500 `GLASSDOOR_SCRAPE_ERROR`. OpenAPI description documents guardrails (offset ceiling, cache, semaphore).

### 5.3 `save_raw_glassdoor_job()` (`services/raw_ingestion.py`)
Mirror `save_raw_linkedin_job()`: normalize URL via `normalize_job_url()`; skip if raw has `external_id/url/norm_url` or unified has `(source='glassdoor', external_id)/url/norm_url`; else `insert(...).on_conflict_do_nothing(index_elements=[external_id])`. Returns bool.

### 5.4 `POST /api/parse/glassdoor` + `ParserService.parse_glassdoor_jobs`
- Endpoint: `batch_size=50 (1–500), use_llm=true` → `ParserService.start_parse("glassdoor", ...)`; 409 `PIPELINE_BUSY` when running+queued (identical to other providers).
- `parser_service.py` changes: allowlist `("indeed","linkedin","wellfound","glassdoor")` in `start_parse`/`run_parse`; `_runners()` += `"glassdoor": cls.parse_glassdoor_jobs`; `get_parsing_status()` += glassdoor counts + `unified_total`; alias `parse_glassdoor = parse_glassdoor_jobs`.
- `parse_glassdoor_jobs(batch_size, use_llm)`: select raw where `id NOT IN (select raw_ref_id where source='glassdoor')` limit batch → chunk 10 → `chunk_items = {id, title, salary_raw, description}` → `LLMJobParser.parse_jobs_batch` (or `_empty_result` when `use_llm=false`) → per row: `norm_url`, URL-collision link check, `insert(UnifiedJob source='glassdoor', ..., city=r.city, is_remote, is_international, easy_apply_available=r.easy_apply_available, salary_*, experience_*, is_fresher_friendly, description_text, posted_at).on_conflict_do_update(constraint="uq_source_external_id", set={title, salary_*, experience_*, is_fresher_friendly})` → progress ticks → `{source, processed, promoted_to_unified, errors}`.
- `run_reparse` needs no logic change (source-agnostic) but Glassdoor rows are automatically covered.

### 5.5 Status & query updates
- `GET /api/status/parsing` response gains `"glassdoor": {total_raw, parsed, unparsed}` (frontend `ParsingStatus` updated in lockstep).
- `GET /api/jobs/unified?source=glassdoor` — no logic change (generic `source` filter); update OpenAPI description to list 4 sources.
- `TAGS_METADATA` += `Glassdoor` tag; `APP_DESCRIPTION` provider list + portals updated.

---

## 6. MCP Server (`backend/src/mcp_server.py`)

- `scrape_glassdoor(keywords="software engineer", location="India", start=0, limit=20, time_range=None, work_type=None, seniority=None, fetch_descriptions=True, persist=False)` → `GET /api/scrape/glassdoor`. Docstring documents params + persist-to-bronze.
- `parse_glassdoor_jobs(batch_size=50, use_llm=True)` → `POST /api/parse/glassdoor` via `_trigger_parse("glassdoor", ...)`; docs note 409-busy.
- `scrape_all_providers(keywords, location, limit, persist)` runs 4 scrapes sequentially (indeed/linkedin/wellfound/glassdoor) and returns keyed dict; update its docstring + module `instructions` string (provider lists, parse lists).
- `search_unified_jobs(source, ...)`: `source` docs `'indeed' | 'linkedin' | 'wellfound' | 'glassdoor'`.
- No new destructive tools; `clear_bronze_layer` docstring gains Glassdoor mention (behavior comes from backend).

---

## 7. Frontend

### 7.1 `frontend/lib/types.ts`
- `JobItem.source`, `UnifiedJobItem.source`, `ParseResult.source`: add `'glassdoor'`.
- `ParsingStatus`: add `glassdoor: ProviderParsingStats`.
- `PipelineRunJob.provider`: add `'glassdoor'` (keep `'unified'`).
- `ActiveProcess.provider`, `ScraperQueryPayload.provider`, `UnifiedJobsQueryParams.source`: add `'glassdoor'`.

### 7.2 `frontend/lib/api.ts`
- `scrapeGlassdoor(params: {keywords?, location?, start?, limit?, time_range?, work_type?, seniority?, fetch_descriptions?, persist?})` → `GET /api/scrape/glassdoor` (URLSearchParams mirror of `scrapeLinkedIn`).
- `triggerParse(source: 'indeed'|'linkedin'|'wellfound'|'glassdoor', {batchSize})`.
- `clearBronze()` / `clearTestData()` return types gain `raw_glassdoor_jobs: number`.

### 7.3 Scrapers UI
- `components/scrapers/ScraperTabs.tsx`: `ScraperTabKey += 'glassdoor'`; `TABS += {key:'glassdoor', label:'Glassdoor'}`.
- New `components/scrapers/GlassdoorTester.tsx` (clone `WellfoundTester.tsx` structure, LinkedIn-style params): keyword + location bars, Filters drawer (start, limit, time_range, work_type, seniority, fetch_descriptions, persist), validation (both required), `startProcess('scrape','glassdoor',...)`, `api.scrapeGlassdoor()`, latency + `onResults`/`onError`, cards/JSON toggle reuse.
- `app/scrapers/page.tsx`: tab-param allowlist += `'glassdoor'`, render `GlassdoorTester` → `handleResults('Glassdoor Guest Search', ...)`.

### 7.4 Pipeline UI
- `components/pipeline/SquareParserActions.tsx`: `PipelineProvider += 'glassdoor'`; `ALL_PROVIDERS = ['linkedin','indeed','wellfound','glassdoor']`; `PROVIDER_META.glassdoor = {label:'Glassdoor', ring:'border-emerald-500', text:'text-emerald-400', tint:'bg-emerald-500/10 text-emerald-400', hoverRing:'hover:border-emerald-500/80'}` (emerald avoids clash with wellfound rose/indeed sky/linkedin blue); icon: reuse `Building`? prefer distinct `Search`/`Page` icon — decide in implementation; `totalUnparsed` += glassdoor; grid `grid-cols-4` → `grid-cols-5` (or responsive wrap); bronze-confirm copy lists 4 providers; `clearBronze` result handling already generic.
- `ParserControlCard.tsx` / `UnifiedParserCard.tsx` / `PipelineFlowDiagram.tsx` / `PipelineStatsOverview.tsx`: extend provider switch/maps if they hardcode 3 providers (verify in implementation; default to adding Glassdoor row/card).

### 7.5 Jobs & overview
- `components/jobs/JobsFilterBar.tsx` (+ jobs page): source dropdown/segment adds Glassdoor.
- `components/overview/ProviderCard.tsx`, `ActiveProcessesList.tsx`, `KpiGrid.tsx`, `RecentActivityLog.tsx`: add Glassdoor branch where provider is switched/mapped (colors: emerald).
- No changes to triage/save/archive components (source-agnostic).

---

## 8. Testing & Verification

1. **Backend unit**: `tests/test_glassdoor_client.py` (card/detail fixtures → JobItem fields, salary/city/remote parsing, empty-HTML → `[]`), `tests/test_glassdoor_ingestion.py` (dedup: raw-duplicate, unified-duplicate, `gd_` seeds), `tests/test_glassdoor_parse.py` (`use_llm=false` regex path promotes N rows, rerun promotes 0, conflict-update path).
2. **API**: `GET /api/scrape/glassdoor?persist=false` returns `JobItem[]`; `?persist=true` grows `raw_glassdoor_jobs`; `POST /api/parse/glassdoor?batch_size=10&use_llm=false` promotes; `GET /api/status/parsing` shows glassdoor counts; `GET /api/jobs/unified?source=glassdoor` returns rows; second parse is idempotent; busy → 409.
3. **MCP**: stdio smoke — `scrape_glassdoor(persist=false)`, `parse_glassdoor_jobs`, `get_parsing_status`, `search_unified_jobs(source="glassdoor")`; `scrape_all_providers` returns 4 keys.
4. **Frontend**: scraper tab run (cards + JSON), pipeline Glassdoor circle + Parse All includes glassdoor, jobs filter `source=glassdoor`, bronze modal copy, no regression on 3 existing providers.
5. **Cleanup**: `clear-test-data` removes `gd_*` seeds; `clear-bronze` preserves silver-linked glassdoor rows.

---

## 9. Rollout Order & Risks

Order: probe (vector + ceilings) → `RawGlassdoorJob` + migration → `glassdoor.py` + `GLASSDOOR_API.md` → scrape endpoint + `save_raw_*` → `parse_glassdoor_jobs` + status/maintenance updates → MCP → frontend types/api → scraper tab → pipeline/jobs/overview → tests → cleanup verify.

Risks:
- **Bot protection (main):** Glassdoor serves 403/captcha aggressively. Mitigations: `curl_cffi` impersonation, throttle/jitter, ceilings, detail cache, typed 429/502, time-boxed probe with stub fallback (contract-identical, labeled experimental).
- **Selector drift:** card HTML changes → keep extractors small + fixture tests; prefer URL/ID + text-content selectors over deep class chains.
- **Scope creep:** company-bulk endpoint, rating promotion to silver, slug maps — explicitly deferred; v1 has no `/roles` equivalent unless probe shows canonical slugs are required.
- **4-provider UI crowding:** `grid-cols-4` → 5; verify mobile wrap in implementation.

---

## 10. File Checklist

Backend: `src/models/db_entities.py`, `src/models/job.py`, `src/clients/glassdoor.py` (new), `src/main.py`, `src/services/raw_ingestion.py`, `src/services/parser_service.py`, `backend/GLASSDOOR_API.md` (new), `tests/test_glassdoor_*.py` (new).
MCP: `src/mcp_server.py`.
Frontend: `lib/types.ts`, `lib/api.ts`, `components/scrapers/ScraperTabs.tsx`, `components/scrapers/GlassdoorTester.tsx` (new), `app/scrapers/page.tsx`, `components/pipeline/SquareParserActions.tsx`, `components/pipeline/ParserControlCard.tsx` (+ `UnifiedParserCard`, `PipelineFlowDiagram`, `PipelineStatsOverview` if hardcoded), `components/jobs/JobsFilterBar.tsx` (+ jobs page), `components/overview/ProviderCard.tsx` (+ `ActiveProcessesList`, `KpiGrid` if hardcoded).

---

## 11. Open Decisions (locked for v1 unless noted)

- `company_rating` stays bronze-only (no unified column).
- Canonical source string: `'glassdoor'` (lowercase, single word — matches URL/brand; NOT `glass_door`).
- Test ID prefix: `'gd_'` (alongside `test_/wf_/li_` in `clear-test-data` regex).
- Provider color (UI/MCP-agnostic): emerald (`emerald-500`) to avoid clash with linkedin-blue / indeed-sky / wellfound-rose.
- No `/api/glassdoor/roles` endpoint for v1 (add only if probe proves slug validation is required).
