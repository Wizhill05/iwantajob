'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Linkedin,
  Database,
  Building,
  RefreshDouble,
  WarningTriangle,
  Trash,
  Xmark,
  Minus,
  Plus,
} from 'iconoir-react';
import type { LastPipelineJob, ParsingStatus } from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type PipelineProvider = 'linkedin' | 'indeed' | 'wellfound';

interface SquareParserActionsProps {
  status: ParsingStatus | null;
  onParseComplete?: () => void;
}

const ALL_PROVIDERS: PipelineProvider[] = ['linkedin', 'indeed', 'wellfound'];

// Backend rejects with 409 + a PIPELINE_BUSY detail while another scraping
// operation is running/queued.
const BUSY_ERROR_PATTERN = /PIPELINE_BUSY|one scraping operation|already running/i;
// Minimum gap between "busy" retries, roughly one status poll cycle.
const RETRY_BACKOFF_MS = 3000;

const isBusyError = (message: string): boolean => BUSY_ERROR_PATTERN.test(message);

const PROVIDER_META: Record<
  PipelineProvider,
  { label: string; ring: string; text: string; tint: string; hoverRing: string }
> = {
  linkedin: {
    label: 'LinkedIn',
    ring: 'border-blue-500',
    text: 'text-blue-400',
    tint: 'bg-blue-500/10 text-blue-400',
    hoverRing: 'hover:border-blue-500/80',
  },
  indeed: {
    label: 'Indeed',
    ring: 'border-sky-500',
    text: 'text-sky-400',
    tint: 'bg-sky-500/10 text-sky-400',
    hoverRing: 'hover:border-sky-500/80',
  },
  wellfound: {
    label: 'Wellfound',
    ring: 'border-rose-500',
    text: 'text-rose-400',
    tint: 'bg-rose-500/10 text-rose-400',
    hoverRing: 'hover:border-rose-500/80',
  },
};

const ALL_META = {
  label: 'Parse All',
  ring: 'border-[#3ecf8e]',
  text: 'text-[#3ecf8e]',
  tint: 'bg-[#3ecf8e]/10 text-[#3ecf8e]',
  hoverRing: 'hover:border-[#3ecf8e]',
};

