'use client';

import React, { useState } from 'react';
import {
  Play,
  Timer,
  CheckCircle,
  WarningTriangle,
  RefreshDouble,
  Database,
  Filter,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import type { JobItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LinkedInTesterProps {
  onResults: (items: JobItem[], rawPayload: any, latencyMs: number) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function LinkedInTester({
  onResults,
  onError,
  onLoadingChange,
}: LinkedInTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Parameter states
  const [keywords, setKeywords] = useState('software engineer');
  const [location, setLocation] = useState('India');
  const [start, setStart] = useState<number>(0);
  const [limit, setLimit] = useState<number>(10);
  const [timeRange, setTimeRange] = useState<string>('');
  const [workType, setWorkType] = useState<string>('');
  const [seniority, setSeniority] = useState<string>('');
  const [fetchDescriptions, setFetchDescriptions] = useState<boolean>(true);
  const [persist, setPersist] = useState<boolean>(false);

  // Status & benchmark states
  const [loading, setLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const handleStartChange = (val: number) => {
    setStart(Math.max(0, val));
  };

  const isStartExceeded = start > 975;

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const clampedStart = Math.min(Math.max(0, start), 975);
    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams: Record<string, any> = {
      keywords: keywords.trim(),
      location: location.trim(),
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
    setStatus('running');

    const procId = startProcess('scrape', 'linkedin', queryParams);
    const startTime = performance.now();

    try {
      const items = await api.scrapeLinkedIn(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      setLatencyMs(elapsed);
      setItemCount(items.length);
      setStatus('success');

      finishProcess(
        procId,
        'completed',
        `Fetched ${items.length} LinkedIn jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(items, items, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatus('error');
      const errMessage = err?.message || 'Failed to scrape LinkedIn';
      finishProcess(procId, 'failed', errMessage);
      onError(errMessage);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="-mx-4 sm:mx-0 border-y sm:border sm:rounded-lg bg-[#181818] border-[#262626] p-4 sm:p-5 space-y-4">
      {/* Top Banner / Engine Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold font-heading text-white">
              LinkedIn Guest API Engine
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-sans font-medium rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400">
              TLS Fingerprinted
            </span>
          </div>
          <p className="text-xs text-[#9ca3af] mt-0.5 font-sans">
            Public guest endpoints with auto-retry and residential user-agent rotation.
          </p>
        </div>

        {/* Execution Metrics Badge */}
        <div className="flex items-center gap-2 text-xs font-sans">
          {latencyMs !== null && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-[#9ca3af]">
              <Timer className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span className="font-mono">{latencyMs}ms</span>
            </span>
          )}

          {itemCount !== null && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-white">
              <CheckCircle className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span><span className="font-mono">{itemCount}</span> jobs</span>
            </span>
          )}

          {status === 'running' && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 animate-pulse">
              <RefreshDouble className="w-3.5 h-3.5 animate-spin" />
              <span>Querying...</span>
            </span>
          )}
        </div>
      </div>

      {/* Parameter Form */}
      <form onSubmit={handleRun} className="space-y-4 font-sans">
        {/* Row 1: Keywords and Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. software engineer"
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white placeholder-[#6b7280] outline-none transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. India or Bengaluru"
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white placeholder-[#6b7280] outline-none transition-colors"
              required
            />
          </div>
        </div>

        {/* Row 2: Start offset and Limit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[#9ca3af] font-sans">
                Start Offset (0 – 975)
              </label>
              {isStartExceeded && (
                <span className="flex items-center gap-1 text-[10px] font-sans text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  <WarningTriangle className="w-3 h-3" />
                  Capped at 975 by LinkedIn
                </span>
              )}
            </div>
            <input
              type="number"
              min={0}
              max={975}
              value={start}
              onChange={(e) => handleStartChange(parseInt(e.target.value) || 0)}
              className={cn(
                'w-full px-3 py-2 rounded-lg bg-[#131313] border text-xs font-mono text-white outline-none transition-colors',
                isStartExceeded
                  ? 'border-amber-500/50 focus:border-amber-500'
                  : 'border-[#262626] focus:border-[#3ecf8e]'
              )}
            />
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Limit (1 – 100)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none transition-colors"
            />
          </div>
        </div>

        {/* Row 3: Dropdowns (Time range, Workplace, Seniority) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white outline-none transition-colors"
            >
              <option value="">Any time</option>
              <option value="r86400">Past 24 Hours (r86400)</option>
              <option value="r604800">Past Week (r604800)</option>
              <option value="r2592000">Past Month (r2592000)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Workplace Setting
            </label>
            <select
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white outline-none transition-colors"
            >
              <option value="">Any setting</option>
              <option value="1">On-site (1)</option>
              <option value="2">Remote (2)</option>
              <option value="3">Hybrid (3)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Seniority Level
            </label>
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white outline-none transition-colors"
            >
              <option value="">Any seniority</option>
              <option value="1">Internship (1)</option>
              <option value="2">Entry Level (2)</option>
              <option value="3">Associate (3)</option>
              <option value="4">Mid-Senior (4)</option>
              <option value="5">Director (5)</option>
            </select>
          </div>
        </div>

        {/* Row 4: Toggles (Fetch descriptions & Persist) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#262626]">
          {/* Fetch Descriptions Toggle */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-[#131313] border border-[#262626] cursor-pointer hover:border-[#383838] transition-all">
            <div>
              <div className="text-xs font-sans font-medium text-white">
                Fetch Job Descriptions
              </div>
              <div className="text-[11px] font-sans text-[#9ca3af]">
                Extract full description text from jobPosting endpoint
              </div>
            </div>
            <input
              type="checkbox"
              checked={fetchDescriptions}
              onChange={(e) => setFetchDescriptions(e.target.checked)}
              className="w-4 h-4 rounded border-[#262626] bg-[#202020] text-[#3ecf8e] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#3ecf8e]"
            />
          </label>

          {/* Persist to Bronze DB Toggle */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-[#131313] border border-[#262626] cursor-pointer hover:border-[#383838] transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-sans font-medium text-white">
                <Database className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Persist to Bronze DB</span>
              </div>
              <div className="text-[11px] font-sans text-[#9ca3af]">
                Save raw payloads to raw_linkedin_jobs table
              </div>
            </div>
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
              className="w-4 h-4 rounded border-[#262626] bg-[#202020] text-[#3ecf8e] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#3ecf8e]"
            />
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-sans font-semibold transition-all',
              loading
                ? 'bg-[#202020] border border-[#262626] text-[#6b7280] cursor-not-allowed'
                : 'bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-[#131313]'
            )}
          >
            {loading ? (
              <>
                <RefreshDouble className="w-4 h-4 animate-spin text-[#3ecf8e]" />
                <span>Scraping LinkedIn...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run LinkedIn Scraper</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LinkedInTester;
