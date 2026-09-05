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
    <header className="sticky top-0 z-20 bg-[#131313]/80 backdrop-blur-md border-b border-[#262626] px-4 lg:px-8 py-3 flex items-center justify-between min-h-[57px]">
      {/* Breadcrumbs & Title */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 text-[11px] font-sans text-[#6b7280]">
          <span>{currentMeta.category}</span>
          <span>/</span>
          <span className="text-[#9ca3af]">{pathname === '/' ? 'Home' : pathname.replace('/', '')}</span>
        </div>
        <h1 className="text-base font-semibold font-heading text-white tracking-tight">
          {currentMeta.title}
        </h1>
      </div>

      {/* Right-aligned Stats & Health Indicators */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Processes Pill */}
        {runningCount > 0 ? (
          <Link
            href="/logs"
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[#3ecf8e] text-xs font-sans font-medium transition-all hover:bg-[#3ecf8e]/20"
          >
            <Activity className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline"><span className="font-mono">{runningCount}</span> active task{runningCount > 1 ? 's' : ''}</span>
            <span className="sm:hidden"><span className="font-mono">{runningCount}</span> active</span>
          </Link>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181818] border border-[#262626] text-[11px] font-sans text-[#6b7280]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6b7280]/60"></span>
            <span>Idle</span>
          </div>
        )}

        {/* Live Backend Health Indicator */}
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#181818] border border-[#262626] text-xs font-sans"
          title={
            isOnline === true
              ? `Backend healthy (${latencyMs}ms)`
              : isOnline === false
              ? 'Backend unreachable (localhost:8020)'
              : 'Checking backend status...'
          }
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

          <span
            className={cn(
              'text-[11px] font-medium hidden sm:inline',
              isOnline === true
                ? 'text-[#3ecf8e]'
                : isOnline === false
                ? 'text-rose-400'
                : 'text-amber-300'
            )}
          >
            {isOnline === true
              ? latencyMs !== null
                ? <span className="font-mono">{latencyMs}ms</span>
                : 'Live'
              : isOnline === false
              ? 'Offline'
              : 'Connecting'}
          </span>
        </div>

        {/* Quick Reload Button */}
        <button
          type="button"
          onClick={handleQuickReload}
          disabled={isChecking}
          title="Quick reload status"
          aria-label="Quick reload status"
          className="p-1.5 rounded-lg border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors disabled:opacity-50"
        >
          <Refresh
            className={cn('w-4 h-4', isChecking && 'animate-spin text-[#3ecf8e]')}
          />
        </button>
      </div>
    </header>
  );
}

export default TopHeader;
