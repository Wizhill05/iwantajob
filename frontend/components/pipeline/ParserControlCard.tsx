'use client';

import React, { useState } from 'react';
import { Card, Metric, Text, ProgressBar } from '@tremor/react';
import {
  Play,
  RefreshDouble,
  Cpu,
  Spark,
  Database,
  CheckCircle,
  WarningTriangle,
  InfoCircle,
  NavArrowRight,
  Filter,
} from 'iconoir-react';
import type { ProviderParsingStats, ParseResult } from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type PipelineProvider = 'indeed' | 'linkedin' | 'wellfound';

interface ParserControlCardProps {
  provider: PipelineProvider;
  stats?: ProviderParsingStats;
  isHighlighted?: boolean;
  onParseComplete?: () => void;
}

interface ProviderCardMeta {
  name: string;
  tag: string;
  tableName: string;
  badgeClass: string;
  description: string;
}

const PROVIDER_METAS: Record<PipelineProvider, ProviderCardMeta> = {
  indeed: {
    name: 'Indeed',
    tag: 'Indeed Mobile GraphQL Gateway',
    tableName: 'raw_indeed_jobs',
    badgeClass: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
    description: 'Normalizes raw GraphQL staging items into annual INR salary bounds and fresher flags.',
  },
  linkedin: {
    name: 'LinkedIn',
    tag: 'LinkedIn Guest Scraper API',
    tableName: 'raw_linkedin_jobs',
    badgeClass: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    description: 'Parses guest postings and enriched descriptions into standardized experience and pay bounds.',
  },
  wellfound: {
    name: 'Wellfound',
    tag: 'Wellfound SSR Apollo Node',
    tableName: 'raw_wellfound_jobs',
    badgeClass: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
    description: 'Converts SSR Apollo Client state and compensation ranges into clean INR unified profiles.',
  },
};