export function SquareParserActions({
  status,
  onParseComplete,
}: SquareParserActionsProps) {
  const { addLog } = useActivity();

  const [batchSize, setBatchSize] = useState<number>(50);
  // Optimistic state between clicking "start" and the next status poll confirming active_job.
  const [pendingProvider, setPendingProvider] = useState<PipelineProvider | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  // "Parse All" queues providers and triggers them one at a time, server-side.
  const [isParsingAll, setIsParsingAll] = useState<boolean>(false);
  const [queued, setQueued] = useState<PipelineProvider[]>([]);
  const [, setTick] = useState<number>(0);
  // Bronze (raw staging) wipe
  const [showBronzeConfirm, setShowBronzeConfirm] = useState<boolean>(false);
  const [isClearingBronze, setIsClearingBronze] = useState<boolean>(false);

  const pendingSinceRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const ackedRunRef = useRef<string | null>(null);
  // Timestamp of the last trigger rejected as busy, so queued retries wait for
  // the next status poll instead of hammering the API.
  const busyRetryAtRef = useRef<number>(0);

  const activeJob = status?.active_job ?? null;

  // Smooth elapsed-seconds display while a job is running.
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activeJob]);

  // Clear the optimistic pending state once the backend confirms the running job.
  useEffect(() => {
    if (activeJob && pendingProvider) {
      setPendingProvider(null);
    }
  }, [activeJob, pendingProvider]);

  // Safety: drop optimistic state if the job finished before a poll caught it active.
  useEffect(() => {
    if (!pendingProvider || activeJob) return;
    const last = status?.last_job;
    if (last && new Date(last.finished_at).getTime() > pendingSinceRef.current - 1000) {
      setPendingProvider(null);
    }
  }, [pendingProvider, activeJob, status?.last_job]);

  // Surface newly finished background runs in the activity feed (dedup per run).
  useEffect(() => {
    const last: LastPipelineJob | null = status?.last_job ?? null;
    if (!last?.finished_at) return;
    if (last.finished_at === ackedRunRef.current) return;
    // Skip history from before this component mounted.
    if (new Date(last.finished_at).getTime() < mountedAtRef.current) {
      ackedRunRef.current = last.finished_at;
      return;
    }
    ackedRunRef.current = last.finished_at;
    if (last.status === 'failed') {
      addLog('ERROR', last.provider as PipelineProvider, `Pipeline job failed: ${last.error || 'unknown error'}`);
    } else {
      addLog(
        'PARSE',
        last.provider as PipelineProvider,
        `Normalized batch: ${last.promoted}/${last.processed} promoted`
      );
    }
    onParseComplete?.();
    window.dispatchEvent(new CustomEvent('platform:refresh'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.last_job?.finished_at]);

  type TriggerResult = 'started' | 'busy' | 'error';

  const triggerProvider = async (provider: PipelineProvider): Promise<TriggerResult> => {
    setPendingProvider(provider);
    setTriggerError(null);
    pendingSinceRef.current = Date.now();
    try {
      await api.triggerParse(provider, { batchSize });
      onParseComplete?.();
      return 'started';
    } catch (err: any) {
      const message = err?.message || `Failed to start ${PROVIDER_META[provider].label} parse`;
      if (isBusyError(message)) {
        // The server is still finishing the previous batch. The backend queues
        // operations, so back off until the next status poll and try again
        // instead of showing a scary error.
        busyRetryAtRef.current = Date.now();
        setPendingProvider(null);
        return 'busy';
      }
      setTriggerError(message);
      setPendingProvider(null);
      return 'error';
    }
  };

  // Sequentially kick off the queued providers once the pipeline is idle again.
  useEffect(() => {
    if (!isParsingAll) return;
    if (activeJob || pendingProvider) return;
    const [next, ...rest] = queued;
    if (!next) {
      setIsParsingAll(false);
      return;
    }
    if (Date.now() - busyRetryAtRef.current < RETRY_BACKOFF_MS) return;
    setQueued(rest);
    void triggerProvider(next).then((result) => {
      if (result === 'busy') {
        // Put it back at the front of the queue; retried after the backoff.
        setQueued((prev) => [next, ...prev.filter((p) => p !== next)]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParsingAll, activeJob, pendingProvider, queued]);

  const handleParse = async (provider: PipelineProvider) => {
    if (isBusy) return;
    const result = await triggerProvider(provider);
    if (result === 'busy') {
      setTriggerError(
        'The pipeline is busy — only one scraping operation runs at a time. Try again when the current batch finishes.'
      );
    }
  };

  const handleParseAll = () => {
    if (isBusy || isParsingAll) return;
    setQueued(ALL_PROVIDERS);
    setIsParsingAll(true);
  };

  const handleClearBronze = async () => {
    if (isClearingBronze) return;
    setIsClearingBronze(true);
    const start = Date.now();
    try {
      const res = await api.clearBronze();
      addLog(
        'INFO',
        'system',
        `Cleared bronze layer: ${res.total_deleted} raw row(s) deleted`,
        Date.now() - start,
        res.deleted
      );
      onParseComplete?.();
      window.dispatchEvent(new CustomEvent('platform:refresh'));
    } catch (err: any) {
      addLog(
        'ERROR',
        'system',
        `Failed to clear bronze layer: ${err?.message || String(err)}`,
        Date.now() - start
      );
    } finally {
      setIsClearingBronze(false);
    }
  };

  const isBusy = Boolean(activeJob) || Boolean(pendingProvider);

  const totalUnparsed =
    (status?.indeed?.unparsed || 0) +
    (status?.linkedin?.unparsed || 0) +
    (status?.wellfound?.unparsed || 0);

  const runningProvider = (activeJob?.provider ?? pendingProvider) as
    | PipelineProvider
    | 'unified'
    | null;

  const elapsedSec = activeJob
    ? Math.max(0, Math.floor((Date.now() - new Date(activeJob.started_at).getTime()) / 1000))
    : null;

  const statusLine = (provider: PipelineProvider) => {
    const prov = status?.[provider];
    if ((prov?.unparsed || 0) > 0) {
      return <span className="text-amber-400">{prov?.unparsed} unparsed</span>;
    }
    return <span>{prov?.parsed || 0} parsed</span>;
  };

  const circleClass = (meta: typeof ALL_META, isRunning: boolean) =>
    cn(
      'w-14 h-14 sm:w-16 sm:h-16 rounded-full border flex items-center justify-center transition-all select-none active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
      isRunning
        ? cn('bg-[#181818]', meta.ring)
        : cn('bg-[#181818] border-[#262626]', meta.hoverRing, 'hover:bg-[#1c1c1c]')
    );

  return (
    <div className="space-y-6">
      {/* 4 Circular Action Buttons in a single row */}
      <div className="grid grid-cols-4 gap-2 sm:gap-6 place-items-center py-1">
        {/* 1. Parse All */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleParseAll}
            disabled={isBusy}
            className={circleClass(ALL_META, isParsingAll)}
            title="Parse all providers sequentially"
          >
            <RefreshDouble
              className={cn('w-6 h-6 text-[#3ecf8e]', (isParsingAll || runningProvider) && 'animate-spin')}
            />
          </button>
          <span className="text-[11px] font-heading font-semibold text-white">
            {isParsingAll ? 'Parsing…' : 'Parse All'}
          </span>
          <span className="text-[10px] font-mono text-[#9ca3af] -mt-1">
            {totalUnparsed > 0 ? (
              <span className="text-amber-400 font-semibold">{totalUnparsed} pending</span>
            ) : (
              <span className="text-[#3ecf8e]">Synced</span>
            )}
          </span>
        </div>

        {/* 2-4. Per-provider circles */}
        {ALL_PROVIDERS.map((provider) => {
          const meta = PROVIDER_META[provider];
          const isRunning = runningProvider === provider;
          return (
            <div key={provider} className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => handleParse(provider)}
                disabled={isBusy}
                className={circleClass(meta, isRunning)}
                title={`Parse ${meta.label} raw jobs`}
              >
                {provider === 'linkedin' && <Linkedin className={cn('w-6 h-6', meta.text, isRunning && 'animate-pulse')} />}
                {provider === 'indeed' && <Database className={cn('w-6 h-6', meta.text, isRunning && 'animate-pulse')} />}
                {provider === 'wellfound' && <Building className={cn('w-6 h-6', meta.text, isRunning && 'animate-pulse')} />}
              </button>
              <span className="text-[11px] font-heading font-semibold text-white">{meta.label}</span>
              <span className="text-[10px] font-mono text-[#9ca3af] -mt-1">{statusLine(provider)}</span>
            </div>
          );
        })}
      </div>

      {/* Live running-job banner — sourced from backend so it survives reloads */}
      {(activeJob || pendingProvider || isParsingAll) && (
        <div className="px-3 py-2 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/20 text-[#3ecf8e] text-xs font-mono flex items-center gap-2">
          <RefreshDouble className="w-4 h-4 shrink-0 animate-spin" />
          <span className="capitalize font-semibold">
            {activeJob
              ? activeJob.state === 'queued'
                ? `Queued ${activeJob.provider}`
                : `Parsing ${activeJob.provider}`
              : pendingProvider
                ? `Starting ${pendingProvider}`
                : 'Queuing'}…
          </span>
          {elapsedSec !== null && <span>· {elapsedSec}s elapsed</span>}
          {activeJob && activeJob.processed > 0 && (
            <span>
              · {activeJob.processed} processed
              {activeJob.promoted > 0 ? `, ${activeJob.promoted} promoted` : ''}
            </span>
          )}
        </div>
      )}

      {/* Errors or Notices if any */}
      {(triggerError || status?.last_job?.status === 'failed') && (
        <div className="space-y-1">
          {triggerError && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
              <WarningTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">{triggerError}</span>
            </div>
          )}
          {status?.last_job?.status === 'failed' && (
            <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
              <WarningTriangle className="w-4 h-4 shrink-0" />
              <span className="capitalize font-semibold">{status.last_job.provider}:</span>
              <span className="truncate">{status.last_job.error || 'Pipeline job failed'}</span>
            </div>
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
              disabled={isBusy || batchSize <= 10}
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
              disabled={isBusy || batchSize >= 200}
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

      {/* Danger Zone: Wipe Bronze (Raw Staging) Layer */}
      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={() => setShowBronzeConfirm(true)}
          disabled={isBusy || isClearingBronze}
          title="Delete ALL raw scraped jobs from the bronze staging tables"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/50 text-xs font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isClearingBronze ? (
            <RefreshDouble className="w-4 h-4 animate-spin" />
          ) : (
            <Trash className="w-4 h-4" />
          )}
          <span>{isClearingBronze ? 'Clearing…' : 'Clear Bronze DB'}</span>
        </button>
      </div>

      {/* Clear Bronze Confirmation Modal */}
      {showBronzeConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isClearingBronze && setShowBronzeConfirm(false)}
        >
          <div
            className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-lg shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                <WarningTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-semibold font-heading text-white">
                  Clear the whole bronze database?
                </h3>
                <p className="text-xs text-[#9ca3af] leading-relaxed font-sans">
                  This permanently deletes <strong className="text-rose-300">all raw scraped jobs</strong>{' '}
                  from the bronze staging tables (Indeed, LinkedIn and Wellfound). Cleaned unified
                  jobs are kept. This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                disabled={isClearingBronze}
                onClick={() => setShowBronzeConfirm(false)}
                className="p-1 rounded-md text-[#9ca3af] hover:text-white hover:bg-[#252525] transition-colors"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]">
              <button
                type="button"
                disabled={isClearingBronze}
                onClick={() => setShowBronzeConfirm(false)}
                className="px-3.5 py-1.5 rounded-md bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-[#d1d5db] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingBronze}
                onClick={() => {
                  setShowBronzeConfirm(false);
                  void handleClearBronze();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-sans font-semibold shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClearingBronze ? (
                  <>
                    <RefreshDouble className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash className="w-3.5 h-3.5" />
                    <span>Clear Bronze DB</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SquareParserActions;
