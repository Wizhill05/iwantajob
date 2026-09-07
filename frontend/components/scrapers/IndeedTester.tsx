'use client';

import React, { useState, useRef, useEffect } from 'react';
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
import type { JobItem, JobSearchResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IndeedTesterProps {
  onResults: (items: JobItem[], rawPayload: any, latencyMs: number) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
  viewMode?: 'cards' | 'json';
  onViewModeChange?: (mode: 'cards' | 'json') => void;
  resultsCount?: number;
}

const ROLE_SUGGESTIONS = [
  'AI Engineer',
  'Software Engineer',
  'Frontend Engineer',
  'Backend Engineer',
  'Full Stack Engineer',
  'Machine Learning Engineer',
  'Data Scientist',
  'DevOps Engineer',
  'Python Developer',
  'Java Developer',
];

const LOCATION_SUGGESTIONS = [
  'India',
  'Bengaluru',
  'Delhi-NCR',
  'Mumbai',
  'Pune',
  'Hyderabad',
  'Chennai',
  'Gurugram',
  'Noida',
  'Remote',
];

export function IndeedTester({
  onResults,
  onError,
  onLoadingChange,
  viewMode = 'cards',
  onViewModeChange,
  resultsCount = 0,
}: IndeedTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Primary parameter states (empty by default on load)
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');

  // Dropdown suggestions states
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);
  const locRef = useRef<HTMLDivElement>(null);

  // Secondary parameter states (inside Filters drawer)
  const [limit, setLimit] = useState<number>(10);
  const [sort, setSort] = useState<'relevance' | 'date'>('relevance');
  const [persist, setPersist] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Status & benchmark states
  const [loading, setLoading] = useState(false);

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

  const activeAdvancedFilterCount =
    (limit !== 10 ? 1 : 0) +
    (sort !== 'relevance' ? 1 : 0) +
    (persist ? 1 : 0);

  const filteredRoles = ROLE_SUGGESTIONS.filter((r) =>
    r.toLowerCase().includes(what.toLowerCase().trim())
  );

  const filteredLocations = LOCATION_SUGGESTIONS.filter((l) =>
    l.toLowerCase().includes(where.toLowerCase().trim())
  );

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const queryWhat = what.trim();
    const queryWhere = where.trim();

    if (!queryWhat || !queryWhere) {
      onError('Please enter both role keywords and location to search');
      return;
    }

    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams = {
      what: queryWhat,
      where: queryWhere,
      limit: clampedLimit,
      sort,
      persist,
    };

    setLoading(true);
    onLoadingChange(true);

    const procId = startProcess('scrape', 'indeed', queryParams);
    const startTime = performance.now();

    try {
      const res: JobSearchResponse = await api.scrapeIndeed(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      finishProcess(
        procId,
        'completed',
        `Fetched ${res.items.length} Indeed jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(res.items, res, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const errMessage = err?.message || 'Failed to scrape Indeed';
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
          {/* Search Bar 1: What (Role / Keywords) */}
          <div ref={roleRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={what}
              onChange={(e) => {
                setWhat(e.target.value);
                setShowRoleSuggestions(true);
              }}
              onFocus={() => setShowRoleSuggestions(true)}
              placeholder="Role or skills (e.g. AI Engineer)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            />
            {what && (
              <button
                type="button"
                onClick={() => setWhat('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b7280] hover:text-white"
              >
                <Xmark className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showRoleSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#181818] border border-[#262626] rounded-lg shadow-2xl overflow-hidden divide-y divide-[#222222] max-h-52 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-sans text-[#6b7280] bg-[#141414]">
                  Suggested Roles
                </div>
                {(filteredRoles.length > 0 ? filteredRoles : ROLE_SUGGESTIONS).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setWhat(r);
                      setShowRoleSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#d1d5db] hover:text-white hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <span>{r}</span>
                    <span className="text-[10px] text-[#6b7280]">select</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar 2: Where (Location) */}
          <div ref={locRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <MapPin className="w-4 h-4 text-[#3ecf8e]" />
            </div>
            <input
              type="text"
              value={where}
              onChange={(e) => {
                setWhere(e.target.value);
                setShowLocSuggestions(true);
              }}
              onFocus={() => setShowLocSuggestions(true)}
              placeholder="Location (e.g. India, Bengaluru)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            />
            {where && (
              <button
                type="button"
                onClick={() => setWhere('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b7280] hover:text-white"
              >
                <Xmark className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showLocSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#181818] border border-[#262626] rounded-lg shadow-2xl overflow-hidden divide-y divide-[#222222] max-h-52 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-sans text-[#6b7280] bg-[#141414]">
                  Popular Locations
                </div>
                {(filteredLocations.length > 0 ? filteredLocations : LOCATION_SUGGESTIONS).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setWhere(l);
                      setShowLocSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-[#d1d5db] hover:text-white hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <span>{l}</span>
                    <span className="text-[10px] text-[#6b7280]">select</span>
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
              disabled={loading || !what.trim() || !where.trim()}
              className={cn(
                'flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-xs font-sans font-semibold transition-all flex-1 sm:flex-initial min-w-[80px] select-none shadow-sm',
                loading || !what.trim() || !where.trim()
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

              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Sort Order
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'relevance' | 'date')}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#141414] border border-[#262626] focus:border-[#3ecf8e] text-xs text-white outline-none"
                >
                  <option value="relevance">Relevance</option>
                  <option value="date">Date</option>
                </select>
              </div>
            </div>

            {/* Row 2: Persist Toggle */}
            <div className="pt-1 border-t border-[#262626]">
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

export default IndeedTester;
