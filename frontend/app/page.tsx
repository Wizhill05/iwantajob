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
import { PageHero } from '@/components/layout/PageHero';
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
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Centered Dynamic Hero */}
      <PageHero />

      {/* KPI Grid */}
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
          <span className="text-[11px] font-sans text-[#6b7280]">
            Lossless Raw Stores
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-4 lg:gap-5 divide-y md:divide-y-0 divide-[#262626] border-y md:border-y-0 border-[#262626] md:rounded-xl">
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
              Explore <span className="font-mono">{parsingStatus?.unified_total || 0}</span> parsed, validated jobs with normalized annual INR salaries and experience bounds.
            </p>
          </div>
        </div>

        <Link
          href="/jobs"
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-xs font-sans font-semibold text-[#131313] transition-all shrink-0"
        >
          <span>Explore Unified Jobs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
