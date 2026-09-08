'use client';

import React, { useState } from 'react';
import { Card } from '@tremor/react';
import {
  RefreshDouble,
  Play,
  CheckCircle,
  WarningTriangle,
  Settings,
  Database,
  Spark,
  NavArrowDown,
  NavArrowUp,
} from 'iconoir-react';
import type { ProviderParsingStats, ParseStartResult } from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type PipelineProvider = 'indeed' | 'linkedin' | 'wellfound';

interface ProviderConfig {
  id: PipelineProvider;
  name: string;
  tag: string;
  badgeClass: string;
  accentClass: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'indeed',
    name: 'Indeed',
    tag: 'GraphQL',
    badgeClass: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
    accentClass: 'hover:border-sky-500/40',
  },
  {
    id: 'wellfound',
    name: 'Wellfound',
    tag: 'Apollo SSR',
    badgeClass: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
    accentClass: 'hover:border-rose-500/40',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    tag: 'Guest API',
    badgeClass: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    accentClass: 'hover:border-blue-500/40',
  },
];

interface ProviderRunState {
  isProcessing: boolean;
  durationMs: number | null;
  result: ParseStartResult | null;
  error: string | null;
}

interface UnifiedParserCardProps {
  stats?: {
    indeed?: ProviderParsingStats;
    linkedin?: ProviderParsingStats;
    wellfound?: ProviderParsingStats;
  };
  highlightProvider?: PipelineProvider | null;
  onParseComplete?: () => void;
}

