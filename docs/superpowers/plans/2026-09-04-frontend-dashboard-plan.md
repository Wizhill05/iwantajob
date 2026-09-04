# Next.js Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade Next.js 14 web dashboard for the Autonomous Job Discovery & Aggregation Platform, featuring dark theme styling (`#131313`, `#3ecf8e`, `#287150`), `iconoir-react` (strictly zero emojis, zero star icons), Tremor UI components, responsive desktop sidebar & iOS-style floating bottom dock, scraper testing suite (Indeed, LinkedIn, Wellfound), Bronze-to-Silver parsing pipeline triggers & metrics, clean unified job explorer, and real-time process monitoring & activity logs.

**Architecture:** Next.js App Router frontend residing in `frontend/`, configured to run on port 3020 with internal API rewrites pointing to the FastAPI backend at `http://127.0.0.1:8020`. State management via React Context (`ActivityContext`) tracking active background scraping/parsing tasks and streaming a recent event log ring buffer. UI built with Tailwind CSS, `@tremor/react`, `iconoir-react`, and custom components designed for both desktop and mobile layouts.

**Tech Stack:** Next.js 14/15, TypeScript, Tailwind CSS, `@tremor/react`, `iconoir-react`, Google Fonts (`Inter`, `Manrope`, `JetBrains Mono`), FastAPI backend (port 8020).

**Spec:** `docs/superpowers/specs/2026-09-04-frontend-dashboard-design.md`

## Global Constraints

- **Background Palette:** Primary dark base `#131313`, card surfaces `#181818`, elevated borders `#262626`.
- **Accent Tones:** Mint accent `#3ecf8e` and deep emerald `#287150`.
- **Typography:** Inter (UI/Body), Manrope (Headings), JetBrains Mono (Code/Metrics).
- **Strict Prohibition:** NO EMOJIS anywhere in UI or logs.
- **Strict Prohibition:** NO STAR ICONS for AI or enrichment indicators (use `Spark`, `Cpu`, `Brain`, etc.).
- **Icons:** Use `iconoir-react` exclusively.
- **Components:** Tremor components (`@tremor/react`) for KPI metrics, progress bars, callouts, and clean data tables.
- **Responsive Layout:** Persistent sidebar on desktop (`>= 1024px`), floating iOS-style bottom dock on mobile (`< 1024px`).

---

## File Structure Map

```
frontend/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                    # Overview & Real-time Processes
│   ├── scrapers/page.tsx           # Scraper Testing Lab (LinkedIn, Indeed, Wellfound)
│   ├── pipeline/page.tsx           # Bronze-to-Silver Normalization Pipeline
│   ├── jobs/page.tsx               # Silver Unified Jobs Explorer
│   └── logs/page.tsx               # Activity & System Logs
├── context/
│   └── ActivityContext.tsx         # Global active processes queue + log ring buffer
├── lib/
│   ├── api.ts                      # Client-side API fetch methods
│   ├── types.ts                    # Job, Scraper, Parser, and System TypeScript definitions
│   └── utils.ts                    # LPA currency formatter, relative time, slug helpers
├── components/
│   ├── layout/
│   │   ├── DesktopSidebar.tsx      # Fixed left sidebar
│   │   ├── MobileBottomNav.tsx     # Floating iOS-style bottom dock
│   │   └── TopHeader.tsx           # Top status bar with live health probe
│   ├── common/
│   │   ├── Badge.tsx
│   │   ├── JsonViewer.tsx          # Monospace syntax colored JSON with copy button
│   │   └── ProcessDrawer.tsx       # Drawer/modal for active task progress
│   ├── scrapers/
│   │   ├── ScraperTabs.tsx         # Switcher for LinkedIn, Indeed, Wellfound
│   │   ├── LinkedInTester.tsx      # LinkedIn parameters & runner
│   │   ├── IndeedTester.tsx        # Indeed parameters & runner
│   │   ├── WellfoundTester.tsx     # Wellfound parameters & runner
│   │   └── ScrapedResultList.tsx   # Visual job cards + JSON payload toggle
│   ├── pipeline/
│   │   ├── PipelineKpiGrid.tsx     # Bronze raw vs Silver unified progress bars
│   │   ├── ParserTriggerCard.tsx   # Per-provider parse controls (batch_size, use_llm)
│   │   └── PipelineStatsView.tsx   # Normalization method breakdown
│   └── jobs/
│       ├── UnifiedFilterBar.tsx    # Filter bar (fresher, easy-apply, salary, city, source)
│       ├── UnifiedJobCard.tsx      # Clean standardized job card
│       └── JobDetailModal.tsx      # Plain-text description modal
```