export function ParserControlCard({
  provider,
  stats,
  isHighlighted = false,
  onParseComplete,
}: ParserControlCardProps) {
  const meta = PROVIDER_METAS[provider];
  const { startProcess, finishProcess, addLog } = useActivity();

  // Configuration controls
  const [batchSize, setBatchSize] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Execution result
  const [lastResult, setLastResult] = useState<ParseResult | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const totalRaw = stats?.total_raw || 0;
  const parsed = stats?.parsed || 0;
  const unparsed = stats?.unparsed ?? Math.max(0, totalRaw - parsed);

  const percentParsed = totalRaw > 0 ? Math.min(100, Math.round((parsed / totalRaw) * 100)) : 0;

  const handleRunNormalization = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setLastError(null);

    const procId = startProcess('parse', provider, {
      batch_size: batchSize,
    });

    const startTime = performance.now();

    try {
      const result = await api.triggerParse(provider, {
        batchSize,
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLastDurationMs(elapsed);
      setLastResult(result);

      if (result.errors && result.errors.length > 0) {
        finishProcess(
          procId,
          'completed',
          `Parsed ${result.processed} records with ${result.errors.length} warnings. Promoted ${result.promoted_to_unified} to unified.`
        );
      } else {
        finishProcess(
          procId,
          'completed',
          `Successfully parsed ${result.processed} records, promoting ${result.promoted_to_unified} to unified.`
        );
      }

      addLog(
        'PARSE',
        provider,
        `Normalized batch: ${result.promoted_to_unified}/${result.processed} promoted in ${elapsed}ms`,
        elapsed,
        result
      );

      // Trigger status refresh
      if (onParseComplete) {
        onParseComplete();
      }
      window.dispatchEvent(new CustomEvent('platform:refresh'));
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const msg = err?.message || 'Failed to execute parser batch';
      setLastError(msg);
      setLastDurationMs(elapsed);

      finishProcess(procId, 'failed', msg);
      addLog('ERROR', provider, `Normalization failed: ${msg}`, elapsed);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card
      id={`card-${provider}`}
      className={cn(
        'bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm transition-all flex flex-col justify-between',
        isHighlighted
          ? 'border-[#3ecf8e] ring-1 ring-[#3ecf8e]'
          : 'hover:border-[#383838]'
      )}
    >
      <div>
        {/* Header with Provider Info */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold font-heading text-white">
                {meta.name}
              </h3>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-sans font-medium rounded-full border',
                  meta.badgeClass
                )}
              >
                {meta.tag}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#9ca3af] leading-relaxed">
              {meta.description}
            </p>
          </div>
        </div>

        {/* Backlog Metrics Row */}
        <div className="mt-4 pt-3 border-t border-[#262626] grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-lg bg-[#141414] border border-[#262626]">
            <span className="text-[10px] font-sans text-[#9ca3af] block">
              Total Raw
            </span>
            <span className="mt-0.5 text-base font-mono font-semibold text-white block">
              {totalRaw.toLocaleString()}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#141414] border border-[#262626]">
            <span className="text-[10px] font-sans text-[#9ca3af] block">
              Parsed Clean
            </span>
            <span className="mt-0.5 text-base font-mono font-semibold text-[#3ecf8e] block">
              {parsed.toLocaleString()}
            </span>
          </div>

          <div
            className={cn(
              'p-2.5 rounded-lg border',
              unparsed > 0
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-[#3ecf8e]/10 border-[#3ecf8e]/20 text-[#3ecf8e]'
            )}
          >
            <span className="text-[10px] font-sans block opacity-80">
              Unparsed Backlog
            </span>
            <span className="mt-0.5 text-base font-mono font-semibold block">
              {unparsed.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-sans text-[#9ca3af] mb-1.5">
            <span>Staging Progress</span>
            <span><span className="font-mono">{percentParsed}%</span> normalized</span>
          </div>
          <ProgressBar
            value={percentParsed}
            color="emerald"
            className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
          />
        </div>

        {/* Controls Section */}
        <div className="mt-5 pt-4 border-t border-[#262626] space-y-4">
          {/* Batch Size Slider & Input */}
          <div>
            <div className="flex items-center justify-between text-xs font-sans mb-2">
              <label htmlFor={`batch-size-${provider}`} className="text-white font-medium flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Batch Size:</span>
              </label>
              <span className="text-[#3ecf8e] font-semibold px-2 py-0.5 rounded bg-[#202020] border border-[#262626] font-mono">
                {batchSize} records
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id={`batch-size-${provider}`}
                type="range"
                min="1"
                max="500"
                step="1"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                disabled={isProcessing}
                className="flex-1 accent-[#3ecf8e] cursor-pointer bg-[#262626] h-1.5 rounded-lg appearance-none"
              />
              <input
                type="number"
                min="1"
                max="500"
                value={batchSize}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(500, Number(e.target.value) || 1));
                  setBatchSize(val);
                }}
                disabled={isProcessing}
                className="w-16 px-2 py-1 rounded border border-[#262626] bg-[#141414] text-xs font-mono text-white text-right focus:outline-none focus:border-[#3ecf8e]"
              />
            </div>
          </div>

          {/* Direct Gemini LLM Engine Badge */}
          <div className="p-3 rounded-lg bg-[#141414] border border-[#262626] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <Spark className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-sans font-medium text-white block">
                  Gemini 3.7 Flash Engine
                </span>
                <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed font-sans">
                  Direct cognitive LLM parsing for Indian compensation (monthly annualization, LPA) & experience bounds.
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 whitespace-nowrap">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Action Button & Last Run Feedback */}
      <div className="mt-5 pt-4 border-t border-[#262626] space-y-3">
        {/* Run Normalizer Button */}
        <button
          type="button"
          onClick={handleRunNormalization}
          disabled={isProcessing}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg font-sans text-xs font-semibold flex items-center justify-center gap-2 transition-all',
            isProcessing
              ? 'bg-[#262626] text-[#9ca3af] cursor-not-allowed'
              : 'bg-[#3ecf8e] text-[#131313] hover:bg-[#3ecf8e]/90 active:scale-[0.99]'
          )}
        >
          <RefreshDouble
            className={cn('w-4 h-4', isProcessing && 'animate-spin')}
          />
          <span>{isProcessing ? 'Parsing with Gemini...' : <>Parse Jobs with Gemini (<span className="font-mono">{batchSize}</span>)</>}</span>
        </button>

        {/* Feedback Panel: Success or Error */}
        {lastError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-sans flex items-start gap-2">
            <WarningTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Execution Error</span>
              <span className="text-[11px] opacity-90 font-mono">{lastError}</span>
            </div>
          </div>
        )}

        {lastResult && !lastError && (
          <div className="p-3 rounded-lg bg-[#141414] border border-[#262626] text-xs font-sans space-y-1.5">
            <div className="flex items-center justify-between text-white font-medium">
              <div className="flex items-center gap-1.5 text-[#3ecf8e]">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Last Normalization Run</span>
              </div>
              {lastDurationMs !== null && (
                <span className="text-[11px] font-mono text-[#9ca3af]">{lastDurationMs}ms</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="text-[#9ca3af]">
                Processed: <strong className="text-white font-mono">{lastResult.processed}</strong>
              </div>
              <div className="text-[#9ca3af]">
                Promoted: <strong className="text-[#3ecf8e] font-mono">{lastResult.promoted_to_unified}</strong>
              </div>
            </div>

            {lastResult.errors && lastResult.errors.length > 0 && (
              <div className="mt-1 pt-1.5 border-t border-[#262626] text-[10px] text-amber-400 font-sans">
                <span className="font-semibold"><span className="font-mono">{lastResult.errors.length}</span> Warnings/Errors:</span>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[#9ca3af] font-mono">
                  {lastResult.errors.slice(0, 3).map((err, idx) => (
                    <li key={idx} className="truncate">{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default ParserControlCard;