export function UnifiedParserCard({
  stats,
  highlightProvider,
  onParseComplete,
}: UnifiedParserCardProps) {
  const { startProcess, finishProcess, addLog } = useActivity();

  const [batchSize, setBatchSize] = useState<number>(50);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isParsingAll, setIsParsingAll] = useState<boolean>(false);

  const [providerStates, setProviderStates] = useState<
    Record<PipelineProvider, ProviderRunState>
  >({
    indeed: { isProcessing: false, durationMs: null, result: null, error: null },
    wellfound: { isProcessing: false, durationMs: null, result: null, error: null },
    linkedin: { isProcessing: false, durationMs: null, result: null, error: null },
  });

  const totalUnparsedAll =
    (stats?.indeed?.unparsed || 0) +
    (stats?.wellfound?.unparsed || 0) +
    (stats?.linkedin?.unparsed || 0);

  const runSingleProvider = async (provider: PipelineProvider): Promise<boolean> => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], isProcessing: true, error: null },
    }));

    const procId = startProcess('parse', provider, { batch_size: batchSize });
    const startTime = performance.now();

    try {
      const ack = await api.triggerParse(provider, { batchSize });
      const elapsed = Math.round(performance.now() - startTime);

      setProviderStates((prev) => ({
        ...prev,
        [provider]: {
          isProcessing: false,
          durationMs: elapsed,
          result: ack,
          error: null,
        },
      }));

      finishProcess(
        procId,
        'completed',
        `Parse job started in background (batch of ${ack.batch_size}).`
      );

      addLog(
        'PARSE',
        provider,
        `Parse job started in background for ${provider} (batch of ${ack.batch_size})`,
        elapsed,
        ack
      );

      return true;
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const msg = err?.message || `Failed to parse ${provider} batch`;

      setProviderStates((prev) => ({
        ...prev,
        [provider]: {
          isProcessing: false,
          durationMs: elapsed,
          result: null,
          error: msg,
        },
      }));

      finishProcess(procId, 'failed', msg);
      addLog('ERROR', provider, `Normalization failed: ${msg}`, elapsed);
      return false;
    }
  };

  const handleParse = async (provider: PipelineProvider) => {
    const success = await runSingleProvider(provider);
    if (success && onParseComplete) {
      onParseComplete();
    }
    window.dispatchEvent(new CustomEvent('platform:refresh'));
  };

  const handleParseAll = async () => {
    if (isParsingAll) return;
    setIsParsingAll(true);

    for (const p of PROVIDERS) {
      await runSingleProvider(p.id);
    }

    if (onParseComplete) {
      onParseComplete();
    }
    window.dispatchEvent(new CustomEvent('platform:refresh'));
    setIsParsingAll(false);
  };

  const isAnyProcessing =
    isParsingAll || Object.values(providerStates).some((s) => s.isProcessing);

  return (
    <Card className="bg-[#181818] border-[#262626] rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Header: Title, Total Backlog, Batch Settings Toggle, Parse All */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#262626] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/20 flex items-center justify-center text-[#3ecf8e]">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold font-heading text-white flex items-center gap-2">
              <span>Provider Parsers</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Gemini 3.7
              </span>
            </h2>
            <p className="text-xs text-[#9ca3af]">
              Normalize compensation to INR/yr and extract fresher bounds into unified jobs.
            </p>
          </div>
        </div>

        {/* Action Controls on Top Right */}
        <div className="flex items-center gap-2">
          {/* Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all',
              showSettings
                ? 'border-[#3ecf8e] bg-[#3ecf8e]/10 text-[#3ecf8e]'
                : 'border-[#262626] bg-[#141414] text-[#9ca3af] hover:text-white'
            )}
            title="Configure Batch Size"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Batch: {batchSize}</span>
            {showSettings ? (
              <NavArrowUp className="w-3 h-3 ml-0.5" />
            ) : (
              <NavArrowDown className="w-3 h-3 ml-0.5" />
            )}
          </button>

          {/* Parse All Button */}
          <button
            type="button"
            onClick={handleParseAll}
            disabled={isAnyProcessing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all',
              isAnyProcessing
                ? 'bg-[#262626] text-[#6b7280] cursor-not-allowed'
                : 'bg-[#3ecf8e] text-[#131313] hover:bg-[#3ecf8e]/90 active:scale-[0.98]'
            )}
          >
            <RefreshDouble
              className={cn('w-3.5 h-3.5', isParsingAll && 'animate-spin')}
            />
            <span>{isParsingAll ? 'Parsing All...' : 'Parse All'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Settings Row */}
      {showSettings && (
        <div className="p-3.5 rounded-lg bg-[#141414] border border-[#262626] space-y-2.5 transition-all">
          <div className="flex items-center justify-between text-xs font-sans">
            <span className="text-white font-medium">Batch Size Configuration</span>
            <span className="text-[#3ecf8e] font-mono font-semibold">
              {batchSize} records per provider
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="500"
              step="5"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
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
              className="w-16 px-2 py-1 rounded border border-[#262626] bg-[#181818] text-xs font-mono text-white text-right focus:outline-none focus:border-[#3ecf8e]"
            />
          </div>
          <p className="text-[11px] text-[#6b7280]">
            Number of unparsed staging rows sent to Gemini 3.7 per trigger.
          </p>
        </div>
      )}

      {/* Provider List: 3 Providers side by side / stacked rows */}
      <div className="divide-y divide-[#262626]/80">
        {PROVIDERS.map((provider) => {
          const providerStat = stats ? stats[provider.id] : undefined;
          const rawCount = providerStat?.total_raw || 0;
          const cleanCount = providerStat?.parsed || 0;
          const unparsedCount =
            providerStat?.unparsed ?? Math.max(0, rawCount - cleanCount);

          const state = providerStates[provider.id];
          const isProcessing = state.isProcessing;
          const isHighlighted = highlightProvider === provider.id;

          return (
            <div
              key={provider.id}
              id={`card-${provider.id}`}
              className={cn(
                'py-3.5 first:pt-0 last:pb-0 px-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all',
                isHighlighted && 'bg-[#222222] border-l-2 border-[#3ecf8e]',
                provider.accentClass
              )}
            >
              {/* Left Side: Provider Identity & Data Counts */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-[130px]">
                  <span className="text-sm font-semibold font-heading text-white">
                    {provider.name}
                  </span>
                  <span
                    className={cn(
                      'px-1.5 py-0.2 text-[10px] font-sans font-medium rounded border',
                      provider.badgeClass
                    )}
                  >
                    {provider.tag}
                  </span>
                </div>

                {/* Data Numbers right beside the name */}
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-[#9ca3af]" title="Total Raw Records in Staging">
                    <strong className="text-white font-semibold">{rawCount}</strong> raw
                  </span>
                  <span className="text-[#4b5563]">/</span>
                  <span className="text-[#9ca3af]" title="Normalized in unified_jobs">
                    <strong className="text-[#3ecf8e] font-semibold">{cleanCount}</strong> clean
                  </span>
                  <span className="text-[#4b5563]">•</span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] border font-sans font-medium',
                      unparsedCount > 0
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20'
                    )}
                  >
                    <span className="font-mono">{unparsedCount}</span> unparsed
                  </span>
                </div>

                {/* Inline feedback badge (Success or Duration) */}
                {state.result && !state.error && (
                  <span className="text-[11px] font-mono text-[#3ecf8e] flex items-center gap-1 bg-[#3ecf8e]/10 px-2 py-0.5 rounded border border-[#3ecf8e]/20">
                    <CheckCircle className="w-3 h-3" />
                    <span>Parse started</span>
                    {state.durationMs && (
                      <span className="text-[#9ca3af]">({state.durationMs}ms)</span>
                    )}
                  </span>
                )}

                {/* Inline Error Notice */}
                {state.error && (
                  <span className="text-[11px] font-sans text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 max-w-xs truncate" title={state.error}>
                    <WarningTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{state.error}</span>
                  </span>
                )}
              </div>

              {/* Right Side: Parse Button */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleParse(provider.id)}
                  disabled={isAnyProcessing}
                  className={cn(
                    'min-w-[120px] px-3.5 py-1.5 rounded-lg text-xs font-semibold font-sans flex items-center justify-center gap-1.5 transition-all',
                    isProcessing
                      ? 'bg-[#262626] text-[#9ca3af] cursor-not-allowed'
                      : 'bg-[#222222] hover:bg-[#3ecf8e] text-white hover:text-[#131313] border border-[#333333] hover:border-[#3ecf8e] active:scale-[0.98]'
                  )}
                >
                  {isProcessing ? (
                    <>
                      <RefreshDouble className="w-3.5 h-3.5 animate-spin text-[#3ecf8e]" />
                      <span>Parsing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current opacity-80" />
                      <span>Parse ({batchSize})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default UnifiedParserCard;
