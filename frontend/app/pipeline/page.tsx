'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Refresh,
  RefreshDouble,
  Cpu,
  Database,
  WarningTriangle,
  CheckCircle,
  Activity,
  Filter,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type { ParsingStatus, UnifiedJobItem } from '@/lib/types';
import { PipelineStatsOverview } from '@/components/pipeline/PipelineStatsOverview';
import { PipelineFlowDiagram } from '@/components/pipeline/PipelineFlowDiagram';
import { ParserControlCard, type PipelineProvider } from '@/components/pipeline/ParserControlCard';
import { cn } from '@/lib/utils';

function PipelineContent() {
  const searchParams = useSearchParams();
  const providerParam = searchParams.get('provider') as PipelineProvider | null;

  const [parsingStatus, setParsingStatus] = useState<ParsingStatus | null>(null);
  const [unifiedJobs, setUnifiedJobs] = useState<UnifiedJobItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<PipelineProvider | null>(
    providerParam === 'indeed' || providerParam === 'linkedin' || providerParam === 'wellfound'
      ? providerParam
      : null
  );

  // Sync highlight with query param changes
  useEffect(() => {
    if (
      providerParam === 'indeed' ||
      providerParam === 'linkedin' ||
      providerParam === 'wellfound'
    ) {
      setActiveHighlight(providerParam);
      // Scroll card into view smoothly
      const el = document.getElementById(`card-${providerParam}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [providerParam]);

  const loadPipelineData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const [status, jobs] = await Promise.all([
        api.getParsingStatus(),
        api.getUnifiedJobs({ limit: 100 }).catch(() => [] as UnifiedJobItem[]),
      ]);

      setParsingStatus(status);
      setUnifiedJobs(jobs);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch pipeline status from FastAPI backend.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPipelineData(true);

    // Auto-poll status every 10 seconds
    const interval = setInterval(() => {
      loadPipelineData(false);
    }, 10000);

    const handlePlatformRefresh = () => {
      loadPipelineData(false);
    };
    window.addEventListener('platform:refresh', handlePlatformRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('platform:refresh', handlePlatformRefresh);
    };
  }, [loadPipelineData]);

  const totalUnparsed = parsingStatus
    ? (parsingStatus.indeed?.unparsed || 0) +
      (parsingStatus.linkedin?.unparsed || 0) +
      (parsingStatus.wellfound?.unparsed || 0)
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#3ecf8e] uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e]"></span>
            <span>Pipeline Manager</span>
          </div>
          <h1 className="text-2xl font-bold font-heading text-white tracking-tight">
            Bronze-to-Silver Normalization Engine
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#9ca3af]">
            Manual batch triggers, deterministic currency/experience parsers, and LLM fallback management.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {lastUpdated && (
            <span className="text-[11px] font-mono text-[#6b7280] hidden xl:inline">
              Synced {lastUpdated.toLocaleTimeString([], { hour12: false })}
            </span>
          )}

          {/* Unparsed Backlog Badge */}
          <div
            className={cn(
              'px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5',
              totalUnparsed > 0
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-[#3ecf8e]/10 border-[#3ecf8e]/20 text-[#3ecf8e]'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            <span>{totalUnparsed} unparsed backlog</span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadPipelineData(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#202020] text-xs font-mono text-[#9ca3af] hover:text-white transition-all disabled:opacity-50"
            title="Refresh pipeline status"
          >
            <Refresh
              className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Backend Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs font-mono text-rose-400">
          <WarningTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{error} Backend may be offline at http://localhost:8000.</span>
            <button
              type="button"
              onClick={() => loadPipelineData(true)}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-medium underline self-start sm:self-auto"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* 1. Tremor Metrics & Extraction Overview */}
      <section aria-labelledby="pipeline-metrics-title">
        <h2 id="pipeline-metrics-title" className="sr-only">
          Pipeline Promotion Metrics
        </h2>
        <PipelineStatsOverview
          status={parsingStatus}
          unifiedJobs={unifiedJobs}
          isLoading={isLoading}
        />
      </section>

      {/* 2. Visual Architecture Diagram */}
      <section aria-labelledby="pipeline-diagram-title">
        <h2 id="pipeline-diagram-title" className="sr-only">
          Pipeline Architecture Diagram
        </h2>
        <PipelineFlowDiagram
          status={parsingStatus}
          isLoading={isLoading}
        />
      </section>

      {/* 3. Manual Normalization Control Cards */}
      <section aria-labelledby="parser-controls-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3ecf8e]" />
            <h2
              id="parser-controls-title"
              className="text-sm font-semibold font-heading text-white"
            >
              Decoupled Provider Parsers & Batch Execution
            </h2>
          </div>

          {/* Quick Highlight Filter */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[#6b7280] hidden sm:inline">Highlight:</span>
            {(['indeed', 'linkedin', 'wellfound'] as const).map((prov) => (
              <button
                key={prov}
                type="button"
                onClick={() => {
                  setActiveHighlight(activeHighlight === prov ? null : prov);
                  const el = document.getElementById(`card-${prov}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] border capitalize transition-all',
                  activeHighlight === prov
                    ? 'border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]'
                    : 'border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white'
                )}
              >
                {prov}
              </button>
            ))}
            {activeHighlight && (
              <button
                type="button"
                onClick={() => setActiveHighlight(null)}
                className="text-[10px] text-[#6b7280] hover:text-white px-1 underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ParserControlCard
            provider="indeed"
            stats={parsingStatus?.indeed}
            isHighlighted={activeHighlight === 'indeed'}
            onParseComplete={() => loadPipelineData(false)}
          />
          <ParserControlCard
            provider="linkedin"
            stats={parsingStatus?.linkedin}
            isHighlighted={activeHighlight === 'linkedin'}
            onParseComplete={() => loadPipelineData(false)}
          />
          <ParserControlCard
            provider="wellfound"
            stats={parsingStatus?.wellfound}
            isHighlighted={activeHighlight === 'wellfound'}
            onParseComplete={() => loadPipelineData(false)}
          />
        </div>
      </section>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-mono text-[#3ecf8e]">
            <RefreshDouble className="w-4 h-4 animate-spin" />
            <span>Loading Pipeline Manager...</span>
          </div>
        </div>
      }
    >
      <PipelineContent />
    </Suspense>
  );
}
