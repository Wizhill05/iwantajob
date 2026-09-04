'use client';

import React from 'react';
import { Card, Metric, Text, ProgressBar } from '@tremor/react';
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-[#181818] border border-[#262626] p-5 animate-pulse flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-[#262626] rounded"></div>
              <div className="h-5 w-5 bg-[#262626] rounded"></div>
            </div>
            <div className="h-7 w-20 bg-[#262626] rounded"></div>
            <div className="h-2 w-32 bg-[#262626] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Raw Bronze Postings */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Bronze Raw Postings</span>
            <Database className="w-4 h-4 text-[#9ca3af]" />
          </div>
          <Metric className="mt-2 text-2xl font-mono font-semibold text-white">
            {totalRaw.toLocaleString()}
          </Metric>
        </div>
        <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
          <span>Indeed: {status?.indeed?.total_raw || 0}</span>
          <span>LI: {status?.linkedin?.total_raw || 0}</span>
          <span>WF: {status?.wellfound?.total_raw || 0}</span>
        </div>
      </Card>

      {/* 2. Silver Unified Clean Jobs */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Silver Unified Clean</span>
            <CheckCircle className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <Metric className="mt-2 text-2xl font-mono font-semibold text-[#3ecf8e]">
            {unifiedTotal.toLocaleString()}
          </Metric>
        </div>
        <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
          <span>Validated & normalized</span>
          <span className="text-[#3ecf8e]">Ready</span>
        </div>
      </Card>

      {/* 3. Pipeline Conversion Ratio */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Conversion Ratio</span>
            <RefreshDouble className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <Metric className="text-2xl font-mono font-semibold text-white">
              {conversionRatio.toFixed(1)}%
            </Metric>
            <Text className="text-xs font-mono text-[#9ca3af]">
              {unifiedTotal}/{totalRaw}
            </Text>
          </div>
          <div className="mt-2.5">
            <ProgressBar
              value={conversionRatio}
              color="emerald"
              className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
            />
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-[#262626] text-[11px] font-mono text-[#9ca3af] flex items-center justify-between">
          <span>Promoted to silver</span>
          <span>{totalRaw - unifiedTotal} unparsed</span>
        </div>
      </Card>

      {/* 4. Operational Status / Latency */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>System Health</span>
            <Activity className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              {isOnline === true ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ecf8e] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3ecf8e]"></span>
                </>
              ) : isOnline === false ? (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
              )}
            </span>
            <Metric className="text-2xl font-mono font-semibold text-white">
              {isOnline === true
                ? latencyMs !== null
                  ? `${latencyMs}ms`
                  : 'Active'
                : isOnline === false
                ? 'Offline'
                : 'Connecting'}
            </Metric>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
          <span>FastAPI + PostgreSQL</span>
          <span
            className={cn(
              isOnline === true
                ? 'text-[#3ecf8e]'
                : isOnline === false
                ? 'text-rose-400'
                : 'text-amber-300'
            )}
          >
            {isOnline === true ? 'All 3 engines live' : 'Connection failed'}
          </span>
        </div>
      </Card>
    </div>
  );
}

export default KpiGrid;
