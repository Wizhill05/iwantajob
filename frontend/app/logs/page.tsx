'use client';

import React, { useState, useCallback } from 'react';
import {
  Terminal,
  Activity,
  Refresh,
  Database,
  Server,
  CheckCircle,
} from 'iconoir-react';
import { LogsTerminalView } from '@/components/logs/LogsTerminalView';
import { DbStatsTable } from '@/components/logs/DbStatsTable';
import { ActiveProcessesList } from '@/components/overview/ActiveProcessesList';
import { PageHero } from '@/components/layout/PageHero';
import { cn } from '@/lib/utils';

export default function SystemLogsPage() {
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [autoPollInterval, setAutoPollInterval] = useState<number>(10000); // 10s default
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, []);

  return (
    <div className="relative pb-24 lg:pb-12 max-w-7xl mx-auto">
      {/* Centered Dynamic Hero */}
      <PageHero />

      {/* Main Content Pane Starting After Half Viewport */}
      <div className="relative z-10 -mt-8 pt-4 space-y-6 bg-[#131313] min-h-[60vh]">
        {/* Action Controls: Auto-Poll & Refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-[#262626]">
        <div className="flex items-center p-0.5 rounded-lg bg-[#181818] border border-[#262626] text-xs font-sans">
          <span className="px-2 text-[#6b7280] hidden sm:inline">Poll:</span>
          {[
            { label: '5s', val: 5000 },
            { label: '10s', val: 10000 },
            { label: 'Pause', val: 0 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setAutoPollInterval(p.val)}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all select-none',
                autoPollInterval === p.val
                  ? 'bg-[#262626] text-[#3ecf8e] font-medium shadow-sm'
                  : 'text-[#9ca3af] hover:text-white'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors text-xs font-sans disabled:opacity-50"
        >
          <Refresh className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {/* Section 1: Database Health & Staging Tables */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3ecf8e]" />
            <h2 className="text-sm font-semibold font-heading text-white">
              PostgreSQL Staging Health
            </h2>
          </div>
          <span className="text-[11px] font-sans text-[#6b7280]">
            Bronze Raw / Silver Unified
          </span>
        </div>
        <DbStatsTable key={refreshKey} autoRefreshInterval={autoPollInterval} />
      </section>

      {/* Section 2: Active Background Tasks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold font-heading text-white">
              Active Process Monitor
            </h2>
          </div>
          <span className="text-[11px] font-sans text-[#6b7280]">
            Concurrent Scrapers &amp; Parsers
          </span>
        </div>
        <ActiveProcessesList />
      </section>

      {/* Section 3: Live Monospace Terminal View */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#3ecf8e]" />
            <h2 className="text-sm font-semibold font-heading text-white">
              Execution Log Console
            </h2>
          </div>
          <span className="text-[11px] font-sans text-[#6b7280]">
            Streaming Output &amp; Structured Diagnostics
          </span>
        </div>
        <LogsTerminalView />
      </section>
      </div>
    </div>
  );
}
