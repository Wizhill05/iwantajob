'use client';

import React from 'react';
import { ProgressBar } from '@tremor/react';
import {
  Database,
  CheckCircle,
  RefreshDouble,
  Activity,
} from 'iconoir-react';
import type { ParsingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface KpiGridProps {
  status: ParsingStatus | null;
  isLoading?: boolean;
  latencyMs?: number | null;
  isOnline?: boolean | null;
}

export function KpiGrid({
  status,
  isLoading = false,
  latencyMs = null,
  isOnline = true,
}: KpiGridProps) {
  const totalRaw = status
    ? (status.indeed?.total_raw || 0) +
      (status.linkedin?.total_raw || 0) +
      (status.wellfound?.total_raw || 0)
    : 0;

  const unifiedTotal = status?.unified_total || 0;

  const conversionRatio =
    totalRaw > 0 ? Math.min(100, (unifiedTotal / totalRaw) * 100) : 0;

  if (isLoading && !status) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-3 lg:gap-4 divide-y divide-[#262626] sm:divide-y-0 border-y sm:border-y-0 border-[#262626] sm:rounded-xl">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 lg:h-32 rounded-none sm:rounded-xl bg-[#181818] border-0 sm:border border-[#262626] p-4 lg:p-5 animate-pulse flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 lg:w-24 bg-[#262626] rounded"></div>
              <div className="h-4 w-4 bg-[#262626] rounded"></div>
            </div>
            <div className="h-6 w-16 bg-[#262626] rounded"></div>
            <div className="h-2 w-24 bg-[#262626] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-3 lg:gap-4 divide-y divide-[#262626] sm:divide-y-0 border-y sm:border-y-0 border-[#262626] sm:rounded-xl">
      {/* 1. Total Raw Bronze Postings */}
      <div className="bg-[#181818] border-0 sm:border border-[#262626] rounded-none sm:rounded-xl p-3.5 sm:p-4 lg:p-5 shadow-none sm:shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
            <span>Bronze Raw</span>
            <Database className="w-4 h-4 text-[#9ca3af]" />
          </div>
          <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-mono font-semibold text-white">
            {totalRaw.toLocaleString()}
          </div>
        </div>
        <div className="mt-3 pt-2.5 sm:pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-sans text-[#9ca3af]">
          <span>Ind: <span className="font-mono">{status?.indeed?.total_raw || 0}</span></span>
          <span>LI: <span className="font-mono">{status?.linkedin?.total_raw || 0}</span></span>
          <span>WF: <span className="font-mono">{status?.wellfound?.total_raw || 0}</span></span>
        </div>
      </div>

      {/* 2. Silver Unified Clean Jobs */}
      <div className="bg-[#181818] border-0 sm:border border-[#262626] rounded-none sm:rounded-xl p-3.5 sm:p-4 lg:p-5 shadow-none sm:shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
            <span>Silver Clean</span>
            <CheckCircle className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-mono font-semibold text-[#3ecf8e]">
            {unifiedTotal.toLocaleString()}
          </div>
        </div>
        <div className="mt-3 pt-2.5 sm:pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-sans text-[#9ca3af]">
          <span>Normalized</span>
          <span className="text-[#3ecf8e]">Ready</span>
        </div>
      </div>

      {/* 3. Pipeline Conversion Ratio */}
      <div className="bg-[#181818] border-0 sm:border border-[#262626] rounded-none sm:rounded-xl p-3.5 sm:p-4 lg:p-5 shadow-none sm:shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
            <span>Conversion Ratio</span>
            <RefreshDouble className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-baseline justify-between">
            <div className="text-xl sm:text-2xl font-mono font-semibold text-white">
              {conversionRatio.toFixed(1)}%
            </div>
            <span className="text-xs font-mono text-[#9ca3af]">
              {unifiedTotal}/{totalRaw}
            </span>
          </div>
          <div className="mt-2 sm:mt-2.5">
            <ProgressBar
              value={conversionRatio}
              color="emerald"
              className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
            />
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-[#262626] text-[11px] font-sans text-[#9ca3af] flex items-center justify-between">
          <span>Promoted</span>
          <span><span className="font-mono">{totalRaw - unifiedTotal}</span> unparsed</span>
        </div>
      </div>

      {/* 4. Operational Status / Latency */}
      <div className="bg-[#181818] border-0 sm:border border-[#262626] rounded-none sm:rounded-xl p-3.5 sm:p-4 lg:p-5 shadow-none sm:shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
            <span>System Health</span>
            <Activity className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-2 sm:gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              {isOnline === true ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ecf8e] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3ecf8e]"></span>
                </>
              ) : isOnline === false ? (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
              )}
            </span>
            <div className="text-xl sm:text-2xl font-mono font-semibold text-white">
              {isOnline === true
                ? latencyMs !== null
                  ? `${latencyMs}ms`
                  : 'Active'
                : isOnline === false
                ? 'Offline'
                : 'Connecting'}
            </div>
          </div>
        </div>
        <div className="mt-3 pt-2.5 sm:pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-sans text-[#9ca3af]">
          <span>FastAPI</span>
          <span
            className={cn(
              isOnline === true
                ? 'text-[#3ecf8e]'
                : isOnline === false
                ? 'text-rose-400'
                : 'text-amber-300'
            )}
          >
            {isOnline === true ? 'Engines live' : 'Failed'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default KpiGrid;
