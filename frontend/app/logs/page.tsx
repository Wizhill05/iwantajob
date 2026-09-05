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
    <div className="space-y-6 pb-24 lg:pb-12 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/30">
              System Console
            </span>
            <span className="text-[11px] font-mono text-[#6b7280]">
              Operational Diagnostics &amp; Audit Trail
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-white tracking-tight">
            System Logs &amp; Process Monitor
          </h1>
          <p className="text-xs sm:text-sm text-[#9ca3af] mt-1 font-sans">
            Real-time telemetry for scrapers, PostgreSQL staging tiers, and normalization workers
          </p>
        </div>

        {/* Header Action Controls: Auto-Poll & Refresh */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Polling Interval Selector */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#181818] border border-[#262626] text-xs font-mono">
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors text-xs font-mono disabled:opacity-50"
          >
            <Refresh className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Section 1: Database Health & Staging Tables */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3ecf8e]" />
            <h2 className="text-sm font-semibold font-heading text-white uppercase tracking-wider">
              PostgreSQL Staging Health
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#6b7280]">
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
            <h2 className="text-sm font-semibold font-heading text-white uppercase tracking-wider">
              Active Process Monitor
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#6b7280]">
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
            <h2 className="text-sm font-semibold font-heading text-white uppercase tracking-wider">
              Execution Log Console
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#6b7280]">
            Streaming Output &amp; Structured Diagnostics
          </span>
        </div>
        <LogsTerminalView />
      </section>
    </div>
  );
}
