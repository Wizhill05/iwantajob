# Frontend Dashboard Design Specification: Next.js Ingestion & Parsing Platform

- **Project:** Autonomous Job Discovery & Aggregation Platform
- **Component:** Frontend Dashboard (`frontend/`)
- **Date:** 2026-09-04
- **Status:** Approved Architecture Specification

---

## 1. Executive Summary

This specification defines the architecture, styling guide, component hierarchy, user experience (UX), and API integration for the Next.js web dashboard of the Autonomous Job Discovery & Aggregation Platform.

The dashboard serves as the operational cockpit for monitoring raw scraper engines (Indeed Mobile GraphQL, LinkedIn Guest API, Wellfound Apollo SSR), testing scraper configurations with rich parameter controls, triggering and tracking the Bronze-to-Silver data normalization pipeline, inspecting real-time execution logs, and browsing clean normalized jobs stored in the PostgreSQL Silver database (`unified_jobs`).

---

## 2. Design System & Styling Rules

Strict adherence to visual guidelines is required across every page and component:

### 2.1 Color Palette
- **Background Root:** `#131313` (Very dark gray base)
- **Surfaces & Cards:** `#181818` (Primary cards/panels), `#202020` (Secondary cards/dropdowns/dialogs)
- **Borders & Dividers:** `#2a2a2a` (Default subtle borders), `#383838` (Interactive hover borders)
- **Accent Primary:** `#3ecf8e` (Mint/Emerald bright accent for primary action buttons, indicators, active tabs, highlight states)
- **Accent Secondary & Hovers:** `#287150` (Deep emerald for muted hover backgrounds, focus rings, secondary badges, soft gradients)
- **Text:** `#f3f4f6` (High contrast primary headings/body), `#9ca3af` (Muted labels/metadata), `#6b7280` (Dim timestamps)
- **Status Colors:**
  - Success / Active: `#3ecf8e`
  - Warning / In Progress: `#f59e0b`
  - Danger / Error: `#ef4444`
  - Info / Raw: `#38bdf8`

### 2.2 Typography
- **UI & Body:** `Inter`, sans-serif (`font-sans`)
- **Headings & Titles:** `Manrope`, sans-serif (`font-heading`)
- **Code, Numbers & Metrics:** `JetBrains Mono`, monospace (`font-mono`)

### 2.3 Strict Iconography & Embellishment Rules
- **No Emojis:** Zero emoji characters anywhere in UI text, tooltips, buttons, titles, or console logs.
- **Icon Library:** `iconoir-react` exclusively.
- **No Star Icons:** Star icons must NEVER be used to denote AI, enrichment, or ranking. Use `Spark` or `Cpu` or `Brain` or `Flash` from `iconoir-react`.
- **Component Kit:** Tremor components (`@tremor/react`) for KPI metrics, progress bars, callouts, and clean data tables.

### 2.4 Responsive Layout Architecture
- **Desktop (>= 1024px):**
  - Persistent left sidebar (`w-64`, fixed position, background `#131313`, right border `#262626`).
  - Top header displaying environment status, live backend health probe ping, active process count, and quick reload.
  - Main scrollable viewport (`ml-64`).
- **Mobile (< 1024px):**
  - Top sticky minimalist navigation bar with app logo and system status dot.
  - Floating iOS-style bottom dock (`fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 bg-[#181818]/90 backdrop-blur-md rounded-2xl border border-[#2a2a2a] shadow-2xl px-4 py-2 flex justify-around items-center`).
  - Active tab highlighted with a `#3ecf8e` background glow pill and vibrant icon.
  - Bottom padding (`pb-24`) on mobile pages to prevent dock occlusion.

---

## 3. Application Structure & Routes

