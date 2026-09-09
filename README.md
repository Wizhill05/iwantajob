# iwantajob

Centralized job aggregator and normalization platform for tech jobs in India and abroad. It scrapes Indeed, LinkedIn, and Wellfound, stores raw responses in PostgreSQL staging tables, and normalizes compensation (annual INR) and experience bounds into a unified jobs database using batched LLM parsing with regex fallbacks.

---

## Architecture

The system uses a decoupled Bronze-to-Silver data model:

1. **Bronze tier (raw staging tables)**: Captures unmodified scraping responses. Ingestion requests never fail due to parsing errors, model downtime, or LLM token quotas.
   - `raw_indeed_jobs`
   - `raw_linkedin_jobs`
   - `raw_wellfound_jobs`
2. **Silver tier (unified database)**: Holds parsed, deduplicated, and normalized records with calculated annual INR salary ranges and fresher suitability flags.
   - `unified_jobs`
3. **Decoupled batch parser**: Promotes rows from raw staging into `unified_jobs` on demand. The parser batches up to 25 job descriptions per LLM call into Gemini 3.7 Flash Tiered, dropping back to regex heuristics (`PayNormalizer` and `ExperienceExtractor`) if rate limits or network errors occur.

```
+-------------------------------------------------------------+
|                     Scraping APIs                           |
|       GET /api/scrape/{indeed, linkedin, wellfound}         |
|                     (?persist=true)                         |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 Bronze Tier: Raw Tables                     |
|    raw_indeed_jobs | raw_linkedin_jobs | raw_wellfound_jobs  |
+------------------------------+------------------------------+
                               |
                               | Trigger: POST /api/parse/{source}
                               v
+-------------------------------------------------------------+
|             LLM & Normalization Pipeline                    |
|  - Gemini 3.7 Flash Tiered (batch array: 25 jobs / call)    |
|  - PayNormalizer (LPA, USD, EUR, GBP, monthly -> INR/yr)    |
|  - ExperienceExtractor (freshers, min/max years)            |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                Silver Tier: Clean Storage                   |
|                        unified_jobs                         |
+-------------------------------------------------------------+
```

---

## Tech stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy (asyncio with `NullPool`), Asyncpg, `curl_cffi` (HTTP/2 TLS fingerprinting), Pydantic v2
- **Database**: PostgreSQL 16 on `localhost:5432` (`iwantajob_db`)
- **LLM**: Gemini 3.7 Flash Tiered via FreeAPI
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide / Iconoir

---

## API reference

### 1. System and health

#### `GET /health`
Returns backend health status.

```bash
curl http://localhost:8020/health
```

**Response (`200 OK`):**
```json
{"status": "ok", "version": "1.0.0"}
```

---

### 2. Scraping ingestion

Scrapes job listings from upstream providers. Pass `persist=true` to stage records directly in the Bronze raw database tables.

#### `GET /api/scrape/indeed`
Fetches jobs from Indeed's Mobile GraphQL Gateway.

**Parameters:**
- `what` (string, default: `"software engineer"`): Search keywords.
- `where` (string, default: `"India"`): Location.
- `start` (integer, default: `0`): Pagination offset.
- `limit` (integer, default: `10`, max: `50`): Number of jobs.
- `persist` (boolean, default: `false`): Save to `raw_indeed_jobs`.

```bash
curl "http://localhost:8020/api/scrape/indeed?what=python+developer&where=India&limit=10&persist=true"
```

#### `GET /api/scrape/linkedin`
Fetches listings from LinkedIn guest job endpoints.

**Parameters:**
- `keywords` (string, default: `"software engineer"`): Search query.
- `location` (string, default: `"India"`): Location query.
- `start` (integer, default: `0`): Pagination offset.
- `limit` (integer, default: `10`, max: `50`): Number of jobs.
- `fetch_descriptions` (boolean, default: `true`): Enrich cards with full description body.
- `persist` (boolean, default: `false`): Save to `raw_linkedin_jobs`.

```bash
curl "http://localhost:8020/api/scrape/linkedin?keywords=backend&location=India&limit=10&persist=true"
```

#### `GET /api/scrape/wellfound`
Scrapes startup positions from Wellfound Next.js server-side Apollo store.

**Parameters:**
- `role` (string, default: `"software-engineer"`): Wellfound role slug.
- `location` (string, default: `"india"`): Location slug.
- `page` (integer, default: `1`): Page number.
- `persist` (boolean, default: `false`): Save to `raw_wellfound_jobs`.

