'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Refresh,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROUTE_TITLES: Record<string, { title: string; category: string }> = {
  '/': { title: 'Platform Cockpit', category: 'Overview' },
  '/scrapers': { title: 'Scraper Operations', category: 'Raw Ingestion' },
  '/pipeline': { title: 'Normalization & Parsing', category: 'Data Pipeline' },
  '/jobs': { title: 'Unified Job Repository', category: 'Silver Tier' },
  '/logs': { title: 'Live Execution Logs', category: 'System Diagnostics' },
};

export function TopHeader() {
  const pathname = usePathname();
  const { activeProcesses } = useActivity();

  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const runningCount = activeProcesses.filter((p) => p.status === 'running').length;

  const currentMeta =
    ROUTE_TITLES[pathname] || {
      title: pathname
        .split('/')
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' / ') || 'Platform Cockpit',
      category: 'Console',
    };

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    const start = performance.now();
    try {
      await api.getHealth();
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
      setLatencyMs(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleQuickReload = () => {
    checkHealth();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('platform:refresh'));
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-[#131313]/90 backdrop-blur-md border-b border-[#262626] px-4 lg:px-8 py-2.5 flex items-center justify-between transition-colors min-h-[50px]">
      {/* Route Title */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold font-heading text-white tracking-tight">
          {currentMeta.title}
        </h2>
      </div>

      {/* Right Controls: Backend Ping Dot & Refresh */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Active process pill if tasks are running */}
        {runningCount > 0 && (
          <Link
            href="/logs"
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[11px] font-sans text-[#3ecf8e]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e] animate-pulse" />
            <span>
              <span className="font-mono">{runningCount}</span> active
            </span>
          </Link>
        )}

        {/* Server Status Dot */}
        <div
          title={
            isOnline === true
              ? `Backend Connected (${latencyMs ?? 0}ms)`
              : isOnline === false
              ? 'Backend unreachable (localhost:8020)'
              : 'Checking API status...'
          }
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#181818] border border-[#262626] text-[11px] font-sans text-[#9ca3af]"
        >
          <span className="relative flex h-2 w-2">
            {isOnline === true ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ecf8e] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3ecf8e]"></span>
              </>
            ) : isOnline === false ? (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            )}
          </span>

          {latencyMs !== null && isOnline && (
            <span className="font-mono text-[10px] text-[#9ca3af] hidden sm:inline">
              {latencyMs}ms
            </span>
          )}
        </div>

        {/* Manual Refresh Button */}
        <button
          type="button"
          onClick={handleQuickReload}
          disabled={isChecking}
          title="Reload system metrics"
          className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#202020] border border-transparent hover:border-[#262626] transition-all disabled:opacity-50"
        >
          <Refresh className={cn('w-3.5 h-3.5', isChecking && 'animate-spin text-[#3ecf8e]')} />
        </button>
      </div>
    </header>
  );
}

export default TopHeader;
