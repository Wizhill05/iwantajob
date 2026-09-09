/**
 * Core Data Contracts for Autonomous Job Discovery & Parsing Platform
 * Strictly no emojis or star icons.
 */

export interface JobItem {
  id?: string;
  external_id: string;
  title: string;
  company_name: string;
  source: 'indeed' | 'linkedin' | 'wellfound';
  location_raw: string;
  city?: string | null;
  is_remote: boolean;
  is_international: boolean;
  salary_raw?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  url: string;
  description_text: string;
  description_html?: string | null;
  posted_at?: string | null;
  experience_min_years?: number | null;
  experience_max_years?: number | null;
  company_logo_url?: string | null;
  company_website?: string | null;
  easy_apply_available?: boolean;
  is_in_db?: boolean;
  attributes?: Array<{ key?: string; label?: string }> | Record<string, any>[];
  raw_payload?: Record<string, any>;
}

export interface JobSearchResponse {
  query: string;
  location: string;
  total_count: number;
  next_cursor?: string | null;
  sort: string;
  radius_km: number;
  items: JobItem[];
}

export interface UnifiedJobItem {
  id: string;
  source: 'indeed' | 'linkedin' | 'wellfound';
  external_id: string;
  raw_ref_id?: string;
  url: string;
  title: string;
  company_name: string;
  company_logo_url?: string | null;
  location_raw: string;
  city?: string | null;
  is_remote: boolean;
  is_international: boolean;
  easy_apply_available: boolean;
  salary_min_inr_year?: number | null;
  salary_max_inr_year?: number | null;
  salary_raw?: string | null;
  salary_currency_raw?: string | null;
  experience_min_years?: number | null;
  experience_max_years?: number | null;
  is_fresher_friendly: boolean;
  is_saved?: boolean;
  is_archived?: boolean;
  description_text: string;
  posted_at?: string | null;
  parsed_at: string;
}

export interface ProviderParsingStats {
  total_raw: number;
  parsed: number;
  unparsed: number;
}

export interface PipelineRunJob {
  provider: 'indeed' | 'linkedin' | 'wellfound' | 'unified';
  kind: 'parse' | 'reparse';
  started_at: string;
  batch_size: number | null;
  processed: number;
  promoted: number;
  error: string | null;
}

export interface LastPipelineJob extends PipelineRunJob {
  status: 'completed' | 'failed';
  finished_at: string;
  updated?: number;
}

export interface ParsingStatus {
  indeed: ProviderParsingStats;
  linkedin: ProviderParsingStats;
  wellfound: ProviderParsingStats;
  unified_total: number;
  active_job: PipelineRunJob | null;
  last_job: LastPipelineJob | null;
}

export interface WellfoundSlugItem {
  slug: string;
  name: string;
}

export interface WellfoundRolesResponse {
  roles: WellfoundSlugItem[];
  locations: WellfoundSlugItem[];
  pagination_limit: number;
}

export interface ParseResult {
  source: 'indeed' | 'linkedin' | 'wellfound';
  processed: number;
  promoted_to_unified: number;
  errors: string[];
}

/** Ack returned by POST /api/parse/{provider} — the job itself runs in the backend. */
export interface ParseStartResult {
  started: boolean;
  provider: string;
  batch_size: number;
  use_llm: boolean;
}

export interface ActiveProcess {
  id: string;
  type: 'scrape' | 'parse';
  provider: 'indeed' | 'linkedin' | 'wellfound';
  startTime: number;
  status: 'running' | 'completed' | 'failed';
  message?: string;
  params?: Record<string, any>;
}

export type LogLevel = 'INFO' | 'SCRAPE' | 'PARSE' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  durationMs?: number;
  details?: any;
}

export interface ScraperQueryPayload {
  provider: 'indeed' | 'linkedin' | 'wellfound';
  params: Record<string, any>;
}

export interface UnifiedJobsQueryParams {
  source?: 'indeed' | 'linkedin' | 'wellfound';
  city?: string;
  is_fresher_friendly?: boolean;
  experience_level?: 'all' | 'fresher' | 'experienced';
  easy_apply_available?: boolean;
  min_salary_inr?: number;
  is_saved?: boolean;
  is_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface HealthCheckResponse {
  status: string;
  version: string;
}

export interface UserPreferences {
  id: string;
  allow_international: boolean;
  max_experience_years: number;
  require_fresher_friendly: boolean;
  preferred_title_keywords: string[];
  blocked_title_keywords: string[];
  preferred_cities: string[];
  min_salary_inr_year: number | null;
}

export interface AutoTriageResult {
  dry_run: boolean;
  evaluated: number;
  saved: number;
  archived: number;
  left_active: number;
  skipped_manual: number;
  details: { id: string; action: string; reason: string }[];
}

export interface CronJob {
  id: string;
  name: string;
  provider: 'indeed' | 'linkedin' | 'wellfound' | 'all';
  hour: number;
  minute: number;
  days_of_week: number[];
  search_params: Record<string, any>;
  auto_parse: boolean;
  is_enabled: boolean;
  last_run_at: string | null;
  last_status: 'success' | 'failed' | 'running' | null;
  last_result_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCronJobPayload {
  name: string;
  provider: 'indeed' | 'linkedin' | 'wellfound' | 'all';
  hour: number;
  minute: number;
  days_of_week?: number[];
  search_params?: Record<string, any>;
  auto_parse?: boolean;
  is_enabled?: boolean;
}

export interface UpdateCronJobPayload {
  name?: string;
  provider?: 'indeed' | 'linkedin' | 'wellfound' | 'all';
  hour?: number;
  minute?: number;
  days_of_week?: number[];
  search_params?: Record<string, any>;
  auto_parse?: boolean;
  is_enabled?: boolean;
}

export interface CronRunResult {
  status: 'success' | 'failed' | 'running';
  job_id: string;
  provider?: string;
  details?: string;
  scraped?: Record<string, number>;
  parsed?: Record<string, number>;
  error?: string;
  run_id?: string | null;
}

export interface CronRunRecord {
  id: string;
  cron_job_id: string | null;
  job_name: string;
  provider: string;
  trigger: 'manual' | 'scheduler' | string;
  status: 'running' | 'success' | 'failed' | string;
  started_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  error: string | null;
}

export interface CronRunsPage {
  total: number;
  limit: number;
  offset: number;
  runs: CronRunRecord[];
}