```
frontend/
├── app/
│   ├── layout.tsx              # Root HTML, fonts (Inter, Manrope, JetBrains Mono), theme provider
│   ├── page.tsx                # Route: / (Overview Dashboard & Live Processes)
│   ├── scrapers/
│   │   └── page.tsx            # Route: /scrapers (Indeed, LinkedIn, Wellfound Test Suite)
│   ├── pipeline/
│   │   └── page.tsx            # Route: /pipeline (Bronze-to-Silver Normalization Manager)
│   ├── jobs/
│   │   └── page.tsx            # Route: /jobs (Clean Silver Unified Jobs Explorer)
│   └── logs/
│       └── page.tsx            # Route: /logs (Activity History & System Logs)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx         # Desktop left sidebar
│   │   ├── BottomNav.tsx       # Mobile floating iOS bottom dock
│   │   └── Header.tsx          # Top utility bar with live status probe
│   ├── scrapers/
│   │   ├── ScraperTabs.tsx     # Tab switcher (Indeed, LinkedIn, Wellfound)
│   │   ├── IndeedForm.tsx      # Indeed parameters (what, where, limit, sort, persist)
│   │   ├── LinkedInForm.tsx    # LinkedIn parameters (keywords, location, start, time, work_type, seniority)
│   │   ├── WellfoundForm.tsx   # Wellfound parameters (canonical roles, canonical locations, page, persist)
│   │   ├── JobResultsView.tsx  # Cards view + JSON response toggle
│   │   └── RawJsonViewer.tsx   # Syntax-highlighted payload viewer with copy button
│   ├── pipeline/
│   │   ├── PipelineKpi.tsx     # Total Raw vs Unified parsed counts & progress bars
│   │   ├── ParseTriggerCard.tsx# Trigger buttons per provider with batch_size & use_llm toggles
│   │   └── PipelineStats.tsx   # Freshers vs Experienced & extraction method distributions
│   ├── jobs/
│   │   ├── JobFilterBar.tsx    # Filter bar: source, city, fresher-friendly, easy-apply, min salary
│   │   ├── UnifiedJobCard.tsx  # Standardized job card (salary in LPA, badges, apply button)
│   │   └── JobDetailModal.tsx  # Modal/drawer showing complete plain-text description & raw refs
│   └── ui/                     # Tremor and custom UI elements (StatCard, Badge, Button, Input, Modal)
├── context/
│   └── ActivityContext.tsx     # Global execution state, active processes queue, and recent log ring buffer
├── lib/
│   ├── api.ts                  # Fetch client pointing to FastAPI endpoints
│   └── utils.ts                # Currency formatting (LPA / INR), relative time, slug helpers
├── tailwind.config.js          # Custom theme extensions (#131313, #3ecf8e, #287150)
└── next.config.js              # Rewrites to proxy /api/* -> http://127.0.0.1:8020
```

---

## 4. Page Specifications

### 4.1 Overview Dashboard (`/`)
- **System Metrics Bar**:
  - Live API Health indicator (checks `/health` every 10s with response latency in ms).
  - Total Raw Bronze records count across all 3 providers.
  - Promoted Silver records count in `unified_jobs`.
  - Overall pipeline conversion percentage.
- **Provider Status Cards**:
  - **Indeed Mobile GQL**: Raw count, parsed count, unparsed pending count, rate limiter status.
  - **LinkedIn Guest API**: Raw count, parsed count, 24h cache status, authwall limit (<975).
  - **Wellfound SSR Apollo**: Raw count, parsed count, page ceiling (<= 20).
- **Active Processes Panel**:
  - Displays any currently executing scraper query or batch parsing pipeline run.
  - Displays spinning indicator, elapsed seconds, provider name, parameters, and status.
- **Live Activity Feed**:
  - Ring buffer of last 50 events across the session (e.g. `[SCRAPE] LinkedIn query 'ai engineer' completed: 20 jobs (1420ms)`, `[PARSE] Indeed batch of 50 records promoted to unified_jobs`).
  - Filterable by type (`All`, `Scrape`, `Parse`, `Error`).

### 4.2 Raw Scraper Testers (`/scrapers`)
- **Header & Provider Tabs**:
  - Clean segment tab switcher between `LinkedIn Guest`, `Indeed Mobile`, and `Wellfound Apollo`.
- **Testing Controls Form**:
  - **LinkedIn**:
    - Keyword input (e.g. `software engineer`, `ai engineer`).
    - Location input (e.g. `India`, `Bengaluru`).
    - Start offset slider/number input (0 to 975, with safeguard warning).
    - Limit (1 to 100).
    - Freshness dropdown (Past 24h, Past Week, Past Month, Any).
    - Workplace dropdown (All, On-site, Remote, Hybrid).
    - Seniority dropdown (All, Internship, Entry, Associate, Mid-Senior, Director).
    - Fetch Descriptions toggle (enabled by default).
    - Persist to Bronze Raw DB toggle (`persist=true`).
  - **Indeed**:
    - What input (role or keywords).
    - Where input (location).
    - Limit (1 to 100).
    - Sort selector (`relevance`, `date`).
    - Persist toggle (`persist=true`).
  - **Wellfound**:
    - Canonical Role dropdown (dynamic from `/api/wellfound/roles` with search filter).
    - Canonical Location dropdown (dynamic from `/api/wellfound/roles`).
    - Page input (1 to 20).
    - Max Age Days (1 to 180).
    - Include all company jobs toggle.
    - Persist toggle (`persist=true`).
