'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Suitcase,
  Refresh,
  Filter,
  NavArrowLeft,
  NavArrowRight,
  WarningTriangle,
  RefreshDouble,
  Spark,
  Cpu,
  Database,
  Eye,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type { UnifiedJobItem, UnifiedJobsQueryParams } from '@/lib/types';
import {
  JobsFilterBar,
  DEFAULT_FILTERS,
  type JobsFilterValues,
  getActiveFilterCount,
} from '@/components/jobs/JobsFilterBar';
import { CleanJobCard } from '@/components/jobs/CleanJobCard';
import { JobDescriptionModal } from '@/components/jobs/JobDescriptionModal';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;

function JobsExplorerContent() {
  const searchParams = useSearchParams();

  // Initialize filters from query params if present
  const [filters, setFilters] = useState<JobsFilterValues>(() => {
    const sourceParam = searchParams.get('source');
    const cityParam = searchParams.get('city');
    const fresherParam = searchParams.get('is_fresher_friendly');
    const easyApplyParam = searchParams.get('easy_apply_available');
    const minSalaryParam = searchParams.get('min_salary_inr');

    const initial: JobsFilterValues = { ...DEFAULT_FILTERS };

    if (
      sourceParam === 'indeed' ||
      sourceParam === 'linkedin' ||
      sourceParam === 'wellfound'
    ) {
      initial.source = sourceParam;
    }
    if (cityParam) {
      initial.city = cityParam;
    }
    if (fresherParam === 'true' || fresherParam === 'false') {
      initial.is_fresher_friendly = fresherParam;
    }
    if (easyApplyParam === 'true' || easyApplyParam === 'false') {
      initial.easy_apply_available = easyApplyParam;
    }
    if (minSalaryParam) {
      const parsed = parseInt(minSalaryParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        initial.min_salary_lpa = Math.min(50, Math.round(parsed / 100000));
      }
    }

    return initial;
  });

  const [jobs, setJobs] = useState<UnifiedJobItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedJob, setSelectedJob] = useState<UnifiedJobItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Fetch clean jobs from /api/jobs/unified
  const fetchJobs = useCallback(
    async (pageToLoad = currentPage, showRefreshAnimation = false) => {
      if (showRefreshAnimation) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const offset = (pageToLoad - 1) * PAGE_SIZE;
      const params: UnifiedJobsQueryParams = {
        limit: PAGE_SIZE,
        offset,
      };

      if (filters.source !== 'all') {
        params.source = filters.source;
      }
      if (filters.city.trim() !== '') {
        params.city = filters.city.trim().toLowerCase();
      }
      if (filters.is_fresher_friendly === 'true') {
        params.is_fresher_friendly = true;
      } else if (filters.is_fresher_friendly === 'false') {
        params.is_fresher_friendly = false;
      }
      if (filters.easy_apply_available === 'true') {
        params.easy_apply_available = true;
      } else if (filters.easy_apply_available === 'false') {
        params.easy_apply_available = false;
      }
      if (filters.min_salary_lpa > 0) {
        params.min_salary_inr = filters.min_salary_lpa * 100000;
      }

      try {
        const result = await api.getUnifiedJobs(params);
        setJobs(result);
      } catch (err: any) {
        setError(
          err?.message ||
            'Failed to retrieve clean standardized jobs from PostgreSQL database.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filters, currentPage]
  );

  // Trigger fetch when filters change (resets to page 1)
  useEffect(() => {
    setCurrentPage(1);
    fetchJobs(1);
  }, [
    filters.source,
    filters.city,
    filters.is_fresher_friendly,
    filters.easy_apply_available,
    filters.min_salary_lpa,
  ]);

  // Handle page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setCurrentPage(newPage);
    fetchJobs(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset filters handler
  const handleResetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
  };

  // Client-side query search filter (if search input has value)
  const displayedJobs = useMemo(() => {
    if (!filters.searchQuery || filters.searchQuery.trim() === '') {
      return jobs;
    }
    const q = filters.searchQuery.toLowerCase().trim();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company_name.toLowerCase().includes(q) ||
        (j.description_text && j.description_text.toLowerCase().includes(q))
    );
  }, [jobs, filters.searchQuery]);

  const activeCount = getActiveFilterCount(filters);

  const handleOpenDrawer = (job: UnifiedJobItem) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-sans text-[#3ecf8e] mb-1">
            <Database className="w-3.5 h-3.5" />
            <span>Silver Tier / Unified Jobs</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold font-heading text-white tracking-tight">
            Clean Silver Jobs Explorer
          </h1>
          <p className="text-xs md:text-sm text-[#9ca3af] mt-1 font-sans">
            Browse normalized, deduplicated positions with standardized annual INR
            compensation and extracted experience bounds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/pipeline"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] hover:border-[#383838] text-xs font-sans text-[#9ca3af] hover:text-white transition-colors"
          >
            <RefreshDouble className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Parser Pipeline</span>
          </Link>

          <button
            type="button"
            onClick={() => fetchJobs(currentPage, true)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ecf8e]/15 hover:bg-[#3ecf8e]/25 border border-[#3ecf8e]/30 hover:border-[#3ecf8e]/50 text-xs font-sans font-medium text-[#3ecf8e] transition-all disabled:opacity-50"
          >
            <Refresh className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Dimensional Filter Bar */}
      <JobsFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        totalResults={displayedJobs.length}
        isLoading={isLoading}
      />

      {/* Results Header: Dynamic Counter & Active Status */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-sans text-white font-semibold">
            {isLoading ? (
              <span className="text-[#9ca3af]">Querying unified repository...</span>
            ) : (
              <span>
                Showing{' '}
                <strong className="text-[#3ecf8e] font-mono">
                  {displayedJobs.length}
                </strong>{' '}
                clean standardized roles
              </span>
            )}
          </span>

          {activeCount > 0 && (
            <span className="text-[11px] font-sans text-[#6b7280]">
              (filtered from central database)
            </span>
          )}
        </div>

        {/* Page indicator */}
        <div className="flex items-center gap-2 text-xs font-sans text-[#9ca3af]">
          <span>Page <span className="font-mono">{currentPage}</span></span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              aria-label="Previous Page"
              className="p-1 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <NavArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={jobs.length < PAGE_SIZE || isLoading}
              aria-label="Next Page"
              className="p-1 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <NavArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex items-start gap-3">
          <WarningTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs font-sans">
            <h4 className="font-semibold text-rose-300">
              Failed to load unified jobs
            </h4>
            <p className="text-rose-400/90 mt-0.5 leading-relaxed font-mono">{error}</p>
            <button
              type="button"
              onClick={() => fetchJobs(currentPage)}
              className="mt-2.5 px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 font-medium transition-colors"
            >
              Retry Request
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl bg-[#181818] border border-[#262626] p-5 space-y-4 animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#262626]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#262626] rounded w-3/4" />
                  <div className="h-3 bg-[#262626] rounded w-1/2" />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="h-4 w-16 bg-[#262626] rounded" />
                <div className="h-4 w-16 bg-[#262626] rounded" />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="h-12 bg-[#202020] rounded-lg" />
                <div className="h-12 bg-[#202020] rounded-lg" />
              </div>

              <div className="h-8 bg-[#202020] rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && displayedJobs.length === 0 && (
        <div className="rounded-xl bg-[#181818] border border-[#262626] p-8 md:p-12 text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#202020] border border-[#262626] flex items-center justify-center mx-auto text-[#9ca3af]">
            <Suitcase className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-semibold font-heading text-white">
              No jobs found matching your filters
            </h3>
            <p className="text-xs text-[#9ca3af] leading-relaxed max-w-md mx-auto">
              No jobs found matching your filters. Try adjusting your parameters or
              running the parser pipeline to promote newly ingested raw scrape data
              into the silver repository.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] text-xs font-mono text-white transition-colors"
              >
                <Filter className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Reset Filters</span>
              </button>
            )}

            <Link
              href="/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ecf8e]/15 hover:bg-[#3ecf8e]/25 border border-[#3ecf8e]/30 text-xs font-mono font-medium text-[#3ecf8e] transition-colors"
            >
              <RefreshDouble className="w-3.5 h-3.5" />
              <span>Run Parser Pipeline</span>
            </Link>
          </div>
        </div>
      )}

      {/* Clean Job Cards Grid */}
      {!isLoading && displayedJobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedJobs.map((job) => (
            <CleanJobCard
              key={job.id}
              job={job}
              onViewDetails={handleOpenDrawer}
            />
          ))}
        </div>
      )}

      {/* Bottom Pagination Bar */}
      {!isLoading && displayedJobs.length > 0 && (
        <div className="flex items-center justify-between border-t border-[#262626] pt-4 text-xs font-mono">
          <div className="text-[#6b7280]">
            Displaying roles {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
            {(currentPage - 1) * PAGE_SIZE + displayedJobs.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#202020] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all"
            >
              <NavArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="px-3 py-1.5 rounded-lg bg-[#141414] border border-[#262626] text-[#3ecf8e] font-semibold">
              Page {currentPage}
            </span>

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={jobs.length < PAGE_SIZE || isLoading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#202020] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all"
            >
              <span>Next</span>
              <NavArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Full Description & Provenance Drawer/Modal */}
      <JobDescriptionModal
        job={selectedJob}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-xs font-mono text-[#9ca3af] flex items-center gap-2">
          <Refresh className="w-4 h-4 animate-spin text-[#3ecf8e]" />
          <span>Loading Unified Jobs Explorer...</span>
        </div>
      }
    >
      <JobsExplorerContent />
    </Suspense>
  );
}
