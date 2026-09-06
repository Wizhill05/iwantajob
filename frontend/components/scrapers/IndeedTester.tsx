'use client';

import React, { useState } from 'react';
import {
  Play,
  Timer,
  CheckCircle,
  RefreshDouble,
  Database,
  Search,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import type { JobItem, JobSearchResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IndeedTesterProps {
  onResults: (items: JobItem[], rawPayload: any, latencyMs: number) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function IndeedTester({
  onResults,
  onError,
  onLoadingChange,
}: IndeedTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Parameter states
  const [what, setWhat] = useState('ai engineer');
  const [where, setWhere] = useState('India');
  const [limit, setLimit] = useState<number>(10);
  const [sort, setSort] = useState<'relevance' | 'date'>('relevance');
  const [persist, setPersist] = useState<boolean>(false);

  // Status & benchmark states
  const [loading, setLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams = {
      what: what.trim(),
      where: where.trim(),
      limit: clampedLimit,
      sort,
      persist,
    };

    setLoading(true);
    onLoadingChange(true);
    setStatus('running');

    const procId = startProcess('scrape', 'indeed', queryParams);
    const startTime = performance.now();

    try {
      const res: JobSearchResponse = await api.scrapeIndeed(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      setLatencyMs(elapsed);
      setItemCount(res.items.length);
      setTotalAvailable(res.total_count);
      setStatus('success');

      finishProcess(
        procId,
        'completed',
        `Fetched ${res.items.length} Indeed jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(res.items, res, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatus('error');
      const errMessage = err?.message || 'Failed to scrape Indeed';
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
              Indeed Mobile GraphQL Gateway
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-sans font-medium rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400">
              apis.indeed.com/graphql
            </span>
          </div>
          <p className="text-xs text-[#9ca3af] mt-0.5 font-sans">
            Native mobile app GraphQL schema with cursor pagination and easy-apply detection.
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
              {totalAvailable !== null && (
                <span className="text-[#9ca3af] text-[10px]">
                  of <span className="font-mono">{totalAvailable.toLocaleString()}</span>
                </span>
              )}
            </span>
          )}

          {status === 'running' && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 animate-pulse">
              <RefreshDouble className="w-3.5 h-3.5 animate-spin" />
              <span>Querying...</span>
            </span>
          )}
        </div>
      </div>

      {/* Parameter Form */}
      <form onSubmit={handleRun} className="space-y-4 font-sans">
        {/* Row 1: What and Where */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              What (Job Title or Keywords)
            </label>
            <input
              type="text"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="e.g. ai engineer or python"
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white placeholder-[#6b7280] outline-none transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Where (Location or City)
            </label>
            <input
              type="text"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="e.g. India or Bengaluru"
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white placeholder-[#6b7280] outline-none transition-colors"
              required
            />
          </div>
        </div>

        {/* Row 2: Limit and Sort */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div>
            <label className="block text-xs text-[#9ca3af] mb-1.5 font-sans">
              Sort Order
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'relevance' | 'date')}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-sans text-white outline-none transition-colors"
            >
              <option value="relevance">Relevance (Indeed ranking)</option>
              <option value="date">Date (Newest first)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Persist Toggle */}
        <div className="pt-2 border-t border-[#262626]">
          <label className="flex items-center justify-between p-3 rounded-lg bg-[#131313] border border-[#262626] cursor-pointer hover:border-[#383838] transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-sans font-medium text-white">
                <Database className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Persist to Bronze DB</span>
              </div>
              <div className="text-[11px] font-sans text-[#9ca3af]">
                Save unmodified GraphQL items to raw_indeed_jobs table
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
                <span>Scraping Indeed...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Indeed Scraper</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default IndeedTester;
