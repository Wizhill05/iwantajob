import type {
  JobItem,
  JobSearchResponse,
  UnifiedJobItem,
  ParsingStatus,
  WellfoundRolesResponse,
  ParseResult,
  UnifiedJobsQueryParams,
  HealthCheckResponse,
  UserPreferences,
  AutoTriageResult,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || '';

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
   * Trigger Gemini LLM normalization and parsing for a specific provider.
   */
  async triggerParse(
    source: 'indeed' | 'linkedin' | 'wellfound',
    options: {
      batchSize?: number;
    } = {}
  ): Promise<ParseResult> {
    const searchParams = new URLSearchParams();
    if (options.batchSize !== undefined) {
      searchParams.set('batch_size', String(options.batchSize));
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
    if (params.is_saved !== undefined) {
      searchParams.set('is_saved', String(params.is_saved));
    }
    if (params.is_archived !== undefined) {
      searchParams.set('is_archived', String(params.is_archived));
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

  /**
   * Update saved/archived triage state for a single job in DB.
   */
  async updateJobTriage(
    jobId: string,
    payload: { is_saved?: boolean; is_archived?: boolean }
  ): Promise<{ updated: boolean; id: string; is_saved: boolean; is_archived: boolean }> {
    return this.request(`/api/jobs/unified/${jobId}/triage`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Batch update saved/archived triage state for multiple jobs in DB.
   */
  async batchUpdateJobTriage(
    jobIds: string[],
    payload: { is_saved?: boolean; is_archived?: boolean }
  ): Promise<{ updated_count: number }> {
    return this.request('/api/jobs/unified/triage', {
      method: 'PATCH',
      body: JSON.stringify({ job_ids: jobIds, ...payload }),
    });
  }

  /**
   * Permanently delete jobs from database by their IDs.
   */
  async deleteUnifiedJobs(jobIds: string[]): Promise<{ deleted_count: number }> {
    return this.request<{ deleted_count: number }>('/api/jobs/unified', {
      method: 'DELETE',
      body: JSON.stringify({ job_ids: jobIds }),
    });
  }

  /**
   * Reset database completely to 0.
   */
  async resetDatabase(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>('/api/db/reset', {
      method: 'POST',
    });
  }

  /**
   * Get auto-triage taste preferences (creates defaults on first call).
   */
  async getPreferences(): Promise<UserPreferences> {
    return this.request<UserPreferences>('/api/preferences');
  }

  /**
   * Partially update auto-triage taste preferences.
   */
  async updatePreferences(
    payload: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    return this.request<UserPreferences>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Classify active jobs with the strict rules engine.
   */
  async autoTriage(
    params: { dry_run?: boolean; limit?: number; force?: boolean } = {}
  ): Promise<AutoTriageResult> {
    const searchParams = new URLSearchParams();
    if (params.dry_run !== undefined) {
      searchParams.set('dry_run', String(params.dry_run));
    }
    if (params.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params.force !== undefined) {
      searchParams.set('force', String(params.force));
    }
    const qs = searchParams.toString();
    return this.request<AutoTriageResult>(
      `/api/jobs/auto-triage${qs ? `?${qs}` : ''}`,
      { method: 'POST' }
    );
  }
}

export const api = new ApiClient();
export default api;
