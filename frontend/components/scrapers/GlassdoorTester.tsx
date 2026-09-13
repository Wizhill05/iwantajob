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
  'Mobile Engineer',
  'Product Manager',
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

  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');

  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);
  const locRef = useRef<HTMLDivElement>(null);

  const [start, setStart] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [timeRange, setTimeRange] = useState<string>('');
  const [workType, setWorkType] = useState<string>('');
  const [seniority, setSeniority] = useState<string>('');
  const [fetchDescriptions, setFetchDescriptions] = useState<boolean>(true);
  const [persist, setPersist] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);

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

  const handleStartChange = (val: number) => {
    setStart(Math.max(0, val));
  };

  const isStartExceeded = start > 975;

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
    <div className="rounded-xl border border-[#262626] bg-[#141414] p-5 shadow-2xl transition-all duration-200">
      <form onSubmit={handleRun} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-6 relative" ref={roleRef}>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#6b7280] pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={keywords}
                onChange={(e) => {
                  setKeywords(e.target.value);
                  setShowRoleSuggestions(true);
                }}
                onFocus={() => setShowRoleSuggestions(true)}
                placeholder="e.g. Software Engineer, AI Engineer..."
                className="w-full pl-10 pr-9 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-white placeholder-[#525252] focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all font-mono"
              />
              {keywords && (
                <button
                  type="button"
                  onClick={() => setKeywords('')}
                  className="absolute right-3 text-[#525252] hover:text-[#9ca3af] transition-colors"
                >
                  <Xmark className="w-4 h-4" />
                </button>
              )}
            </div>

            {showRoleSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#181818] shadow-2xl backdrop-blur-xl divide-y divide-[#222222]">
                {filteredRoles.length > 0 ? (
                  filteredRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setKeywords(role);
                        setShowRoleSuggestions(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-mono text-[#d1d5db] hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors flex items-center justify-between"
                    >
                      <span>{role}</span>
                      <span className="text-[10px] text-[#525252]">role</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3.5 py-2.5 text-xs text-[#6b7280] font-mono">
                    Press Enter to use custom query &quot;{keywords}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-4 relative" ref={locRef}>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#6b7280] pointer-events-none">
                <MapPin className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setShowLocSuggestions(true);
                }}
                onFocus={() => setShowLocSuggestions(true)}
                placeholder="e.g. India, Bengaluru, Pune..."
                className="w-full pl-10 pr-9 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-white placeholder-[#525252] focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all font-mono"
              />
              {location && (
                <button
                  type="button"
                  onClick={() => setLocation('')}
                  className="absolute right-3 text-[#525252] hover:text-[#9ca3af] transition-colors"
                >
                  <Xmark className="w-4 h-4" />
                </button>
              )}
            </div>

            {showLocSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#181818] shadow-2xl backdrop-blur-xl divide-y divide-[#222222]">
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => {
                        setLocation(loc);
                        setShowLocSuggestions(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-mono text-[#d1d5db] hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors flex items-center justify-between"
                    >
                      <span>{loc}</span>
                      <span className="text-[10px] text-[#525252]">location</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3.5 py-2.5 text-xs text-[#6b7280] font-mono">
                    Press Enter to use custom location &quot;{location}&quot;
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border text-xs font-heading font-medium transition-all select-none',
                isFilterOpen || activeAdvancedFilterCount > 0
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[#2a2a2a] bg-[#1a1a1a] text-[#9ca3af] hover:text-white hover:border-[#3a3a3a]'
              )}
              title="Toggle filter drawer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeAdvancedFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-black text-[10px] font-bold">
                  {activeAdvancedFilterCount}
                </span>
              )}
              {isFilterOpen ? (
                <NavArrowUp className="w-3 h-3" />
              ) : (
                <NavArrowDown className="w-3 h-3" />
              )}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-heading font-semibold shadow-lg shadow-emerald-950/40 transition-all select-none"
            >
              {loading ? (
                <Refresh className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{loading ? 'Fetching...' : 'Scrape'}</span>
            </button>
          </div>
        </div>

        {isFilterOpen && (
          <div className="mt-4 pt-4 border-t border-[#222222] rounded-lg bg-[#181818]/60 p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <span className="text-xs font-heading font-semibold text-[#e5e5e5] flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-400" />
                Advanced Glassdoor Parameters
              </span>
              <button
                type="button"
                onClick={resetAll}
                className="text-[11px] font-mono text-[#6b7280] hover:text-red-400 flex items-center gap-1 transition-colors"
              >
                <Refresh className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-mono text-[#9ca3af] mb-1.5">
                  Start Offset (Page: {Math.floor(start / 30) + 1})
                </label>
                <input
                  type="number"
                  min={0}
                  max={975}
                  step={30}
                  value={start}
                  onChange={(e) => handleStartChange(parseInt(e.target.value, 10) || 0)}
                  className={cn(
                    'w-full px-3 py-2 bg-[#141414] border rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 transition-all',
                    isStartExceeded
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                      : 'border-[#2e2e2e] focus:border-emerald-500/60 focus:ring-emerald-500/60'
                  )}
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#9ca3af] mb-1.5">
                  Batch Limit (1 – 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10) || 10)}
                  className="w-full px-3 py-2 bg-[#141414] border border-[#2e2e2e] rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#9ca3af] mb-1.5">
                  Freshness / Max Age
                </label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#141414] border border-[#2e2e2e] rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all"
                >
                  <option value="">Any Time</option>
                  <option value="1">Past 24 Hours</option>
                  <option value="7">Past Week</option>
                  <option value="14">Past 14 Days</option>
                  <option value="30">Past Month</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#9ca3af] mb-1.5">
                  Workplace Setting
                </label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#141414] border border-[#2e2e2e] rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all"
                >
                  <option value="">All Settings</option>
                  <option value="1">On-site</option>
                  <option value="2">Remote</option>
                  <option value="3">Hybrid</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#222222]">
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={fetchDescriptions}
                    onChange={(e) => setFetchDescriptions(e.target.checked)}
                    className="rounded border-[#333] bg-[#141414] text-emerald-500 focus:ring-emerald-500/30"
                  />
                  <span className="text-xs font-mono text-[#d1d5db]">
                    Fetch Full Descriptions (LRU Cached)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={persist}
                    onChange={(e) => setPersist(e.target.checked)}
                    className="rounded border-[#333] bg-[#141414] text-emerald-500 focus:ring-emerald-500/30"
                  />
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    Persist to Bronze DB (raw_glassdoor_jobs)
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {resultsCount > 0 && onViewModeChange && (
          <div className="flex items-center justify-between pt-2 border-t border-[#222222]">
            <span className="text-xs font-mono text-[#6b7280]">
              Showing {resultsCount} listings
            </span>
            <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-lg border border-[#2a2a2a]">
              <button
                type="button"
                onClick={() => onViewModeChange('cards')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-all',
                  viewMode === 'cards'
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-[#6b7280] hover:text-white'
                )}
              >
                <Page className="w-3.5 h-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('json')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono transition-all',
                  viewMode === 'json'
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-[#6b7280] hover:text-white'
                )}
              >
                <Code className="w-3.5 h-3.5" />
                JSON
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
