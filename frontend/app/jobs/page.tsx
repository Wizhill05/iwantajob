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
  Check,
  Xmark,
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
import { DeleteConfirmModal } from '@/components/jobs/DeleteConfirmModal';
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
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Triage state (synchronized with localStorage)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Sliding pill state for triage tabs
  const tabRefs = React.useRef<{ [key in TriageTab]?: HTMLButtonElement | null }>({});
  const tabContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [tabPillStyle, setTabPillStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  useEffect(() => {
    const updateTabPill = () => {
      const activeEl = tabRefs.current[activeTab];
      const containerEl = tabContainerRef.current;
      if (activeEl && containerEl) {
        const activeRect = activeEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        // Exact offset relative to container's left edge
        setTabPillStyle({
          left: activeRect.left - containerRect.left,
          width: activeRect.width,
          opacity: 1,
        });
      }
    };
    updateTabPill();
    const handleResize = () => updateTabPill();
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(updateTabPill, 40);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [activeTab, jobs.length]);

  // Multi-selection state
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete Confirmation Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    jobIds: string[];
    isDeleting: boolean;
  }>({
    isOpen: false,
    jobIds: [],
    isDeleting: false,
  });

  // Load triage state from localStorage on client mount
  useEffect(() => {
    setSavedIds(triageStorage.getSavedIds());
    setArchivedIds(triageStorage.getArchivedIds());
    setDeletedIds(triageStorage.getDeletedIds());
  }, []);

  // Fetch clean jobs from /api/jobs/unified
  const fetchJobs = useCallback(
    async (showRefreshAnimation = false) => {
      if (showRefreshAnimation) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const params: UnifiedJobsQueryParams = {
        limit: 200,
        offset: 0,
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
    [filters]
  );

  // Trigger fetch when query filters change
  useEffect(() => {
    setCurrentPage(1);
    fetchJobs();
  }, [fetchJobs]);

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

  // Compute total pages based on current displayed list
  const totalPages = Math.max(1, Math.ceil(displayedJobs.length / PAGE_SIZE));

  // Auto-adjust page if deletions reduced the number of available pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Slice continuous page items from the active list
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return displayedJobs.slice(startIndex, startIndex + PAGE_SIZE);
  }, [displayedJobs, currentPage]);

  // Handle page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
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

  // Prompt Delete Confirmation Modal (single or batch)
  const handleDeleteRequest = (jobId: string) => {
    setDeleteModalState({
      isOpen: true,
      jobIds: [jobId],
      isDeleting: false,
    });
  };

  const handleBatchDeleteRequest = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleteModalState({
      isOpen: true,
      jobIds: ids,
      isDeleting: false,
    });
  };

  const handleConfirmDelete = async () => {
    const idsToDelete = deleteModalState.jobIds;
    if (idsToDelete.length === 0) return;

    setDeleteModalState((prev) => ({ ...prev, isDeleting: true }));

    try {
      // 1. Permanently delete from database
      await api.deleteUnifiedJobs(idsToDelete);

      // 2. Remove from local state
      setJobs((prev) => prev.filter((j) => !idsToDelete.includes(j.id)));

      // 3. Clear from local storage
      triageStorage.deleteMany(idsToDelete);
      setDeletedIds(triageStorage.getDeletedIds());
      setSavedIds(triageStorage.getSavedIds());
      setArchivedIds(triageStorage.getArchivedIds());

      // 4. Exit select mode & close modal
      handleCancelSelectMode();
      setDeleteModalState({ isOpen: false, jobIds: [], isDeleting: false });
    } catch (err: any) {
      setError(err?.message || 'Failed to delete job(s) from database.');
      setDeleteModalState((prev) => ({ ...prev, isDeleting: false }));
    }
  };

  const handleCancelDelete = () => {
    if (deleteModalState.isDeleting) return;
    setDeleteModalState({ isOpen: false, jobIds: [], isDeleting: false });
  };

  // Multi-Selection Handlers
  const handleStartSelectMode = (initialJobId?: string) => {
    setIsSelectMode(true);
    if (initialJobId) {
      setSelectedIds(new Set([initialJobId]));
    }
  };

  const handleToggleSelectJob = (jobId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
        if (next.size === 0) {
          setIsSelectMode(false);
        }
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedJobs.length && paginatedJobs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedJobs.map((j) => j.id)));
    }
  };

  const handleCancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchSave = () => {
    const ids = Array.from(selectedIds);
    triageStorage.saveMany(ids);
    setSavedIds(triageStorage.getSavedIds());
    setArchivedIds(triageStorage.getArchivedIds());
    handleCancelSelectMode();
  };

  const handleBatchArchiveOrRegister = () => {
    const ids = Array.from(selectedIds);
    if (activeTab === 'archived') {
      triageStorage.unarchiveMany(ids);
    } else {
      triageStorage.archiveMany(ids);
    }
    setArchivedIds(triageStorage.getArchivedIds());
    setSavedIds(triageStorage.getSavedIds());
    handleCancelSelectMode();
  };

  const handleBatchDelete = () => {
    handleBatchDeleteRequest();
  };

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
      <PageHero title="Jobs" />

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
      <div className="flex items-center justify-between gap-3 border-b border-[#262626] pb-3">
        <div
          ref={tabContainerRef}
          className="relative inline-flex items-center gap-1 rounded-full border border-[#2a2a2a] bg-[#181818]/95 backdrop-blur-xl p-1 shadow-lg select-none overflow-hidden"
        >
          {/* Animated Sliding Pill */}
          <div
            className={cn(
              "absolute top-1 bottom-1 left-0 rounded-full transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] pointer-events-none shadow-sm border",
              activeTab === 'archived'
                ? "bg-amber-400/15 border-amber-400/30"
                : "bg-[#3ecf8e]/15 border-[#3ecf8e]/30"
            )}
            style={{
              transform: `translateX(${tabPillStyle.left}px)`,
              width: `${tabPillStyle.width}px`,
              opacity: tabPillStyle.opacity,
            }}
          />

          {/* Active Tab */}
          <button
            type="button"
            ref={(el) => {
              tabRefs.current['active'] = el;
            }}
            onClick={() => setActiveTab('active')}
            aria-label={`Active roles (${tabCounts.active})`}
            title={`Active roles (${tabCounts.active})`}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-sans transition-colors duration-200',
              activeTab === 'active'
                ? 'text-[#3ecf8e] font-medium'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Suitcase className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span className="inline-flex items-center justify-center font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-[#111] text-[#9ca3af] leading-none">
              {tabCounts.active}
            </span>
          </button>

          {/* Saved Tab */}
          <button
            type="button"
            ref={(el) => {
              tabRefs.current['saved'] = el;
            }}
            onClick={() => setActiveTab('saved')}
            aria-label={`Saved roles (${tabCounts.saved})`}
            title={`Saved roles (${tabCounts.saved})`}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-sans transition-colors duration-200',
              activeTab === 'saved'
                ? 'text-[#3ecf8e] font-medium'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Bookmark className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span className="inline-flex items-center justify-center font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-[#111] text-[#3ecf8e] leading-none">
              {tabCounts.saved}
            </span>
          </button>

          {/* Archived Tab */}
          <button
            type="button"
            ref={(el) => {
              tabRefs.current['archived'] = el;
            }}
            onClick={() => setActiveTab('archived')}
            aria-label={`Archived roles (${tabCounts.archived})`}
            title={`Archived roles (${tabCounts.archived})`}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-sans transition-colors duration-200',
              activeTab === 'archived'
                ? 'text-amber-400 font-medium'
                : 'text-[#9ca3af] hover:text-white'
            )}
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span className="inline-flex items-center justify-center font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-[#111] text-amber-400 leading-none">
              {tabCounts.archived}
            </span>
          </button>
        </div>

        {/* Counter */}
        <div className="flex items-center gap-3 text-xs font-sans text-[#9ca3af] shrink-0">
          <span>
            Showing <strong className="font-mono text-white">{displayedJobs.length}</strong> roles
          </span>
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
              onClick={() => fetchJobs(true)}
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
        <div className="-mx-4 sm:mx-0 border-y sm:border sm:rounded-lg bg-[#181818] border-[#262626] p-8 md:p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-10 h-10 rounded-lg bg-[#202020] border border-[#262626] flex items-center justify-center mx-auto text-[#9ca3af]">
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

      {/* Sticky Multi-Selection Action Bar at the Top */}
      {isSelectMode && (
        <div className="sticky top-2 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-[#181818]/95 backdrop-blur-md border border-[#333] shadow-xl rounded-lg px-3 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs font-sans text-white">
            {/* Left: Count & Select All */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="px-2 py-0.5 rounded-full bg-[#3ecf8e]/20 text-[#3ecf8e] border border-[#3ecf8e]/30 font-semibold text-[11px]">
                  {selectedIds.size}
                </span>
                <span className="text-[#9ca3af] hidden sm:inline text-xs font-sans">selected</span>
              </div>

              <div className="h-3.5 w-px bg-[#333]" />

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[#9ca3af] hover:text-white transition-colors font-medium text-xs"
              >
                {selectedIds.size === displayedJobs.length && displayedJobs.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            {/* Right: Actions (Save, Archive/Registered, Delete, Cancel) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchSave}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#222222] hover:bg-[#3ecf8e]/20 border border-[#333] hover:border-[#3ecf8e]/40 text-[#d1d5db] hover:text-[#3ecf8e] transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs"
              >
                <Bookmark className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchArchiveOrRegister}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#222222] hover:bg-amber-500/20 border border-[#333] hover:border-amber-500/40 text-[#d1d5db] hover:text-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs"
              >
                {activeTab === 'archived' ? (
                  <>
                    <Undo className="w-3.5 h-3.5 text-amber-400" />
                    <span>Registered</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Archive</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs"
              >
                <Trash className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Delete</span>
              </button>

              <div className="h-3.5 w-px bg-[#333] mx-0.5" />

              <button
                type="button"
                onClick={handleCancelSelectMode}
                title="Cancel multi-selection"
                className="p-1.5 rounded-lg hover:bg-[#282828] text-[#9ca3af] hover:text-white transition-colors"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Width Unboxed Table List View Matching Overview Section */}
      {!isLoading && paginatedJobs.length > 0 && (
        <div className="-mx-4 sm:mx-0 border-y sm:border sm:rounded-lg border-[#262626] divide-y divide-[#262626] overflow-hidden">
          {/* Job Rows */}
          {paginatedJobs.map((job) => (
            <CompactJobRow
              key={job.id}
              job={job}
              isSaved={savedIds.has(job.id)}
              isArchived={archivedIds.has(job.id)}
              isExpanded={expandedJobId === job.id}
              onToggleExpand={(id) =>
                setExpandedJobId((prev) => (prev === id ? null : id))
              }
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(job.id)}
              onToggleSelect={handleToggleSelectJob}
              onLongPress={handleStartSelectMode}
              onToggleSave={handleToggleSave}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onDelete={handleDeleteRequest}
              onViewFullModal={handleOpenModal}
            />
          ))}
        </div>
      )}

      {/* Bottom Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-[#262626] text-xs font-sans text-[#9ca3af]">
          <span>
            Page <strong className="font-mono text-white">{currentPage}</strong> of{' '}
            <strong className="font-mono text-white">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              aria-label="Previous Page"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <NavArrowLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-mono px-2 text-white bg-[#181818] py-1 rounded border border-[#262626]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              aria-label="Next Page"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#181818] border border-[#262626] hover:border-[#383838] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <span>Next</span>
              <NavArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalState.isOpen}
        count={deleteModalState.jobIds.length}
        isDeleting={deleteModalState.isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

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
