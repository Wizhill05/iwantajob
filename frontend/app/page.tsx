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
    <div className="relative animate-in fade-in duration-300">
      {/* Scroll-Reactive Centered Dynamic Hero */}
      <PageHero />

      {/* Main Content Pane Starting After Half Page with Clean Pull-Up Overlay */}
      <div className="relative z-10 -mt-8 pt-4 bg-transparent min-h-[60vh]">
        {/* Subtle Horizontal Divider Separating Hero and Metrics */}
        <div className="px-6 sm:px-16 md:px-24 py-3 flex items-center justify-center">
          <div className="h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-[#2a2a2a] to-transparent" />
        </div>

        {/* Unboxed KPI + Rounded Provider Pills */}
        <div className="space-y-4">
          {/* KPI Grid (Borderless text metrics) */}
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

          {/* Scraper Provider Engine Cards (3 Separate Rounded Pills) */}
          <section aria-label="Providers">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
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
        </div>

      <div className="mt-6 space-y-6">
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
      </div>
      </div>
    </div>
  );
}
