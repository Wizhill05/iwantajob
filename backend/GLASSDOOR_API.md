# Glassdoor Job Scraping API Documentation

This document describes the Glassdoor Guest Scraper endpoints, guardrails, and data schemas for frontend agents and integration services.

## Overview
Glassdoor protects authenticated desktop and mobile search sessions behind strict login walls and multi-factor bot challenges (Cloudflare / PerimeterX). This client targets Glassdoor's public search and job listing endpoints with Chrome 120 TLS ClientHello impersonation via `curl_cffi` (with `httpx` fallback), request throttling, concurrency limits, in-memory caching, and automated block/rate-limit detection.

---

## Base URL
* Local: `http://localhost:8030`
* Swagger Interactive Docs: `/docs`

---

## Endpoints

### 1. Scrape Glassdoor Job Postings
Queries job listings matching keywords, location, workplace type, time freshness, and seniority. Returns standardized job listings with direct canonical URLs and optional rich HTML descriptions.

* **Endpoint:** `GET /api/scrape/glassdoor`
* **Response Status:** `200 OK`

#### Query Parameters

| Parameter | Type | Required | Default | Allowed Values / Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `keywords` | `string` | No | `"software engineer"` | Non-empty string | Role, skills, or job title search query. |
| `location` | `string` | No | `"India"` | Non-empty string | Target country or city (e.g. `India`, `Bengaluru`, `Pune`). |
| `start` | `integer` | No | `0` | `0` to `975` | Pagination start offset. |
| `limit` | `integer` | No | `20` | `1` to `100` | Maximum number of job postings to return. |
| `time_range` | `string` | No | `null` | `1`, `7`, `14`, `30` | Listing age in days. |
| `work_type` | `string` | No | `null` | `"1"`, `"2"`, `"3"` | Workplace setting: 1 (On-site), 2 (Remote), 3 (Hybrid). |
| `seniority` | `string` | No | `null` | `"entrylevel"`, `"mid"`, `"senior"` | Seniority level filter. |
| `fetch_descriptions` | `boolean` | No | `true` | `true`, `false` | Concurrently fetch full descriptions with LRU cache. |
| `persist` | `boolean` | No | `false` | `true`, `false` | When `true`, saves scraped listings to `raw_glassdoor_jobs` (Bronze tier). |

---

## Data Schema: `JobItem`
Matches the standard `JobItem` model where `source = "glassdoor"`.
Raw items saved in the Bronze tier include `raw_glassdoor_jobs` with full original payloads.
