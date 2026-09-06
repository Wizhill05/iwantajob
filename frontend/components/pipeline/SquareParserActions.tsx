'use client';

import React, { useState } from 'react';
import {
  Linkedin,
  Database,
  Building,
  RefreshDouble,
  Flash,
  CheckCircle,
  WarningTriangle,
  Minus,
  Plus,
} from 'iconoir-react';
import type { ParsingStatus, ParseResult } from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type PipelineProvider = 'linkedin' | 'indeed' | 'wellfound';

interface SquareParserActionsProps {
  status: ParsingStatus | null;
  onParseComplete?: () => void;
}

interface ProviderRunState {
  isProcessing: boolean;
  durationMs: number | null;
  promoted: number | null;
  error: string | null;
}

export function SquareParserActions({
  status,
  onParseComplete,
}: SquareParserActionsProps) {
  const { startProcess, finishProcess, addLog } = useActivity();

  const [batchSize, setBatchSize] = useState<number>(50);
  const [isParsingAll, setIsParsingAll] = useState<boolean>(false);

  const [providerStates, setProviderStates] = useState<
    Record<PipelineProvider, ProviderRunState>
  >({
    linkedin: { isProcessing: false, durationMs: null, promoted: null, error: null },
    indeed: { isProcessing: false, durationMs: null, promoted: null, error: null },
    wellfound: { isProcessing: false, durationMs: null, promoted: null, error: null },
  });

  const totalUnparsed =
    (status?.indeed?.unparsed || 0) +
    (status?.linkedin?.unparsed || 0) +
    (status?.wellfound?.unparsed || 0);

  const runSingleProvider = async (provider: PipelineProvider): Promise<boolean> => {
    setProviderStates((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], isProcessing: true, error: null },
    }));

    const procId = startProcess('parse', provider, { batch_size: batchSize });
    const startTime = performance.now();

    try {
      const result = await api.triggerParse(provider, { batchSize });
      const elapsed = Math.round(performance.now() - startTime);

      setProviderStates((prev) => ({
        ...prev,
        [provider]: {
          isProcessing: false,
          durationMs: elapsed,
          promoted: result.promoted_to_unified,
          error: null,
        },
      }));

      finishProcess(
        procId,
        'completed',
        `Parsed ${result.processed} records, promoted ${result.promoted_to_unified} to unified.`
      );

      addLog(
        'PARSE',
        provider,
        `Normalized batch: ${result.promoted_to_unified}/${result.processed} promoted in ${elapsed}ms`,
        elapsed,
        result
      );

      return true;
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const msg = err?.message || `Failed to parse ${provider}`;

      setProviderStates((prev) => ({
        ...prev,
        [provider]: {
          isProcessing: false,
          durationMs: elapsed,
          promoted: null,
          error: msg,
        },
      }));

      finishProcess(procId, 'failed', msg);
      addLog('ERROR', provider, `Normalization failed: ${msg}`, elapsed);
      return false;
    }
  };

  const handleParse = async (provider: PipelineProvider) => {
    const ok = await runSingleProvider(provider);
    if (ok && onParseComplete) {
      onParseComplete();
    }
    window.dispatchEvent(new CustomEvent('platform:refresh'));
  };

  const handleParseAll = async () => {
    if (isParsingAll) return;
    setIsParsingAll(true);

    const list: PipelineProvider[] = ['linkedin', 'indeed', 'wellfound'];
    for (const p of list) {
      await runSingleProvider(p);
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
    <div className="space-y-6">
      {/* 4 Big Square Action Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Parse All / Parse Everything Button */}
        <button
          type="button"
          onClick={handleParseAll}
          disabled={isAnyProcessing}
          className={cn(
            'aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all select-none group',
            isParsingAll
              ? 'bg-[#1e2a22] border-[#3ecf8e] text-[#3ecf8e]'
              : 'bg-[#181818] border-[#262626] hover:border-[#3ecf8e] hover:bg-[#1c1c1c] active:scale-[0.97]'
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-[#3ecf8e]/10 border border-[#3ecf8e]/20 flex items-center justify-center text-[#3ecf8e] mb-3 group-hover:scale-110 transition-transform">
            <RefreshDouble
              className={cn('w-6 h-6', isParsingAll && 'animate-spin')}
            />
          </div>
          <span className="text-sm sm:text-base font-heading font-bold text-white group-hover:text-[#3ecf8e] transition-colors">
            {isParsingAll ? 'Parsing...' : 'Parse All'}
          </span>
          <span className="text-[11px] font-mono mt-1 text-[#9ca3af]">
            {totalUnparsed > 0 ? (
              <span className="text-amber-400 font-semibold">{totalUnparsed} pending</span>
            ) : (
              <span className="text-[#3ecf8e]">Synced</span>
            )}
          </span>
        </button>

        {/* 2. LinkedIn Button */}
        <button
          type="button"
          onClick={() => handleParse('linkedin')}
          disabled={isAnyProcessing}
          className={cn(
            'aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all select-none group relative overflow-hidden',
            providerStates.linkedin.isProcessing
              ? 'bg-[#162233] border-blue-500 text-blue-400'
              : 'bg-[#181818] border-[#262626] hover:border-blue-500/80 hover:bg-[#1c1c1c] active:scale-[0.97]'
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-110 transition-transform">
            {providerStates.linkedin.isProcessing ? (
              <RefreshDouble className="w-6 h-6 animate-spin" />
            ) : (
              <Linkedin className="w-6 h-6" />
            )}
          </div>
          <span className="text-sm sm:text-base font-heading font-bold text-white group-hover:text-blue-400 transition-colors">
            LinkedIn
          </span>
          <span className="text-[11px] font-mono mt-1 text-[#9ca3af]">
            {providerStates.linkedin.promoted !== null ? (
              <span className="text-[#3ecf8e]">+{providerStates.linkedin.promoted} clean</span>
            ) : (status?.linkedin?.unparsed || 0) > 0 ? (
              <span className="text-amber-400">{status?.linkedin?.unparsed} unparsed</span>
            ) : (
              <span>{status?.linkedin?.parsed || 0} parsed</span>
            )}
          </span>
        </button>

        {/* 3. Indeed Button */}
        <button
          type="button"
          onClick={() => handleParse('indeed')}
          disabled={isAnyProcessing}
          className={cn(
            'aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all select-none group relative overflow-hidden',
            providerStates.indeed.isProcessing
              ? 'bg-[#12283a] border-sky-500 text-sky-400'
              : 'bg-[#181818] border-[#262626] hover:border-sky-500/80 hover:bg-[#1c1c1c] active:scale-[0.97]'
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-3 group-hover:scale-110 transition-transform">
            {providerStates.indeed.isProcessing ? (
              <RefreshDouble className="w-6 h-6 animate-spin" />
            ) : (
              <Database className="w-6 h-6" />
            )}
          </div>
          <span className="text-sm sm:text-base font-heading font-bold text-white group-hover:text-sky-400 transition-colors">
            Indeed
          </span>
          <span className="text-[11px] font-mono mt-1 text-[#9ca3af]">
            {providerStates.indeed.promoted !== null ? (
              <span className="text-[#3ecf8e]">+{providerStates.indeed.promoted} clean</span>
            ) : (status?.indeed?.unparsed || 0) > 0 ? (
              <span className="text-amber-400">{status?.indeed?.unparsed} unparsed</span>
            ) : (
              <span>{status?.indeed?.parsed || 0} parsed</span>
            )}
          </span>
        </button>

        {/* 4. Wellfound Button */}
        <button
          type="button"
          onClick={() => handleParse('wellfound')}
          disabled={isAnyProcessing}
          className={cn(
            'aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-all select-none group relative overflow-hidden',
            providerStates.wellfound.isProcessing
              ? 'bg-[#2b171c] border-rose-500 text-rose-400'
              : 'bg-[#181818] border-[#262626] hover:border-rose-500/80 hover:bg-[#1c1c1c] active:scale-[0.97]'
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3 group-hover:scale-110 transition-transform">
            {providerStates.wellfound.isProcessing ? (
              <RefreshDouble className="w-6 h-6 animate-spin" />
            ) : (
              <Building className="w-6 h-6" />
            )}
          </div>
          <span className="text-sm sm:text-base font-heading font-bold text-white group-hover:text-rose-400 transition-colors">
            Wellfound
          </span>
          <span className="text-[11px] font-mono mt-1 text-[#9ca3af]">
            {providerStates.wellfound.promoted !== null ? (
              <span className="text-[#3ecf8e]">+{providerStates.wellfound.promoted} clean</span>
            ) : (status?.wellfound?.unparsed || 0) > 0 ? (
              <span className="text-amber-400">{status?.wellfound?.unparsed} unparsed</span>
            ) : (
              <span>{status?.wellfound?.parsed || 0} parsed</span>
            )}
          </span>
        </button>
      </div>

      {/* Errors or Notices if any */}
      {Object.entries(providerStates).some(([_, s]) => s.error) && (
        <div className="space-y-1">
          {Object.entries(providerStates).map(([prov, s]) =>
            s.error ? (
              <div
                key={prov}
                className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2"
              >
                <WarningTriangle className="w-4 h-4 shrink-0" />
                <span className="capitalize font-semibold">{prov}:</span>
                <span className="truncate">{s.error}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Minimal Unboxed Bottom Strip: Batch Size & Direct Info */}
      <div className="pt-4 border-t border-[#262626] flex items-center justify-between gap-4 flex-wrap text-xs text-[#9ca3af]">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">Batch Size:</span>
          <div className="flex items-center gap-1 bg-[#181818] border border-[#262626] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setBatchSize((prev) => Math.max(10, prev - 10))}
              disabled={isAnyProcessing || batchSize <= 10}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#262626] text-white disabled:opacity-30 transition-colors"
              title="Decrease batch size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-10 text-center font-mono font-semibold text-white">
              {batchSize}
            </span>
            <button
              type="button"
              onClick={() => setBatchSize((prev) => Math.min(200, prev + 10))}
              disabled={isAnyProcessing || batchSize >= 200}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#262626] text-white disabled:opacity-30 transition-colors"
              title="Increase batch size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <span className="text-[#6b7280]">records / click</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span>Total Clean: <strong className="text-[#3ecf8e]">{status?.unified_total || 0}</strong></span>
          <span>•</span>
          <span>
            Pending:{' '}
            <strong className={totalUnparsed > 0 ? 'text-amber-400' : 'text-[#3ecf8e]'}>
              {totalUnparsed}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}

export default SquareParserActions;
