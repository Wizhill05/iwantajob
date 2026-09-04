import type {
  JobItem,
  JobSearchResponse,
  UnifiedJobItem,
  ParsingStatus,
  WellfoundRolesResponse,
  ParseResult,
  UnifiedJobsQueryParams,
  HealthCheckResponse,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMessage = `HTTP error ${res.status}: ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.detail) {
          errorMessage =
            typeof errorData.detail === 'string'
              ? errorData.detail
              : JSON.stringify(errorData.detail);
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Fallback to generic status text
      }
      throw new Error(errorMessage);
    }

    return (await res.json()) as T;
  }

  /**
   * Check backend health and readiness.
   */
  async getHealth(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('/health');
  }

  /**
   * Fetch parsing status breakdown across raw staging tables and unified_jobs.
   */
  async getParsingStatus(): Promise<ParsingStatus> {
    return this.request<ParsingStatus>('/api/status/parsing');
  }

  /**
   * Fetch canonical Wellfound roles and locations supported by the scraper.
   */
  async getWellfoundRoles(): Promise<WellfoundRolesResponse> {
    return this.request<WellfoundRolesResponse>('/api/wellfound/roles');
  }

  /**
   * Scrape Indeed using mobile GraphQL gateway.
   */
  async scrapeIndeed(params: {
    what?: string;
    where?: string;
    limit?: number;
    sort?: string;
    radius?: number;
    radius_unit?: string;
    cursor?: string;
    persist?: boolean;
  }): Promise<JobSearchResponse> {
    const searchParams = new URLSearchParams();
    if (params.what) searchParams.set('what', params.what);
    if (params.where) searchParams.set('where', params.where);
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.radius !== undefined) searchParams.set('radius', String(params.radius));
    if (params.radius_unit) searchParams.set('radius_unit', params.radius_unit);
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.persist !== undefined) searchParams.set('persist', String(params.persist));

    const qs = searchParams.toString();
    return this.request<JobSearchResponse>(`/api/scrape/indeed${qs ? `?${qs}` : ''}`);
  }

  /**
   * Scrape LinkedIn guest postings.
   */
  async scrapeLinkedIn(params: {
    keywords?: string;
    location?: string;
    start?: number;
    limit?: number;
    time_range?: string;
    work_type?: string;
    seniority?: string;
    fetch_descriptions?: boolean;
    persist?: boolean;
  }): Promise<JobItem[]> {
    const searchParams = new URLSearchParams();
    if (params.keywords) searchParams.set('keywords', params.keywords);
    if (params.location) searchParams.set('location', params.location);
    if (params.start !== undefined) searchParams.set('start', String(params.start));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.time_range) searchParams.set('time_range', params.time_range);
    if (params.work_type) searchParams.set('work_type', params.work_type);
    if (params.seniority) searchParams.set('seniority', params.seniority);
    if (params.fetch_descriptions !== undefined) {
      searchParams.set('fetch_descriptions', String(params.fetch_descriptions));
    }
    if (params.persist !== undefined) {
      searchParams.set('persist', String(params.persist));
    }

    const qs = searchParams.toString();
    return this.request<JobItem[]>(`/api/scrape/linkedin${qs ? `?${qs}` : ''}`);
  }

  /**
   * Scrape Wellfound roles via SSR Apollo state.
   */
  async scrapeWellfound(params: {
    role?: string;
    location?: string;
    page?: number;
    limit?: number;
    max_age_days?: number;
    include_all_company_jobs?: boolean;
    persist?: boolean;
  }): Promise<JobItem[]> {
    const searchParams = new URLSearchParams();
    if (params.role) searchParams.set('role', params.role);
    if (params.location) searchParams.set('location', params.location);
    if (params.page !== undefined) searchParams.set('page', String(params.page));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.max_age_days !== undefined) {
      searchParams.set('max_age_days', String(params.max_age_days));
    }
    if (params.include_all_company_jobs !== undefined) {
      searchParams.set('include_all_company_jobs', String(params.include_all_company_jobs));
    }
    if (params.persist !== undefined) {
      searchParams.set('persist', String(params.persist));
    }

    const qs = searchParams.toString();
    return this.request<JobItem[]>(`/api/scrape/wellfound${qs ? `?${qs}` : ''}`);
  }

  /**
   * Scrape Wellfound company open roles.
   */
  async scrapeWellfoundCompany(
    companySlug: string,
    limit: number = 50
  ): Promise<JobItem[]> {
    return this.request<JobItem[]>(
      `/api/scrape/wellfound/company/${encodeURIComponent(companySlug)}?limit=${limit}`
    );
  }

  /**
   * Trigger manual normalization and parsing for a specific provider.
   */
  async triggerParse(
    source: 'indeed' | 'linkedin' | 'wellfound',
    options: {
      batchSize?: number;
      useLlm?: boolean;
    } = {}
  ): Promise<ParseResult> {
    const searchParams = new URLSearchParams();
    if (options.batchSize !== undefined) {
      searchParams.set('batch_size', String(options.batchSize));
    }
    if (options.useLlm !== undefined) {
      searchParams.set('use_llm', String(options.useLlm));
    }

    const qs = searchParams.toString();
    return this.request<ParseResult>(`/api/parse/${source}${qs ? `?${qs}` : ''}`, {
      method: 'POST',
    });
  }

  /**
   * Query clean standardized jobs from unified_jobs.
   */
  async getUnifiedJobs(params: UnifiedJobsQueryParams = {}): Promise<UnifiedJobItem[]> {
    const searchParams = new URLSearchParams();
    if (params.source) searchParams.set('source', params.source);
    if (params.city) searchParams.set('city', params.city);
    if (params.is_fresher_friendly !== undefined) {
      searchParams.set('is_fresher_friendly', String(params.is_fresher_friendly));
    }
    if (params.easy_apply_available !== undefined) {
      searchParams.set('easy_apply_available', String(params.easy_apply_available));
    }
    if (params.min_salary_inr !== undefined) {
      searchParams.set('min_salary_inr', String(params.min_salary_inr));
    }
    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      searchParams.set('offset', String(params.offset));
    }

    const qs = searchParams.toString();
    return this.request<UnifiedJobItem[]>(`/api/jobs/unified${qs ? `?${qs}` : ''}`);
  }
}

export const api = new ApiClient();
export default api;