```bash
curl "http://localhost:8020/api/scrape/wellfound?role=ai-engineer&location=india&persist=true"
```

#### `GET /api/wellfound/roles`
Returns searchable Wellfound role and location slugs.

---

### 3. Parsing pipeline and status

#### `GET /api/status/parsing`
Returns the total raw counts, parsed counts, and unparsed backlog per provider.

```bash
curl http://localhost:8020/api/status/parsing
```

**Response (`200 OK`):**
```json
{
  "indeed": { "total_raw": 19, "parsed": 19, "unparsed": 0 },
  "linkedin": { "total_raw": 28, "parsed": 28, "unparsed": 0 },
  "wellfound": { "total_raw": 24, "parsed": 24, "unparsed": 0 },
  "unified_total": 71
}
```

#### Manual parse triggers
Processes unparsed raw records in chunks of 25 jobs per LLM call and promotes them to `unified_jobs`.

- `POST /api/parse/indeed?batch_size=50&use_llm=true`
- `POST /api/parse/linkedin?batch_size=50&use_llm=true`
- `POST /api/parse/wellfound?batch_size=50&use_llm=true`

**Parameters:**
- `batch_size` (integer, default: `50`, range: `1-500`): Maximum unparsed rows to process in this run.
- `use_llm` (boolean, default: `true`): Set to `false` to use local regex normalization without LLM calls.

**Response (`200 OK`):**
```json
{
  "source": "linkedin",
  "processed": 25,
  "promoted_to_unified": 25,
  "errors": []
}
```

---

### 4. Unified jobs query and triage

#### `GET /api/jobs/unified`
Queries normalized, clean listings from `unified_jobs`.

**Query parameters:**
- `source` (string): Filter by `"indeed"`, `"linkedin"`, or `"wellfound"`.
- `city` (string): Lowercase city slug (e.g., `"bengaluru"`, `"pune"`, `"delhi-ncr"`).
- `is_fresher_friendly` (boolean): `true` returns roles requiring 0-1 years of experience.
- `easy_apply_available` (boolean): Filters for direct Indeed Apply or instant apply postings.
- `min_salary_inr` (integer): Minimum annual salary in INR (e.g., `1200000` for 12 LPA).
- `is_saved` (boolean): Filter bookmarked roles.
- `is_archived` (boolean): Filter archived roles.
- `limit` (integer, default: `50`, max: `200`): Page size.
- `offset` (integer, default: `0`): Pagination offset.

```bash
curl "http://localhost:8020/api/jobs/unified?is_fresher_friendly=true&min_salary_inr=1000000&limit=10"
```

#### `PATCH /api/jobs/unified/{job_id}/triage`
Updates the `is_saved` or `is_archived` status for a single job in PostgreSQL.

```bash
curl -X PATCH "http://localhost:8020/api/jobs/unified/<UUID>/triage" \
  -H "Content-Type: application/json" \
  -d '{"is_saved": true}'
```

**Response (`200 OK`):**
```json
{
  "updated": true,
  "id": "7e9ec006-f5d6-4269-911d-c2fa9f8f45b5",
  "is_saved": true,
  "is_archived": false
}
```

#### `PATCH /api/jobs/unified/triage`
Batch updates triage state for multiple job IDs.

```bash
curl -X PATCH "http://localhost:8020/api/jobs/unified/triage" \
  -H "Content-Type: application/json" \
  -d '{"job_ids": ["<UUID_1>", "<UUID_2>"], "is_archived": true}'
```

#### `DELETE /api/jobs/unified`
Permanently deletes unified job rows by ID list.

```bash
curl -X DELETE "http://localhost:8020/api/jobs/unified" \
  -H "Content-Type: application/json" \
  -d '{"job_ids": ["<UUID_1>"]}'
```

#### `POST /api/db/reset`
Clears all records across raw staging tables and `unified_jobs`.

---

## MCP server

Every API endpoint above is also exposed as an MCP tool so agents (Claude Code, Claude Desktop, any MCP client) can drive the platform directly: scraping (Indeed / LinkedIn / Wellfound / all together), the bronze→silver parsing pipeline, unified job search, save/archive/unsave/unarchive triage, and database maintenance.

- **Definition:** `backend/src/mcp_server.py` — stdio transport, 24 tools, 1:1 mapping to backend endpoints.
- **Backend target:** `JOB_API_BASE_URL` env var (default `http://localhost:8020`).

### Run standalone

```bash
cd backend && uv run python -m src.mcp_server
```

### Use from Claude Code

