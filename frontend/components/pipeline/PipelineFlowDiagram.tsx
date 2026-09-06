'use client';

import React from 'react';
import {
  Database,
  RefreshDouble,
  Cpu,
  Spark,
  Brain,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Code,
  FastArrowRight,
} from 'iconoir-react';
import type { ParsingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PipelineFlowDiagramProps {
  status: ParsingStatus | null;
  isLoading?: boolean;
}

export function PipelineFlowDiagram({ status, isLoading = false }: PipelineFlowDiagramProps) {
  const indeedRaw = status?.indeed?.total_raw || 0;
  const indeedUnparsed = status?.indeed?.unparsed || 0;
  const linkedinRaw = status?.linkedin?.total_raw || 0;
  const linkedinUnparsed = status?.linkedin?.unparsed || 0;
  const wellfoundRaw = status?.wellfound?.total_raw || 0;
  const wellfoundUnparsed = status?.wellfound?.unparsed || 0;

  const totalRaw = indeedRaw + linkedinRaw + wellfoundRaw;
  const totalClean = status?.unified_total || 0;

  return (
    <div className="border-y sm:border sm:rounded-lg bg-[#181818] border-[#262626] p-4 sm:p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/20 flex items-center justify-center text-[#3ecf8e]">
            <RefreshDouble className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold font-heading text-white">
              Decoupled Bronze-to-Silver Ingestion Architecture
            </h2>
            <p className="text-xs text-[#9ca3af]">
              Lossless staging tables promote to normalized unified records via deterministic engines and LLM fallback
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-2 py-0.5 rounded text-[11px] font-sans border bg-[#202020] border-[#262626] text-[#9ca3af]">
            Manual Trigger Only
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-sans border bg-[#3ecf8e]/10 border-[#3ecf8e]/30 text-[#3ecf8e]">
            Zero Scraping Latency
          </span>
        </div>
      </div>

      {/* 3-Column Architecture Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-11 gap-6 items-stretch">
        {/* Left Column: Bronze Raw Staging Tables (4 cols on lg) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-xs font-sans font-semibold text-amber-300">
                Tier 1: Bronze Staging
              </span>
            </div>
            <span className="text-[11px] font-sans text-[#9ca3af]">
              <span className="font-mono">{totalRaw.toLocaleString()}</span> raw rows
            </span>
          </div>

          {/* Table 1: raw_indeed_jobs */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#383838] transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-mono font-medium text-white">raw_indeed_jobs</span>
              </div>
              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">
                GraphQL
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#9ca3af]">Total: <strong className="text-white font-mono">{indeedRaw}</strong></span>
              <span className={cn('px-1.5 py-0.2 rounded border text-[10px] font-sans', indeedUnparsed > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20')}>
                <span className="font-mono">{indeedUnparsed}</span> unparsed
              </span>
            </div>
          </div>

          {/* Table 2: raw_linkedin_jobs */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#383838] transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-mono font-medium text-white">raw_linkedin_jobs</span>
              </div>
              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                Guest API
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#9ca3af]">Total: <strong className="text-white font-mono">{linkedinRaw}</strong></span>
              <span className={cn('px-1.5 py-0.2 rounded border text-[10px] font-sans', linkedinUnparsed > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20')}>
                <span className="font-mono">{linkedinUnparsed}</span> unparsed
              </span>
            </div>
          </div>

          {/* Table 3: raw_wellfound_jobs */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#383838] transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="text-xs font-mono font-medium text-white">raw_wellfound_jobs</span>
              </div>
              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
                Apollo SSR
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#9ca3af]">Total: <strong className="text-white font-mono">{wellfoundRaw}</strong></span>
              <span className={cn('px-1.5 py-0.2 rounded border text-[10px] font-sans', wellfoundUnparsed > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20')}>
                <span className="font-mono">{wellfoundUnparsed}</span> unparsed
              </span>
            </div>
          </div>

          <div className="text-[11px] font-sans text-[#6b7280] flex items-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Lossless JSON payloads stored without conversion</span>
          </div>
        </div>

        {/* Middle Column: Decoupled Extraction & Normalization Engines (4 cols on lg) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3ecf8e]"></span>
              <span className="text-xs font-sans font-semibold text-[#3ecf8e]">
                Decoupled Engines
              </span>
            </div>
            <span className="text-[11px] font-sans text-[#9ca3af]">
              POST /api/parse/:source
            </span>
          </div>

          {/* Direct Engine: Gemini 3.7 Flash Tiered */}
          <div className="p-3.5 rounded-lg bg-[#141414] border border-purple-500/30 hover:border-purple-500/50 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Spark className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs font-sans font-semibold text-white">Gemini 3.7 Flash Engine</span>
              </div>
              <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                Direct LLM Parser
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-[#9ca3af] leading-relaxed">
              Every staged job is directly parsed by Gemini via FreeAPI. Accurately reasons through unstated monthly figures (e.g. ₹20k-50k annualized), LPA bounds, foreign currency conversions, and fresher eligibility.
            </p>
          </div>

          <div className="text-[11px] font-sans text-[#6b7280] flex items-center gap-1.5 pt-1">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>Zero fragile regex; 100% cognitive LLM extraction</span>
          </div>
        </div>

        {/* Right Column: Silver Unified Central Store (3 cols on lg) */}
        <div className="lg:col-span-3 flex flex-col justify-between space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3ecf8e]"></span>
              <span className="text-xs font-sans font-semibold text-[#3ecf8e]">
                Tier 2: Silver Unified
              </span>
            </div>
            <span className="text-[11px] font-sans text-[#3ecf8e]">
              Clean Storage
            </span>
          </div>

          {/* Unified Jobs Card */}
          <div className="h-full p-4 rounded-lg bg-[#141414] border border-[#3ecf8e]/30 flex flex-col justify-between relative overflow-hidden group">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#3ecf8e]" />
                <span className="text-xs font-mono font-semibold text-white">unified_jobs</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-mono font-bold text-[#3ecf8e]">
                  {totalClean.toLocaleString()}
                </div>
                <div className="text-[11px] font-sans text-[#9ca3af] mt-0.5">
                  Standardized clean profiles
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#262626] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-[#9ca3af]">Deduplication:</span>
                  <span className="text-white font-mono text-[10px]">UNIQUE(source, external_id)</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-[#9ca3af]">Salary Unit:</span>
                  <span className="text-[#3ecf8e]">INR / Year (Integer)</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-[#9ca3af]">Fresher Tag:</span>
                  <span className="text-white font-mono text-[10px]">is_fresher_friendly</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-[#9ca3af]">Indexed Slug:</span>
                  <span className="text-white font-mono text-[10px]">city (lowercase)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#262626] flex items-center gap-2 text-[10px] font-sans text-[#3ecf8e]">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Direct querying via /api/jobs/unified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PipelineFlowDiagram;