---

### Task 1: Scaffolding Next.js App & Dependencies

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/next.config.mjs`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/layout.tsx`

- [ ] **Step 1: Restart FastAPI backend on port 8020 with latest code**
Kill old process 367003 and launch uvicorn with current backend code to ensure `/api/status/parsing`, `/api/parse/*`, `/api/jobs/unified`, and `/api/scrape/*` are all available.
Verify with `curl http://localhost:8020/health` and `curl http://localhost:8020/api/status/parsing`.

- [ ] **Step 2: Scaffold Next.js project in `frontend/` directory**
Install `next`, `react`, `react-dom`, `@tremor/react`, `iconoir-react`, `tailwindcss`, `postcss`, `autoprefixer`, `clsx`, `tailwind-merge`.
Configure font imports for `Inter`, `Manrope`, and `JetBrains Mono` via `next/font/google`.

- [ ] **Step 3: Configure Tailwind theme and Next rewrites**
Set up colors (`#131313`, `#181818`, `#202020`, `#2a2a2a`, `#3ecf8e`, `#287150`) in `tailwind.config.ts` and Tremor safelist.
Set up Next.js rewrites in `next.config.mjs` to proxy `/api/:path*` and `/health` to `http://127.0.0.1:8020`.

- [ ] **Step 4: Verify Next.js compiles and runs**
Run `npm run build` or start Next.js dev server on port 3020 and curl `http://localhost:3020/health` to confirm proxy works.

- [ ] **Step 5: Commit**
```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js app with Tailwind, Tremor, and iconoir"
```

---

### Task 2: Core Data Types, API Client & Activity Context

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/utils.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/context/ActivityContext.tsx`

**Interfaces:**
- Produces:
  - `JobItem`, `UnifiedJobItem`, `ParsingStatus`, `ScraperQueryPayload`, `LogEntry`, `ActiveProcess`
  - `api.getHealth()`, `api.getParsingStatus()`, `api.getWellfoundRoles()`, `api.scrapeIndeed()`, `api.scrapeLinkedIn()`, `api.scrapeWellfound()`, `api.triggerParse()`, `api.getUnifiedJobs()`
  - `useActivity()` hook providing `activeProcesses`, `startProcess()`, `updateProcess()`, `finishProcess()`, `logs`, `addLog()`, `clearLogs()`

- [ ] **Step 1: Define TypeScript interfaces in `frontend/lib/types.ts`**
Define strict contracts for raw scraper responses, unified jobs, parsing status, filter params, and logging structures.

- [ ] **Step 2: Implement utility helpers in `frontend/lib/utils.ts`**
Format salaries in Lakhs/INR (e.g. `1500000` -> `₹15L`), relative time formatting, class merger (`cn`), and text truncation.

- [ ] **Step 3: Implement centralized API client in `frontend/lib/api.ts`**
Methods with error handling for `/health`, `/api/status/parsing`, `/api/wellfound/roles`, `/api/scrape/indeed`, `/api/scrape/linkedin`, `/api/scrape/wellfound`, `/api/parse/{source}`, `/api/jobs/unified`.

- [ ] **Step 4: Implement ActivityContext and Provider**
Provide global execution monitoring: track running scrapers and parsers with live timers, store execution history ring buffer (last 100 entries), and provide event emitters.

- [ ] **Step 5: Commit**
```bash
git add frontend/lib frontend/context
git commit -m "feat(frontend): add data contracts, API client, and ActivityContext"
```

---

### Task 3: Navigation Architecture (Desktop Sidebar + Mobile iOS Bottom Dock + Top Header)

**Files:**
- Create: `frontend/components/layout/DesktopSidebar.tsx`
- Create: `frontend/components/layout/MobileBottomNav.tsx`
- Create: `frontend/components/layout/TopHeader.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Implement `DesktopSidebar.tsx`**
Sidebar fixed on the left (`hidden lg:flex w-64 flex-col bg-[#131313] border-r border-[#262626]`).
Logo with terminal style branding, navigation links:
  - Overview (`/`) - icon: `ViewGrid`
  - Scraper Lab (`/scrapers`) - icon: `SearchEngine` / `Cpu`
  - Pipeline (`/pipeline`) - icon: `RefreshDouble`
  - Unified Jobs (`/jobs`) - icon: `Briefcase`
  - Logs & System (`/logs`) - icon: `Terminal`
