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
  salary_extraction_method: 'native' | 'regex' | 'llm' | 'none';
  experience_min_years?: number | null;
  experience_max_years?: number | null;
  is_fresher_friendly: boolean;
  experience_extraction_method: 'native' | 'regex' | 'llm' | 'none';
  description_text: string;
  posted_at?: string | null;
  parsed_at: string;
}

export interface ProviderParsingStats {
  total_raw: number;
  parsed: number;
  unparsed: number;
}

export interface ParsingStatus {
  indeed: ProviderParsingStats;
  linkedin: ProviderParsingStats;
  wellfound: ProviderParsingStats;
  unified_total: number;
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
  easy_apply_available?: boolean;
  min_salary_inr?: number;
  limit?: number;
  offset?: number;
}

export interface HealthCheckResponse {
  status: string;
  version: string;
}
