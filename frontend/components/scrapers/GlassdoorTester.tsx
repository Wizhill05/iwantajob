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
import type { JobItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface GlassdoorTesterProps {
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
  'AI Engineer Intern',
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

export function GlassdoorTester({
  onResults,
  onError,
  onLoadingChange,
  viewMode = 'cards',
  onViewModeChange,
  resultsCount = 0,
}: GlassdoorTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Primary parameter states (empty by default on load)
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');

  // Dropdown suggestions states
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);
  const locRef = useRef<HTMLDivElement>(null);

  // Secondary parameter states (inside Filters drawer)
  const [start, setStart] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [timeRange, setTimeRange] = useState<string>('');
  const [workType, setWorkType] = useState<string>('');
  const [seniority, setSeniority] = useState<string>('');
  const [fetchDescriptions, setFetchDescriptions] = useState<boolean>(true);
  const [persist, setPersist] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Status states
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
    (start > 0 ? 1 : 0) +
    (limit !== 10 ? 1 : 0) +
    (timeRange !== '' ? 1 : 0) +
    (workType !== '' ? 1 : 0) +
    (seniority !== '' ? 1 : 0) +
    (!fetchDescriptions ? 1 : 0) +
    (persist ? 1 : 0);

  const filteredRoles = ROLE_SUGGESTIONS.filter((r) =>
    r.toLowerCase().includes(keywords.toLowerCase().trim())
  );

  const filteredLocations = LOCATION_SUGGESTIONS.filter((l) =>
    l.toLowerCase().includes(location.toLowerCase().trim())
  );

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const queryKeywords = keywords.trim();
    const queryLocation = location.trim();

    if (!queryKeywords || !queryLocation) {
      onError('Please enter both role keywords and location to search');
      return;
    }

    const clampedStart = Math.min(Math.max(0, start), 975);
    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams: Record<string, any> = {
      keywords: queryKeywords,
      location: queryLocation,
      start: clampedStart,
      limit: clampedLimit,
      fetch_descriptions: fetchDescriptions,
      persist,
    };
    if (timeRange) queryParams.time_range = timeRange;
    if (workType) queryParams.work_type = workType;
    if (seniority) queryParams.seniority = seniority;

    setLoading(true);
    onLoadingChange(true);

    const procId = startProcess('scrape', 'glassdoor', queryParams);
    const startTime = performance.now();

    try {
      const items = await api.scrapeGlassdoor(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      finishProcess(
        procId,
        'completed',
        `Fetched ${items.length} Glassdoor jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(items, items, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const errMessage = err?.message || 'Failed to scrape Glassdoor';
      finishProcess(procId, 'failed', errMessage);
      onError(errMessage);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  const resetAll = () => {
    setKeywords('');
    setLocation('');
    setStart(0);
    setLimit(10);
    setTimeRange('');
    setWorkType('');
    setSeniority('');
    setFetchDescriptions(true);
    setPersist(false);
    setIsFilterOpen(false);
  };

  return (
    <div className="w-full min-w-0 space-y-3 font-sans">
      <form onSubmit={handleRun} className="space-y-3 w-full min-w-0">
        {/* Main Toolbar: Two side-by-side search bars + Filter Toggle + Run Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0">
          {/* Search Bar 1: Keywords / Role */}
          <div ref={roleRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={keywords}
              onChange={(e) => {
                setKeywords(e.target.value);
                setShowRoleSuggestions(true);
              }}
              onFocus={() => setShowRoleSuggestions(true)}
              placeholder="Role or skills (e.g. AI Engineer)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {keywords && (
              <button
                type="button"
                onClick={() => setKeywords('')}
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
                      setKeywords(r);
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

          {/* Search Bar 2: Location */}
          <div ref={locRef} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
              <MapPin className="w-4 h-4 text-emerald-400" />
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setShowLocSuggestions(true);
              }}
              onFocus={() => setShowLocSuggestions(true)}
              placeholder="Location (e.g. India, Bengaluru)..."
              className="w-full pl-9 pr-8 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {location && (
              <button
                type="button"
                onClick={() => setLocation('')}
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
                      setLocation(l);
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
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : activeAdvancedFilterCount > 0
                  ? 'bg-[#202020] border-emerald-500/40 text-white'
                  : 'bg-[#181818] hover:bg-[#202020] border-[#262626] text-[#9ca3af] hover:text-white'
              )}
            >
              <Filter className={cn('w-3.5 h-3.5', activeAdvancedFilterCount > 0 ? 'text-emerald-400' : '')} />
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[#131313] font-mono text-[10px] font-bold flex items-center justify-center">
                  {activeAdvancedFilterCount}
                </span>
              )}
              {isFilterOpen ? (
                <NavArrowUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <NavArrowDown className="w-3.5 h-3.5 text-[#6b7280]" />
              )}
            </button>

            {/* Run Button - Matches Indeed with Emerald accent */}
            <button
              type="submit"
              disabled={loading || !keywords.trim() || !location.trim()}
              className={cn(
                'flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-xs font-sans font-semibold transition-all flex-1 sm:flex-initial min-w-[80px] select-none shadow-sm',
                loading || !keywords.trim() || !location.trim()
                  ? 'bg-[#202020] border border-[#262626] text-[#6b7280] opacity-40 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98]'
              )}
            >
              {loading ? (
                <>
                  <Refresh className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run</span>
                </>
              )}
            </button>

            {/* Boxy Cards / JSON Toggle */}
            {onViewModeChange && (
              <div className="flex items-center p-0.5 rounded-lg bg-[#181818] border border-[#262626] shrink-0">
                <button
                  type="button"
                  onClick={() => onViewModeChange('cards')}
                  title={`Cards View${resultsCount > 0 ? ` (${resultsCount})` : ''}`}
                  className={cn(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'cards'
                      ? 'bg-[#262626] text-emerald-400 shadow-sm'
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
                      ? 'bg-[#262626] text-emerald-400 shadow-sm'
                      : 'text-[#6b7280] hover:text-white'
                  )}
                >
                  <Code className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expandable Advanced Filters Drawer (Matching IndeedTester) */}
        {isFilterOpen && (
          <div className="bg-[#181818] border border-[#262626] rounded-lg p-3.5 sm:p-4 space-y-3.5 animate-in fade-in-50 slide-in-from-top-1 duration-150 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <span className="font-semibold text-white">Filter Parameters</span>
              <button
                type="button"
                onClick={resetAll}
                className="text-[11px] text-[#6b7280] hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Refresh className="w-3 h-3" />
                <span>Reset to Defaults</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Batch Limit */}
              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Batch Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#141414] border border-[#262626] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Offset / Page */}
              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Start Offset (Page {Math.floor(start / 30) + 1})
                </label>
                <input
                  type="number"
                  min={0}
                  max={975}
                  step={30}
                  value={start}
                  onChange={(e) => setStart(Math.max(0, Math.min(975, parseInt(e.target.value) || 0)))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-[#141414] border border-[#262626] text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Freshness Age */}
              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Listing Age
                </label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-[#141414] border border-[#262626] text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Any Time</option>
                  <option value="1">Past 24 Hours</option>
                  <option value="7">Past 7 Days</option>
                  <option value="14">Past 14 Days</option>
                  <option value="30">Past Month</option>
                </select>
              </div>

              {/* Workplace Setting */}
              <div>
                <label className="block text-[11px] text-[#9ca3af] mb-1">
                  Workplace Setting
                </label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-[#141414] border border-[#262626] text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Settings</option>
                  <option value="1">On-site</option>
                  <option value="2">Remote</option>
                  <option value="3">Hybrid</option>
                </select>
              </div>
            </div>

            {/* Persistence & Details Toggle */}
            <div className="pt-2 border-t border-[#262626] flex items-center justify-between flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fetchDescriptions}
                  onChange={(e) => setFetchDescriptions(e.target.checked)}
                  className="rounded border-[#262626] bg-[#141414] text-emerald-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-xs text-[#d1d5db]">
                  Fetch Full Descriptions (LRU cached)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                  className="rounded border-[#262626] bg-[#141414] text-emerald-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-xs text-emerald-400 font-medium">
                  Persist to Bronze DB (raw_glassdoor_jobs)
                </span>
              </label>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default GlassdoorTester;