Bottom section with API status ping pill and version tag. Strictly zero emojis.

- [ ] **Step 2: Implement `MobileBottomNav.tsx`**
iOS-style floating glassmorphic dock (`lg:hidden fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 bg-[#181818]/90 backdrop-blur-md rounded-2xl border border-[#2a2a2a] shadow-2xl px-3 py-2 flex justify-around items-center`).
Active item indicator with `#3ecf8e` glow and compact badges if background tasks are running.

- [ ] **Step 3: Implement `TopHeader.tsx`**
Top bar on all screen sizes with page title, live backend health status indicator (pulsing `#3ecf8e` dot when ok, latency in ms), active task pill (`X active processes`), and quick reload button.

- [ ] **Step 4: Update `app/layout.tsx` with Theme & Navigation Shell**
Wrap with `ActivityProvider`, include `DesktopSidebar`, `TopHeader`, `MobileBottomNav`, and set page background to `#131313`.

- [ ] **Step 5: Verify Responsive Navigation via Preview**
Ensure desktop sidebar renders cleanly at `>= 1024px` and switches to floating bottom dock at `< 1024px` without content overflow.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/layout frontend/app/layout.tsx
git commit -m "feat(frontend): implement responsive desktop sidebar and iOS mobile dock"
```

---

### Task 4: Overview Dashboard & Active Process Monitor (`/`)

**Files:**
- Create: `frontend/components/overview/KpiGrid.tsx`
- Create: `frontend/components/overview/ProviderCard.tsx`
- Create: `frontend/components/overview/ActiveProcessesList.tsx`
- Create: `frontend/components/overview/RecentActivityLog.tsx`
- Create: `frontend/app/page.tsx`

- [ ] **Step 1: Implement `KpiGrid.tsx` using Tremor**
Cards for:
  - Total Raw Bronze Ingested
  - Silver Unified Clean Jobs
  - Pipeline Conversion Ratio (% progress bar)
  - Upstream Gateway Health (Indeed, LinkedIn, Wellfound)

- [ ] **Step 2: Implement `ProviderCard.tsx`**
Per-provider cards for Indeed, LinkedIn, and Wellfound displaying:
  - Raw Scraped records vs Parsed records
  - Unparsed backlog with Tremor CategoryBar/ProgressBar
  - Quick action links: "Test Scraper" and "Trigger Pipeline"

- [ ] **Step 3: Implement `ActiveProcessesList.tsx`**
Card displaying currently running background scrapers or parser tasks.
Shows provider, start time, elapsed seconds ticker, animated progress indicator, and action details.

- [ ] **Step 4: Implement `RecentActivityLog.tsx`**
Filterable streaming activity table showing last events with timestamp, badge for status (Success, Pending, Failed), latency, and details.

- [ ] **Step 5: Compose `app/page.tsx`**
Assemble the overview dashboard with auto-polling (every 10s) for parsing status and health.

- [ ] **Step 6: Test & Verify Overview Page**
Verify dashboard loads data from FastAPI backend, displays metrics, and updates in real time.

- [ ] **Step 7: Commit**
```bash
git add frontend/components/overview frontend/app/page.tsx
git commit -m "feat(frontend): implement overview dashboard and live process monitor"
```

---

### Task 5: Scraper Testing Lab (`/scrapers`)

**Files:**
- Create: `frontend/components/scrapers/ScraperTabs.tsx`
- Create: `frontend/components/scrapers/IndeedTester.tsx`
- Create: `frontend/components/scrapers/LinkedInTester.tsx`
- Create: `frontend/components/scrapers/WellfoundTester.tsx`
- Create: `frontend/components/scrapers/ScrapedJobCard.tsx`
- Create: `frontend/components/scrapers/RawJsonViewer.tsx`
- Create: `frontend/app/scrapers/page.tsx`

- [ ] **Step 1: Implement `LinkedInTester.tsx`**
Full parameter suite:
  - Keywords, Location, Start offset (clamped to 975), Limit (1-100)
  - Time range dropdown (Past 24h `r86400`, Past Week `r604800`, Past Month `r2592000`)
  - Work type dropdown (On-site `1`, Remote `2`, Hybrid `3`)
  - Seniority dropdown (Internship, Entry, Associate, Mid-Senior, Director)
  - Fetch descriptions toggle (default `true`)
  - Persist to Bronze raw DB toggle (`persist=true`)
Execute button with latency benchmark timer and process registration.

- [ ] **Step 2: Implement `IndeedTester.tsx`**
Parameters:
  - What (title/keyword), Where (location), Limit (1-100), Sort (relevance/date), Persist toggle.
Execute button with latency benchmark timer and process registration.

- [ ] **Step 3: Implement `WellfoundTester.tsx`**
Dynamic canonical slug dropdowns loaded from `/api/wellfound/roles`:
  - Canonical Role selector, Canonical Location selector
  - Page selector (1-20 ceiling guardrail)
  - Max age days (1-180), Include all company jobs toggle, Persist toggle.
Execute button with latency benchmark timer and process registration.

- [ ] **Step 4: Implement Results View (Cards + Raw JSON Viewer)**
Render returned `JobItem` list in structured cards with company, role, workplace badge, location, apply link, and expandable description.
Toggle button to view formatted syntax-highlighted JSON payload with one-click copy button.

- [ ] **Step 5: Compose `app/scrapers/page.tsx`**
Tabbed interface allowing seamless switching between LinkedIn, Indeed, and Wellfound testers with persistent input state.

- [ ] **Step 6: Test Scrapers Live in UI**
Trigger test queries on all three scrapers through the UI and verify response cards, JSON viewer, and persistence behavior.

- [ ] **Step 7: Commit**
```bash
git add frontend/components/scrapers frontend/app/scrapers
git commit -m "feat(frontend): implement interactive scraper testing suite for all providers"
```

---

### Task 6: Bronze-to-Silver Pipeline Manager (`/pipeline`)

**Files:**
- Create: `frontend/components/pipeline/PipelineFlowDiagram.tsx`
- Create: `frontend/components/pipeline/ParserControlCard.tsx`
- Create: `frontend/components/pipeline/PipelineStatsOverview.tsx`
- Create: `frontend/app/pipeline/page.tsx`

- [ ] **Step 1: Implement `PipelineFlowDiagram.tsx`**
Visual pipeline representation showing Bronze Tier raw tables (`raw_indeed_jobs`, `raw_linkedin_jobs`, `raw_wellfound_jobs`) passing through normalization engines (PayNormalizer, ExperienceExtractor, LLM Fallback) into Silver Tier (`unified_jobs`).

- [ ] **Step 2: Implement `ParserControlCard.tsx`**
Cards for Indeed, LinkedIn, and Wellfound:
  - Displays: Unparsed records count, Total raw count.
  - Inputs: Batch size slider/input (1 to 500, default 50).
  - Toggle: `use_llm` fallback (Gemini 3.7 Flash Tiered) with explanation tooltip.
  - Action: "Run Normalization Batch" button.
  - On run: Registers active process in `ActivityContext`, posts to `/api/parse/{provider}`, streams result toast with processed vs promoted count and errors.

- [ ] **Step 3: Implement `PipelineStatsOverview.tsx`**
Tremor metric cards showing extraction methods distribution (`native`, `regex`, `llm`, `none`) and fresher classification stats (`is_fresher_friendly`).

- [ ] **Step 4: Compose `app/pipeline/page.tsx`**
Assemble the pipeline manager page with auto-refresh of status after parsing runs.

- [ ] **Step 5: Test & Verify Pipeline Execution**
Run manual parsing triggers from the UI and verify real-time status updates and promotion feedback.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/pipeline frontend/app/pipeline
git commit -m "feat(frontend): implement Bronze-to-Silver parsing pipeline management view"
```

