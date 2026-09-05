'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Refresh,
  Cpu,
  RefreshDouble,
  Suitcase,
  WarningTriangle,
  ArrowRight,
  Database,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type { ParsingStatus } from '@/lib/types';
import { KpiGrid } from '@/components/overview/KpiGrid';
import { ProviderCard } from '@/components/overview/ProviderCard';
import { ActiveProcessesList } from '@/components/overview/ActiveProcessesList';
import { RecentActivityLog } from '@/components/overview/RecentActivityLog';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const [parsingStatus, setParsingStatus] = useState<ParsingStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    const start = performance.now();
    try {
      const data = await api.getParsingStatus();
      setParsingStatus(data);
      setLatencyMs(Math.round(performance.now() - start));
      setIsOnline(true);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      setIsOnline(false);
      setError(err?.message || 'Failed to fetch status from FastAPI backend.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(true);

    // Auto-poll parsing status every 10 seconds
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 10000);

    // Listen for custom platform:refresh event from TopHeader
    const handlePlatformRefresh = () => {
      fetchStatus(false);
    };
    window.addEventListener('platform:refresh', handlePlatformRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('platform:refresh', handlePlatformRefresh);
    };
  }, [fetchStatus]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Overview Top Header & Action Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#3ecf8e] uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e]"></span>
            <span>Platform Overview</span>
          </div>
          <h1 className="text-2xl font-bold font-heading text-white tracking-tight">
            Job Ingestion & Parsing Platform
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#9ca3af]">
            Decoupled Bronze-to-Silver staging architecture with deterministic pay and experience normalization.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {lastUpdated && (
            <span className="text-[11px] font-mono text-[#6b7280] hidden xl:inline">
              Updated {lastUpdated.toLocaleTimeString([], { hour12: false })}
            </span>
          )}

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={() => fetchStatus(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#202020] text-xs font-mono text-[#9ca3af] hover:text-white transition-all disabled:opacity-50"
            title="Refresh status now"
          >
            <Refresh
              className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')}
            />
            <span>Refresh</span>
          </button>

          {/* Quick Navigation Links */}
          <Link
            href="/scrapers"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#202020] text-xs font-mono text-white transition-all hover:border-[#383838]"
          >
            <Cpu className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Scraper Lab</span>
          </Link>

          <Link
            href="/pipeline"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/20 text-xs font-mono text-[#3ecf8e] transition-all"
          >
            <RefreshDouble className="w-3.5 h-3.5" />
            <span>Pipeline</span>
          </Link>
        </div>
      </div>

      {/* Backend Connection Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs font-mono text-rose-400">
          <WarningTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{error} Backend may be offline at http://localhost:8020.</span>
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium underline self-start sm:self-auto"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* KPI Grid (4 Metrics Cards) */}
      <section aria-labelledby="kpi-section-title">
        <h2 id="kpi-section-title" className="sr-only">
          Platform Key Performance Indicators
        </h2>
        <KpiGrid
          status={parsingStatus}
          isLoading={isLoading}
          latencyMs={latencyMs}
          isOnline={isOnline}
        />
      </section>

      {/* Scraper Provider Engine Cards */}
      <section aria-labelledby="providers-section-title">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3ecf8e]" />
            <h2
              id="providers-section-title"
              className="text-sm font-semibold font-heading text-white"
            >
              Bronze Scraper Engines & Staging Backlog
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#6b7280]">
            Lossless Raw Stores
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <ProviderCard
            provider="indeed"
            stats={parsingStatus?.indeed}
            isLoading={isLoading}
          />
          <ProviderCard
            provider="linkedin"
            stats={parsingStatus?.linkedin}
            isLoading={isLoading}
          />
          <ProviderCard
            provider="wellfound"
            stats={parsingStatus?.wellfound}
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* Live Operational Grid: Active Processes & Recent Activity */}
      <section aria-labelledby="activity-section-title">
        <h2 id="activity-section-title" className="sr-only">
          Live Execution & Activity Logs
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Processes Monitor (1 Col) */}
          <div className="lg:col-span-1">
            <ActiveProcessesList />
          </div>

          {/* Recent Activity Log Stream (2 Cols) */}
          <div className="lg:col-span-2">
            <RecentActivityLog />
          </div>
        </div>
      </section>

      {/* Silver Tier Repository CTA Banner */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-[#181818] via-[#1c1c1c] to-[#181818] border border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/20 flex items-center justify-center text-[#3ecf8e] shrink-0">
            <Suitcase className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-heading text-white">
              Silver Unified Job Repository
            </h3>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              Explore {parsingStatus?.unified_total || 0} parsed, validated jobs with normalized annual INR salaries and experience bounds.
            </p>
          </div>
        </div>

        <Link
          href="/jobs"
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-xs font-mono font-semibold text-[#131313] transition-all shrink-0"
        >
          <span>Explore Unified Jobs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
