'use client';

import React from 'react';
import { Card, Metric, Text, ProgressBar, Badge } from '@tremor/react';
import {
  Database,
  CheckCircle,
  RefreshDouble,
  GraduationCap,
  Cpu,
  Spark,
  Coins,
  ShieldCheck,
  Code,
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

  const promotionYield = totalRaw > 0 ? Math.min(100, (totalClean / totalRaw) * 100) : 0;
  const unparsedBacklog = Math.max(0, totalRaw - totalClean);

  // Compute stats from available sample of unified jobs
  const sampleCount = unifiedJobs.length;
  const fresherCount = unifiedJobs.filter((j) => j.is_fresher_friendly).length;
  const fresherPct = sampleCount > 0 ? Math.round((fresherCount / sampleCount) * 100) : 0;

  // Extraction methods breakdown
  const salaryMethods = {
    native: unifiedJobs.filter((j) => j.salary_extraction_method === 'native').length,
    regex: unifiedJobs.filter((j) => j.salary_extraction_method === 'regex').length,
    llm: unifiedJobs.filter((j) => j.salary_extraction_method === 'llm').length,
    none: unifiedJobs.filter((j) => j.salary_extraction_method === 'none').length,
  };

  const experienceMethods = {
    native: unifiedJobs.filter((j) => j.experience_extraction_method === 'native').length,
    regex: unifiedJobs.filter((j) => j.experience_extraction_method === 'regex').length,
    llm: unifiedJobs.filter((j) => j.experience_extraction_method === 'llm').length,
    none: unifiedJobs.filter((j) => j.experience_extraction_method === 'none').length,
  };

  const deterministicCount =
    salaryMethods.native +
    salaryMethods.regex +
    experienceMethods.native +
    experienceMethods.regex;
  const totalExtractionOps = (sampleCount * 2) || 1;
  const deterministicYieldPct = Math.min(
    100,
    Math.round((deterministicCount / totalExtractionOps) * 100)
  );

  if (isLoading && !status) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-[#181818] border border-[#262626] p-5 animate-pulse flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 bg-[#262626] rounded"></div>
              <div className="h-5 w-5 bg-[#262626] rounded"></div>
            </div>
            <div className="h-7 w-20 bg-[#262626] rounded"></div>
            <div className="h-2 w-full bg-[#262626] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Raw vs Clean Records */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Staging vs Clean</span>
            <Database className="w-4 h-4 text-[#9ca3af]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <Metric className="text-2xl font-mono font-semibold text-white">
              {totalRaw.toLocaleString()}
            </Metric>
            <span className="text-xs font-mono text-[#9ca3af]">raw</span>
            <span className="text-xs text-[#6b7280]">/</span>
            <Metric className="text-2xl font-mono font-semibold text-[#3ecf8e]">
              {totalClean.toLocaleString()}
            </Metric>
            <span className="text-xs font-mono text-[#3ecf8e]">clean</span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#262626] space-y-1.5 text-[11px] font-mono">
          <div className="flex items-center justify-between text-[#9ca3af]">
            <span>Indeed GraphQL:</span>
            <span className="text-white">{indeedRaw}</span>
          </div>
          <div className="flex items-center justify-between text-[#9ca3af]">
            <span>LinkedIn Guest:</span>
            <span className="text-white">{linkedinRaw}</span>
          </div>
          <div className="flex items-center justify-between text-[#9ca3af]">
            <span>Wellfound SSR:</span>
            <span className="text-white">{wellfoundRaw}</span>
          </div>
        </div>
      </Card>

      {/* 2. Overall Promotion Yield */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Promotion Yield</span>
            <RefreshDouble className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <Metric className="text-2xl font-mono font-semibold text-[#3ecf8e]">
              {promotionYield.toFixed(1)}%
            </Metric>
            <span className="text-xs font-mono text-[#9ca3af]">
              {totalClean} of {totalRaw}
            </span>
          </div>
          <div className="mt-2.5">
            <ProgressBar
              value={promotionYield}
              color="emerald"
              className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono">
          <span className="text-[#9ca3af]">Remaining backlog:</span>
          <span
            className={cn(
              'px-1.5 py-0.2 rounded border text-[10px]',
              unparsedBacklog > 0
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20'
            )}
          >
            {unparsedBacklog} unparsed
          </span>
        </div>
      </Card>

      {/* 3. Fresher Conversion & Detection */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Fresher Detection</span>
            <GraduationCap className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <Metric className="text-2xl font-mono font-semibold text-white">
              {sampleCount > 0 ? `${fresherPct}%` : 'N/A'}
            </Metric>
            <span className="text-xs font-mono text-[#3ecf8e]">
              {fresherCount} roles
            </span>
          </div>
          <div className="mt-2.5">
            <ProgressBar
              value={fresherPct}
              color="emerald"
              className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
          <span>Criteria:</span>
          <span className="text-white text-[10px] px-1.5 py-0.5 rounded bg-[#202020] border border-[#262626]">
            &lt;= 1 yr / Interns
          </span>
        </div>
      </Card>

      {/* 4. Normalization Method Distribution */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af] uppercase tracking-wider">
            <span>Method Distribution</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <Metric className="text-2xl font-mono font-semibold text-white">
              {sampleCount > 0 ? `${deterministicYieldPct}%` : '100%'}
            </Metric>
            <span className="text-xs font-mono text-[#3ecf8e]">Deterministic</span>
          </div>
          <div className="mt-2.5">
            <ProgressBar
              value={deterministicYieldPct}
              color="emerald"
              className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#262626] grid grid-cols-3 gap-1 text-center text-[10px] font-mono">
          <div className="p-1 rounded bg-[#141414] border border-[#262626]">
            <span className="text-[#9ca3af] block">Native</span>
            <span className="text-white font-semibold">{salaryMethods.native + experienceMethods.native}</span>
          </div>
          <div className="p-1 rounded bg-[#141414] border border-[#262626]">
            <span className="text-[#9ca3af] block">Regex</span>
            <span className="text-[#3ecf8e] font-semibold">{salaryMethods.regex + experienceMethods.regex}</span>
          </div>
          <div className="p-1 rounded bg-[#141414] border border-[#262626]">
            <span className="text-purple-400 block">LLM</span>
            <span className="text-purple-300 font-semibold">{salaryMethods.llm + experienceMethods.llm}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default PipelineStatsOverview;