---

### Task 7: Clean Silver Jobs Explorer (`/jobs`)

**Files:**
- Create: `frontend/components/jobs/JobsFilterBar.tsx`
- Create: `frontend/components/jobs/CleanJobCard.tsx`
- Create: `frontend/components/jobs/JobDescriptionModal.tsx`
- Create: `frontend/app/jobs/page.tsx`

- [ ] **Step 1: Implement `JobsFilterBar.tsx`**
Filters:
  - Source (All, Indeed, LinkedIn, Wellfound)
  - City search/dropdown (`bengaluru`, `pune`, `delhi-ncr`, `hyderabad`, `mumbai`, etc.)
  - Fresher-friendly toggle (`min_years <= 1`)
  - Easy Apply toggle (Direct apply)
  - Min Salary Range Slider (0 to 50 LPA, with live LPA label)
  - Reset filters button

- [ ] **Step 2: Implement `CleanJobCard.tsx`**
Displays:
  - Company name & logo avatar placeholder
  - Job title and standardized city slug
  - Normalized annual compensation in LPA (`₹15L – ₹25L / yr`)
  - Experience badge (e.g. `Fresher (0 yrs)` or `3 - 5 yrs`)
  - Work setting badge (Remote / On-site)
  - Source badge (Indeed, LinkedIn, Wellfound)
  - Direct apply button
  - "Read Full Description" button

