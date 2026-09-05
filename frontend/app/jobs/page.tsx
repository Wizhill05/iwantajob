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
  Database,
  Bookmark,
  Archive,
  Trash,
  Undo,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type { UnifiedJobItem, UnifiedJobsQueryParams } from '@/lib/types';
import {
  JobsFilterBar,
  DEFAULT_FILTERS,
  type JobsFilterValues,
  getActiveFilterCount,
} from '@/components/jobs/JobsFilterBar';
import { CompactJobRow } from '@/components/jobs/CompactJobRow';
import { JobDescriptionModal } from '@/components/jobs/JobDescriptionModal';
import { PageHero } from '@/components/layout/PageHero';
import { triageStorage } from '@/lib/triageStorage';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

type TriageTab = 'active' | 'saved' | 'archived';

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

  const [activeTab, setActiveTab] = useState<TriageTab>('active');
  const [jobs, setJobs] = useState<UnifiedJobItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedJob, setSelectedJob] = useState<UnifiedJobItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Triage state (synchronized with localStorage)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Load triage state from localStorage on client mount
  useEffect(() => {
    setSavedIds(triageStorage.getSavedIds());
    setArchivedIds(triageStorage.getArchivedIds());
    setDeletedIds(triageStorage.getDeletedIds());
  }, []);

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

  // Trigger fetch when query filters change
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

  // Triage Action Handlers
  const handleToggleSave = (jobId: string) => {
    triageStorage.toggleSave(jobId);
    setSavedIds(triageStorage.getSavedIds());
    setArchivedIds(triageStorage.getArchivedIds());
  };

  const handleArchive = (jobId: string) => {
    triageStorage.archive(jobId);
    setArchivedIds(triageStorage.getArchivedIds());
    setSavedIds(triageStorage.getSavedIds());
  };

  const handleUnarchive = (jobId: string) => {
    triageStorage.unarchive(jobId);
    setArchivedIds(triageStorage.getArchivedIds());
  };

  const handleDelete = (jobId: string) => {
    triageStorage.delete(jobId);
    setDeletedIds(triageStorage.getDeletedIds());
    setSavedIds(triageStorage.getSavedIds());
    setArchivedIds(triageStorage.getArchivedIds());
  };

  // Filter jobs based on active tab and search query
  const displayedJobs = useMemo(() => {
    // 1. Exclude deleted jobs from all views
    let list = jobs.filter((j) => !deletedIds.has(j.id));

    // 2. Filter by Active Tab
    if (activeTab === 'active') {
      list = list.filter((j) => !archivedIds.has(j.id));
    } else if (activeTab === 'saved') {
      list = list.filter((j) => savedIds.has(j.id));
    } else if (activeTab === 'archived') {
      list = list.filter((j) => archivedIds.has(j.id));
    }

    // 3. Client-side query search filter (if search input has value)
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase().trim();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company_name.toLowerCase().includes(q) ||
          (j.city && j.city.toLowerCase().includes(q)) ||
          (j.description_text && j.description_text.toLowerCase().includes(q))
      );
    }

    return list;
  }, [jobs, activeTab, savedIds, archivedIds, deletedIds, filters.searchQuery]);

  // Counts for each tab badge
  const tabCounts = useMemo(() => {
    const nonDeleted = jobs.filter((j) => !deletedIds.has(j.id));
    return {
      active: nonDeleted.filter((j) => !archivedIds.has(j.id)).length,
      saved: nonDeleted.filter((j) => savedIds.has(j.id)).length,
      archived: nonDeleted.filter((j) => archivedIds.has(j.id)).length,
    };
  }, [jobs, savedIds, archivedIds, deletedIds]);

  const activeFilterCount = getActiveFilterCount(filters);

  const handleOpenModal = (job: UnifiedJobItem) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const handleCloseModal = () => {
    setIsDrawerOpen(false);
  };

  return (
    <div className="relative max-w-7xl mx-auto pb-16">
      {/* Centered Dynamic Hero */}
      <PageHero />

      {/* Main Content Starting After Half Viewport with Pull-Up Overlay */}
      <div className="relative z-10 -mt-8 pt-4 space-y-4 bg-[#131313] min-h-[60vh]">
        {/* Collapsible Mobile/Desktop Filter Control */}
        <JobsFilterBar
          filters={filters}
          onChange={setFilters}
          onReset={handleResetFilters}
          totalResults={displayedJobs.length}
          isLoading={isLoading}
        />

      {/* Triage Folder Tabs: Active / Saved / Archived */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#262626] pb-3">
        <div className="flex items-center gap-1.5 bg-[#181818] p-1 rounded-xl border border-[#262626]">
          {/* Active Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-all',
              activeTab === 'active'
                ? 'bg-[#222222] text-white font-medium shadow-sm'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Suitcase className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Active Roles</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-[#111] text-[#9ca3af]">
              {tabCounts.active}
            </span>
          </button>

          {/* Saved Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-all',
              activeTab === 'saved'
                ? 'bg-[#222222] text-[#3ecf8e] font-medium shadow-sm'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Bookmark className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Saved</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-[#111] text-[#3ecf8e]">
              {tabCounts.saved}
            </span>
          </button>

          {/* Archived Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-all',
              activeTab === 'archived'
                ? 'bg-[#222222] text-amber-400 font-medium shadow-sm'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Archived</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-[#111] text-amber-400">
              {tabCounts.archived}
            </span>
          </button>
        </div>

        {/* Counter and Page Controls */}
        <div className="flex items-center gap-3 text-xs font-sans text-[#9ca3af]">
          <span>
            Showing <strong className="font-mono text-white">{displayedJobs.length}</strong> roles
          </span>

          <div className="flex items-center gap-1 border-l border-[#262626] pl-3">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              aria-label="Previous Page"
              className="p-1.5 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <NavArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono px-2 text-white">
              Page {currentPage}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={jobs.length < PAGE_SIZE || isLoading}
              aria-label="Next Page"
              className="p-1.5 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <NavArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex items-start gap-3">
          <WarningTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs font-sans">
            <h4 className="font-semibold text-rose-300">Failed to load unified jobs</h4>
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
        <div className="border border-[#262626] rounded-xl overflow-hidden divide-y divide-[#262626]">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-4 bg-[#141414] animate-pulse flex items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-3.5 bg-[#222222] rounded w-2/5" />
                <div className="h-2.5 bg-[#1e1e1e] rounded w-1/4" />
              </div>
              <div className="h-4 bg-[#222222] rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && displayedJobs.length === 0 && (
        <div className="rounded-xl bg-[#181818] border border-[#262626] p-8 md:p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#202020] border border-[#262626] flex items-center justify-center mx-auto text-[#9ca3af]">
            {activeTab === 'saved' ? (
              <Bookmark className="w-6 h-6 text-[#3ecf8e]" />
            ) : activeTab === 'archived' ? (
              <Archive className="w-6 h-6 text-amber-400" />
            ) : (
              <Suitcase className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-semibold font-heading text-white">
              {activeTab === 'saved'
                ? 'No saved roles yet'
                : activeTab === 'archived'
                ? 'No archived roles'
                : 'No matching jobs found'}
            </h3>
            <p className="text-xs text-[#9ca3af] leading-relaxed max-w-sm mx-auto font-sans">
              {activeTab === 'saved'
                ? 'Swipe left or click the bookmark button on any job card to save it for later inspection.'
                : activeTab === 'archived'
                ? 'Swipe right or click archive on stale or uninteresting postings to hide them from your active feed.'
                : 'Try clearing your location or salary filters, or run the parsing pipeline to promote newly ingested postings.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] text-xs font-sans text-white transition-colors"
              >
                <Filter className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Reset Filters</span>
              </button>
            )}

            <Link
              href="/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ecf8e]/15 hover:bg-[#3ecf8e]/25 border border-[#3ecf8e]/30 text-xs font-sans font-medium text-[#3ecf8e] transition-colors"
            >
              <RefreshDouble className="w-3.5 h-3.5" />
              <span>Run Pipeline</span>
            </Link>
          </div>
        </div>
      )}

      {/* Concise Table List View */}
      {!isLoading && displayedJobs.length > 0 && (
        <div className="rounded-xl border border-[#262626] bg-[#131313] overflow-hidden shadow-sm">
          {/* Table Header Row (Desktop) */}
          <div className="hidden sm:flex items-center justify-between px-4 py-2.5 bg-[#181818] border-b border-[#262626] text-[11px] font-sans text-[#9ca3af]">
            <div className="flex items-center gap-6 flex-1">
              <span className="w-4"></span>
              <span>Role Title & Employer</span>
            </div>
            <div className="flex items-center gap-8 text-right">
              <span>Annual Pay</span>
              <span>Experience</span>
              <span className="w-16">Source</span>
              <span className="w-20 text-center">Actions</span>
            </div>
          </div>

          {/* Job Rows */}
          <div>
            {displayedJobs.map((job) => (
              <CompactJobRow
                key={job.id}
                job={job}
                isSaved={savedIds.has(job.id)}
                isArchived={archivedIds.has(job.id)}
                onToggleSave={handleToggleSave}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onDelete={handleDelete}
                onViewFullModal={handleOpenModal}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full Description Inspection Modal */}
      <JobDescriptionModal
        job={selectedJob}
        isOpen={isDrawerOpen}
        onClose={handleCloseModal}
      />
      </div>
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