The repo registers it via `.mcp.json` (project scope) — after approving the server, tools are available as `mcp__iwantajob__*`:

```json
{
  "mcpServers": {
    "iwantajob": {
      "command": "uv",
      "args": ["run", "--directory", "/home/azureuser/iwantajob/backend", "python", "-m", "src.mcp_server"]
    }
  }
}
```

Typical agent workflows:

1. **Scrape → parse → search:** `scrape_indeed` / `scrape_linkedin` / `scrape_wellfound` (or `scrape_all_providers`) with `persist=true`, then `parse_indeed_jobs` etc., then `search_unified_jobs`.
2. **Organize:** `save_jobs`, `archive_jobs`, `unsave_jobs`, `unarchive_jobs` (undo), or preference-driven bulk classification via `run_auto_triage`.

The `clear_bronze_layer` / `clear_test_data` / `reset_database` tools are destructive and should be confirmed with the user before an agent calls them.

---

## Database schema

### `unified_jobs`
Primary clean table containing normalized records.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique record identifier (`uuid4`) |
| `source` | `TEXT` | NOT NULL, INDEX | Source aggregator (`indeed`, `linkedin`, `wellfound`) |
| `external_id` | `TEXT` | NOT NULL | Upstream listing ID |
| `raw_ref_id` | `UUID` | NOT NULL, INDEX | Foreign reference to source raw table row |
| `url` | `TEXT` | UNIQUE, NOT NULL | Canonical job link |
| `title` | `TEXT` | NOT NULL, INDEX | Role title |
| `company_name` | `TEXT` | NOT NULL, INDEX | Employer name |
| `company_logo_url` | `TEXT` | NULLABLE | Company logo image link |
| `location_raw` | `TEXT` | NOT NULL | Raw location text |
| `city` | `TEXT` | NULLABLE, INDEX | Standardized lowercase city slug |
| `is_remote` | `BOOLEAN` | DEFAULT FALSE, INDEX | Remote flexibility flag |
| `is_international` | `BOOLEAN` | DEFAULT FALSE | International position flag |
| `easy_apply_available` | `BOOLEAN` | DEFAULT FALSE, INDEX | Direct Indeed Apply or instant apply |
| `salary_min_inr_year` | `BIGINT` | NULLABLE, INDEX | Minimum annual pay in integer INR |
| `salary_max_inr_year` | `BIGINT` | NULLABLE, INDEX | Maximum annual pay in integer INR |
| `salary_raw` | `TEXT` | NULLABLE | Original salary string from posting |
| `salary_currency_raw` | `TEXT` | NULLABLE | Detected currency symbol or code |
| `experience_min_years` | `INTEGER` | NULLABLE, INDEX | Minimum experience in years (0 for freshers) |
| `experience_max_years` | `INTEGER` | NULLABLE, INDEX | Maximum experience in years |
| `is_fresher_friendly` | `BOOLEAN` | DEFAULT FALSE, INDEX | True if role welcomes freshers or <= 1 year |
| `is_saved` | `BOOLEAN` | DEFAULT FALSE, INDEX | Saved or bookmarked by user |
| `is_archived` | `BOOLEAN` | DEFAULT FALSE, INDEX | Archived or hidden by user |
| `description_text` | `TEXT` | NOT NULL | Sanitized description body |
| `posted_at` | `TIMESTAMPTZ`| NULLABLE, INDEX | Original posting timestamp |
| `parsed_at` | `TIMESTAMPTZ`| DEFAULT NOW() | Timestamp when record entered unified table |

*Unique constraint:* `(source, external_id)` prevents duplicate parsing promotions.

---

## Local setup and development

### Prerequisites
- Python 3.12+
- Node.js 18+ and pnpm / npm
- PostgreSQL 16 with a database named `iwantajob_db`

### 1. Configure environment

Create `.env` in the repository root or copy from `.env.example`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/iwantajob_db
FREEAPI_BASE_URL=https://freeapiforme.aryansingh.space/v1
FREEAPI_API_KEY=your_freeapi_key_here
FREEAPI_MODEL=gemini-3.7-flash-tiered
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run database migrations and test suite
pytest

# Start development server
uvicorn src.main:app --host 0.0.0.0 --port 8020 --reload
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run build
npm run start -- -p 3020
```

Open `http://localhost:3020` in your browser.

---

## Running tests

The test suite covers database migrations, URL canonicalization, deduplication, regex normalization, LLM parsing, batch extraction, and live manual parser endpoints.

```bash
cd backend
source .venv/bin/activate
pytest -v
```