- **Execution & Output Zone**:
  - Prominent "Execute Scraper" action button with `#3ecf8e` accent.
  - Response metadata banner: HTTP Status (e.g. `200 OK`), Execution Latency (e.g. `842 ms`), Records Returned.
  - Switcher: **Rendered Job Cards** vs **Raw JSON Response** with syntax highlighting and one-click copy.
  - Interactive job cards show: Title, Company, Location, Workplace type badge, Date, Apply URL button, and expandable plain text / description snippet.

### 4.3 Normalization Pipeline Manager (`/pipeline`)
- **Bronze-to-Silver Flow Diagram**:
  - Visual status overview showing Bronze Raw staging tables flowing into Silver `unified_jobs`.
- **Provider Parser Cards**:
  - One card each for **Indeed**, **LinkedIn**, and **Wellfound**.
  - Displays: Unparsed Raw Count, Total Raw Count.
  - Configuration inputs:
    - Batch Size slider/input (1 to 500, default 50).
    - LLM Fallback switch (`use_llm=true/false`) with explanatory label (dispatches to Gemini 3.7 Flash Tiered if regex cannot resolve salary or experience).
  - "Run Parser" button with loading spinner and active process registration.
  - Execution Result Toast/Banner showing: records processed, records successfully promoted, and error count.
- **Normalization Engine Diagnostics**:
  - Pay Normalization breakdown (native vs regex vs LLM vs None).
  - Experience Normalization breakdown (Freshers detected, experienced bounds).

### 4.4 Clean Silver Jobs Explorer (`/jobs`)
- **Query Filter Bar**:
  - Source filter (All, Indeed, LinkedIn, Wellfound).
  - City filter (Dropdown or search for `bengaluru`, `pune`, `delhi-ncr`, `hyderabad`, `mumbai`, etc.).
  - Fresher-friendly toggle switch (`<= 1 year experience`).
  - Easy Apply toggle switch (direct Indeed apply or instant apply).
  - Min Salary Range Slider (0 LPA to 50+ LPA).
- **Jobs Grid**:
  - Responsive cards with company name, clean role title, standardized city, salary range formatted in LPA (e.g. `₹18L – ₹30L / yr`), fresher badge, remote badge, easy apply badge.
  - One-click "View Full Description" opening a sliding sheet / modal with cleaned description text.
  - Direct external link button to the canonical job posting.

### 4.5 Activity & System Logs (`/logs`)
- Real-time log table showing all events triggered during the session and historical metrics.
- Database table statistics summary (`raw_indeed_jobs`, `raw_linkedin_jobs`, `raw_wellfound_jobs`, `unified_jobs`).
- Direct links to Swagger docs (`/docs`) and OpenAPI spec (`/openapi.json`).

---

## 5. Network & Proxy Architecture

- The FastAPI backend runs on `http://127.0.0.1:8020`.
- The Next.js dashboard runs on `http://localhost:3020`.
- Next.js `next.config.js` configures rewrites:
  ```javascript
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8020/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://127.0.0.1:8020/health',
      },
    ];
  }
  ```
- This ensures no CORS issues and uniform client-side requests (`/api/...`).

---

## 6. Self-Review & Verification Criteria

- **No Emojis:** Verified throughout all code, templates, and UI components.
- **Icon Library:** `iconoir-react` used for all icons.
- **Accents:** `#3ecf8e` and `#287150` on top of `#131313` background.
- **Fonts:** Inter, Manrope, JetBrains Mono imported and configured in Tailwind.
- **Responsive Navigation:** Floating bottom dock on mobile (`< 1024px`), full sidebar on desktop (`>= 1024px`).
- **Complete Feature Set:** Indeed, LinkedIn, Wellfound testers + Pipeline manager + Unified clean jobs browser + Real-time logs and active processes.
