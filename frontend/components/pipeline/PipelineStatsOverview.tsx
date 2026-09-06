'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@tremor/react';
import {
  Database,
  CheckCircle,
  Clock,
  Suitcase,
  NavArrowRight,
} from 'iconoir-react';
import type { ParsingStatus, UnifiedJobItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PipelineStatsOverviewProps {
  status: ParsingStatus | null;
  unifiedJobs?: UnifiedJobItem[];
  isLoading?: boolean;
}

export function PipelineStatsOverview({
  status,
  unifiedJobs = [],
  isLoading = false,
}: PipelineStatsOverviewProps) {
  const indeedRaw = status?.indeed?.total_raw || 0;
  const linkedinRaw = status?.linkedin?.total_raw || 0;
  const wellfoundRaw = status?.wellfound?.total_raw || 0;
  const totalRaw = indeedRaw + linkedinRaw + wellfoundRaw;
  const totalClean = status?.unified_total || 0;
  const unparsedBacklog = Math.max(0, totalRaw - totalClean);

  if (isLoading && !status) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-[#181818] border border-[#262626] p-4 animate-pulse flex flex-col justify-between"
          >
            <div className="h-3 w-24 bg-[#262626] rounded"></div>
            <div className="h-6 w-16 bg-[#262626] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* 1. Total Staging Raw */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-3.5 sm:p-4 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
          <span>Raw Staged Jobs</span>
          <Database className="w-4 h-4 text-amber-400/80" />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-2xl font-mono font-bold text-white">
            {totalRaw.toLocaleString()}
          </span>
          <span className="text-[11px] font-mono text-[#6b7280]">
            3 scrapers
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-[#262626] flex items-center justify-between text-[10px] font-mono text-[#9ca3af]">
          <span>Ind: <strong className="text-white">{indeedRaw}</strong></span>
          <span>•</span>
          <span>In: <strong className="text-white">{linkedinRaw}</strong></span>
          <span>•</span>
          <span>Wf: <strong className="text-white">{wellfoundRaw}</strong></span>
        </div>
      </Card>

      {/* 2. Unified Clean */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-3.5 sm:p-4 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
          <span>Clean Unified DB</span>
          <CheckCircle className="w-4 h-4 text-[#3ecf8e]" />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-2xl font-mono font-bold text-[#3ecf8e]">
            {totalClean.toLocaleString()}
          </span>
          <Link
            href="/jobs"
            className="text-[11px] font-sans text-[#3ecf8e] hover:underline flex items-center gap-0.5"
          >
            <span>View Jobs</span>
            <NavArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="mt-2 pt-2 border-t border-[#262626] flex items-center justify-between text-[10px] font-sans text-[#9ca3af]">
          <span>Standardized & deduplicated</span>
          <span className="font-mono text-white">
            {totalRaw > 0 ? `${Math.round((totalClean / totalRaw) * 100)}%` : '0%'} parsed
          </span>
        </div>
      </Card>

      {/* 3. Pending Backlog */}
      <Card
        className={cn(
          'border rounded-xl p-3.5 sm:p-4 shadow-sm transition-all flex flex-col justify-between',
          unparsedBacklog > 0
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-[#181818] border-[#262626]'
        )}
      >
        <div className="flex items-center justify-between text-xs font-sans text-[#9ca3af]">
          <span>Pending Backlog</span>
          <Clock
            className={cn(
              'w-4 h-4',
              unparsedBacklog > 0 ? 'text-amber-400' : 'text-[#3ecf8e]'
            )}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span
            className={cn(
              'text-2xl font-mono font-bold',
              unparsedBacklog > 0 ? 'text-amber-400' : 'text-[#3ecf8e]'
            )}
          >
            {unparsedBacklog.toLocaleString()}
          </span>
          <span
            className={cn(
              'text-[11px] font-sans px-2 py-0.5 rounded border',
              unparsedBacklog > 0
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20'
            )}
          >
            {unparsedBacklog > 0 ? 'Needs Parsing' : 'All Up to Date'}
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-[#262626] flex items-center justify-between text-[10px] font-mono text-[#9ca3af]">
          <span>Ind: {status?.indeed?.unparsed || 0}</span>
          <span>•</span>
          <span>Wf: {status?.wellfound?.unparsed || 0}</span>
          <span>•</span>
          <span>In: {status?.linkedin?.unparsed || 0}</span>
        </div>
      </Card>
    </div>
  );
}

export default PipelineStatsOverview;
