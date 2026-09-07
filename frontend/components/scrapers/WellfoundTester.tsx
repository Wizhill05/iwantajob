'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Refresh,
  Filter,
  NavArrowDown,
  NavArrowUp,
  Search,
  MapPin,
  Xmark,
  Page,
  Code,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import type { JobItem, WellfoundSlugItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface WellfoundTesterProps {
  onResults: (items: JobItem[], rawPayload: any, latencyMs: number) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
  viewMode?: 'cards' | 'json';
  onViewModeChange?: (mode: 'cards' | 'json') => void;
  resultsCount?: number;
}

const DEFAULT_ROLES: WellfoundSlugItem[] = [
  { slug: 'ai-engineer', name: 'AI Engineer' },
  { slug: 'software-engineer', name: 'Software Engineer' },
  { slug: 'frontend-engineer', name: 'Frontend Engineer' },
  { slug: 'backend-engineer', name: 'Backend Engineer' },
  { slug: 'full-stack-engineer', name: 'Full Stack Engineer' },
  { slug: 'machine-learning-engineer', name: 'Machine Learning Engineer' },
  { slug: 'data-scientist', name: 'Data Scientist' },
  { slug: 'devops-engineer', name: 'DevOps Engineer' },
  { slug: 'mobile-engineer', name: 'Mobile Engineer' },
  { slug: 'product-manager', name: 'Product Manager' },
];

const DEFAULT_LOCATIONS: WellfoundSlugItem[] = [
  { slug: 'india', name: 'India' },
  { slug: 'bangalore', name: 'Bengaluru' },
  { slug: 'delhi', name: 'Delhi' },
  { slug: 'mumbai', name: 'Mumbai' },
  { slug: 'pune', name: 'Pune' },
  { slug: 'hyderabad', name: 'Hyderabad' },
  { slug: 'remote', name: 'Remote' },
];

export function WellfoundTester({
  onResults,
  onError,
  onLoadingChange,
  viewMode = 'cards',
  onViewModeChange,
  resultsCount = 0,
}: WellfoundTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Canonical options fetched dynamically
  const [roles, setRoles] = useState<WellfoundSlugItem[]>(DEFAULT_ROLES);
  const [locations, setLocations] = useState<WellfoundSlugItem[]>(DEFAULT_LOCATIONS);

  // Primary parameter states (empty by default on load)
  const [roleSlug, setRoleSlug] = useState('');
  const [locationSlug, setLocationSlug] = useState('');

  // Dropdown suggestions states
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);
  const locRef = useRef<HTMLDivElement>(null);

  // Secondary parameter states (inside Filters drawer)
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [maxAgeDays, setMaxAgeDays] = useState<string>('');
  const [includeAllCompanyJobs, setIncludeAllCompanyJobs] = useState<boolean>(false);
  const [persist, setPersist] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Status states
  const [loading, setLoading] = useState(false);

  // Load canonical slugs from backend on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchSlugs() {
      try {
        const data = await api.getWellfoundRoles();
        if (isMounted) {
          if (Array.isArray(data.roles) && data.roles.length > 0) {
            setRoles(data.roles);
          }
          if (Array.isArray(data.locations) && data.locations.length > 0) {
            setLocations(data.locations);
          }
        }
      } catch {
        // Retain default lists on error
      }
    }
    fetchSlugs();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(event.target as Node)) {
        setShowRoleSuggestions(false);
      }
      if (locRef.current && !locRef.current.contains(event.target as Node)) {
        setShowLocSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPageExceeded = page > 20;

  const activeAdvancedFilterCount =
    (page > 1 ? 1 : 0) +
    (limit !== 10 ? 1 : 0) +
    (maxAgeDays !== '' ? 1 : 0) +
    (includeAllCompanyJobs ? 1 : 0) +
    (persist ? 1 : 0);

  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(roleSlug.toLowerCase().trim()) ||
      r.slug.toLowerCase().includes(roleSlug.toLowerCase().trim())
  );

  const filteredLocations = locations.filter(
    (l) =>
      l.name.toLowerCase().includes(locationSlug.toLowerCase().trim()) ||
      l.slug.toLowerCase().includes(locationSlug.toLowerCase().trim())
  );

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const chosenRole = roleSlug.trim();
    const chosenLocation = locationSlug.trim();

    if (!chosenRole || !chosenLocation) {
      onError('Please enter both role and location to search');
      return;
    }

    const clampedPage = Math.min(Math.max(1, page), 20);
    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams: Record<string, any> = {
      role: chosenRole,
      location: chosenLocation,
      page: clampedPage,
      limit: clampedLimit,
      include_all_company_jobs: includeAllCompanyJobs,
      persist,
    };
    if (maxAgeDays) {
      queryParams.max_age_days = parseInt(maxAgeDays);
    }

    setLoading(true);
    onLoadingChange(true);

    const procId = startProcess('scrape', 'wellfound', queryParams);
    const startTime = performance.now();

    try {
      const items = await api.scrapeWellfound(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      finishProcess(
        procId,
        'completed',
        `Fetched ${items.length} Wellfound jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(items, items, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const errMessage = err?.message || 'Failed to scrape Wellfound';
      finishProcess(procId, 'failed', errMessage);
      onError(errMessage);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-3 font-sans">
      <form onSubmit={handleRun} className="space-y-3 w-full min-w-0">
        {/* Main Toolbar: Two side-by-side search bars + Filter Toggle + Run Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0">
          {/* Search Bar 1: Role */}
          <div ref={roleRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={roleSlug}
              onChange={(e) => {
                setRoleSlug(e.target.value);
                setShowRoleSuggestions(true);
              }}
              onFocus={() => setShowRoleSuggestions(true)}
              placeholder="Role (e.g. AI Engineer)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            />
            {roleSlug && (
              <button
                type="button"
                onClick={() => setRoleSlug('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b7280] hover:text-white"
              >
                <Xmark className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showRoleSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#181818] border border-[#262626] rounded-lg shadow-2xl overflow-hidden divide-y divide-[#222222] max-h-52 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-sans text-[#6b7280] bg-[#141414]">
                  Wellfound Roles
                </div>
                {(filteredRoles.length > 0 ? filteredRoles : roles).map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => {
                      setRoleSlug(r.slug);
                      setShowRoleSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#d1d5db] hover:text-white hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <span>{r.name}</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">{r.slug}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar 2: Location */}
          <div ref={locRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <MapPin className="w-4 h-4 text-[#3ecf8e]" />
            </div>
            <input
              type="text"
              value={locationSlug}
              onChange={(e) => {
                setLocationSlug(e.target.value);
                setShowLocSuggestions(true);
              }}
              onFocus={() => setShowLocSuggestions(true)}
              placeholder="Location (e.g. India, Bangalore)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            />
            {locationSlug && (
              <button
                type="button"
                onClick={() => setLocationSlug('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b7280] hover:text-white"
              >
                <Xmark className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showLocSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#181818] border border-[#262626] rounded-lg shadow-2xl overflow-hidden divide-y divide-[#222222] max-h-52 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-sans text-[#6b7280] bg-[#141414]">
                  Wellfound Locations
                </div>
                {(filteredLocations.length > 0 ? filteredLocations : locations).map((l) => (
                  <button
                    key={l.slug}
                    type="button"
                    onClick={() => {
                      setLocationSlug(l.slug);
                      setShowLocSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#d1d5db] hover:text-white hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <span>{l.name}</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">{l.slug}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Row on Mobile, Inline on Desktop */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial shrink-0">
            {/* Filters Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-sans font-medium transition-all shrink-0',
                isFilterOpen
                  ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/40 text-[#3ecf8e]'
                  : activeAdvancedFilterCount > 0
                  ? 'bg-[#202020] border-[#3ecf8e]/40 text-white'
                  : 'bg-[#181818] hover:bg-[#202020] border-[#262626] text-[#9ca3af] hover:text-white'
              )}
            >
              <Filter className={cn('w-3.5 h-3.5', activeAdvancedFilterCount > 0 ? 'text-[#3ecf8e]' : '')} />
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3ecf8e] text-[#131313] font-mono text-[10px] font-bold flex items-center justify-center">
                  {activeAdvancedFilterCount}
                </span>
              )}
              {isFilterOpen ? (
                <NavArrowUp className="w-3.5 h-3.5 text-[#3ecf8e]" />
              ) : (
                <NavArrowDown className="w-3.5 h-3.5 text-[#6b7280]" />
              )}
            </button>

            {/* Run Button - Expands across remaining width */}
            <button
              type="submit"
              disabled={loading || !roleSlug.trim() || !locationSlug.trim()}
              className={cn(
                'flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-xs font-sans font-semibold transition-all flex-1 sm:flex-initial min-w-[80px] select-none shadow-sm',
                loading || !roleSlug.trim() || !locationSlug.trim()
                  ? 'bg-[#202020] border border-[#262626] text-[#6b7280] opacity-40 cursor-not-allowed'
                  : 'bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-[#131313] active:scale-[0.98]'
              )}
            >
              {loading ? (
                <>
                  <Refresh className="w-3.5 h-3.5 animate-spin text-[#131313]" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run</span>
                </>
              )}
            </button>

            {/* Boxy Cards / JSON Toggle (Icon-only) */}
            {onViewModeChange && (
              <div className="flex items-center p-0.5 rounded-lg bg-[#181818] border border-[#262626] shrink-0">
                <button
                  type="button"
                  onClick={() => onViewModeChange('cards')}
                  title={`Cards View${resultsCount > 0 ? ` (${resultsCount})` : ''}`}
                  className={cn(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'cards'
                      ? 'bg-[#262626] text-[#3ecf8e] shadow-sm'
                      : 'text-[#6b7280] hover:text-white'
                  )}
                >
                  <Page className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange('json')}
                  title="Raw JSON View"
                  className={cn(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'json'
                      ? 'bg-[#262626] text-[#3ecf8e] shadow-sm'
                      : 'text-[#6b7280] hover:text-white'
                  )}
                >
                  <Code className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expandable Advanced Filters Drawer (Matching JobsFilterBar) */}
        {isFilterOpen && (
          <div className="bg-[#181818] border border-[#262626] rounded-lg p-3.5 sm:p-4 space-y-3.5 animate-in fade-in-50 slide-in-from-top-1 duration-150 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <span className="font-semibold text-white">Filter Parameters</span>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="text-xs text-[#3ecf8e] hover:underline"
              >
                Done
              </button>
            </div>

            {/* 2-Column Grid on Mobile and Desktop */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-[#9ca3af]">
                    Page (1 – 20)
                  </label>
                  {isPageExceeded && (
                    <span className="text-[10px] text-amber-400">
                      Max 20
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={page}
                  onChange={(e) => setPage(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Limit (1 – 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Max Age (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={maxAgeDays}
                  onChange={(e) => setMaxAgeDays(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none"
                />
              </div>
            </div>

            {/* Row 2: Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#262626]">
              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141414] border border-[#262626] cursor-pointer hover:border-[#383838]">
                <span className="text-xs text-white">Include All Company Jobs</span>
                <input
                  type="checkbox"
                  checked={includeAllCompanyJobs}
                  onChange={(e) => setIncludeAllCompanyJobs(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#3ecf8e]"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141414] border border-[#262626] cursor-pointer hover:border-[#383838]">
                <span className="text-xs text-white">Save to Bronze Database</span>
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#3ecf8e]"
                />
              </label>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default WellfoundTester;