- [ ] **Step 3: Implement `JobDescriptionModal.tsx`**
Sliding drawer / modal with full plain-text job description, raw database reference UUID (`raw_ref_id`), parsed timestamp, and extraction metadata.

- [ ] **Step 4: Compose `app/jobs/page.tsx`**
Fetch `/api/jobs/unified` with query params, pagination support (limit/offset), loading skeletons, and empty state with clear instructions.

- [ ] **Step 5: Test Filters and Job Drawer**
Verify that filtering by fresher-friendly, easy apply, source, and salary updates the job cards correctly.

- [ ] **Step 6: Commit**
```bash
git add frontend/components/jobs frontend/app/jobs
git commit -m "feat(frontend): implement clean unified jobs browser with filters and detail drawer"
```

---

### Task 8: System Logs, Process Monitor & Verification (`/logs`)

**Files:**
- Create: `frontend/components/logs/LogsTerminalView.tsx`
- Create: `frontend/components/logs/DbStatsTable.tsx`
- Create: `frontend/app/logs/page.tsx`

- [ ] **Step 1: Implement `LogsTerminalView.tsx`**
Monospace terminal-style log viewer (`font-mono bg-[#0d0d0d] border border-[#262626] rounded-xl p-4`) with search filter, level tags (`[INFO]`, `[SCRAPE]`, `[PARSE]`, `[ERROR]`), timestamp, clear logs button, and export logs button.

- [ ] **Step 2: Implement `DbStatsTable.tsx`**
Live breakdown of database tables (`raw_indeed_jobs`, `raw_linkedin_jobs`, `raw_wellfound_jobs`, `unified_jobs`) showing record counts, latest insertion times, and health status.

- [ ] **Step 3: Compose `app/logs/page.tsx`**
Assemble logs view and system diagnostics.

- [ ] **Step 4: End-to-End Build & Visual Verification**
1. Run `npm run build` in `frontend/` to verify zero TypeScript or Next.js build errors.
2. Verify responsive layout using preview tools for both Desktop (sidebar) and Mobile (iOS bottom floating dock).
3. Verify strict styling adherence: dark `#131313`, `#3ecf8e` accents, `iconoir-react` exclusively, zero emojis, zero star icons.

- [ ] **Step 5: Commit**
```bash
git add frontend/components/logs frontend/app/logs
git commit -m "feat(frontend): implement system logs console and database stats"
```

---

## Plan Self-Review Checklist

1. **Spec Coverage:**
   - Dark theme `#131313` & `#3ecf8e` / `#287150` -> Handled in Tasks 1 & 3
   - No emojis & iconoir-react exclusively -> Specified across all tasks
   - No star icons for AI -> Specified in Task 1 & 6
   - Tremor components -> Tasks 1, 4, 6
   - Responsive sidebar on desktop & floating bottom dock on iOS/mobile -> Task 3
   - Scraper testing suite (Indeed, LinkedIn, Wellfound) -> Task 5
   - Bronze-to-Silver parsing pipeline triggers & stats -> Task 6
   - Clean unified jobs explorer with LPA formatting & filters -> Task 7
   - Real-time running processes and logs feed -> Tasks 2, 4, 8
2. **No Placeholders:** All tasks define exact files, components, parameters, and behaviors.
3. **Type Consistency:** Contracts defined in `frontend/lib/types.ts` are used consistently across API client and UI components.
