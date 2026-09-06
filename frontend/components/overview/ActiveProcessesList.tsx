'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Refresh,
  CheckCircle,
  XmarkCircle,
  NavArrowDown,
  NavArrowRight,
  OpenNewWindow,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { cn } from '@/lib/utils';
import type { ActiveProcess } from '@/lib/types';

export function ActiveProcessesList() {
  const { activeProcesses } = useActivity();
  const [now, setNow] = useState<number>(Date.now());
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

  // Update elapsed seconds ticker every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const runningCount = activeProcesses.filter(
    (p) => p.status === 'running'
  ).length;

  const toggleExpand = (id: string) => {
    setExpandedProcessId((prev) => (prev === id ? null : id));
  };

  const formatStartTime = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  };

  const displayedProcesses = activeProcesses.slice(0, 5);

  return (
    <div className="-mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-lg bg-transparent sm:bg-[#181818] p-3.5 sm:p-5 shadow-none sm:shadow-sm">
      <div className="flex items-center justify-between pb-3 lg:pb-4 border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-[#3ecf8e]" />
          <h3 className="text-sm font-semibold font-heading text-white">
            Active Process Monitor
          </h3>
        </div>

        {runningCount > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[11px] font-sans font-medium text-[#3ecf8e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e] animate-ping"></span>
            <span className="font-mono">{runningCount}</span> Running
          </span>
        )}
      </div>

      {activeProcesses.length === 0 ? (
        <div className="py-8 lg:py-10 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-[#6b7280] mb-3">
            <Activity className="w-5 h-5" />
          </div>
          <p className="text-xs font-sans font-medium text-[#9ca3af]">
            No active scraper or normalization jobs running
          </p>
          <p className="text-[11px] font-sans text-[#6b7280] mt-1 max-w-sm">
            Jobs launched from Scraper Lab or the Normalization Pipeline will be tracked here live.
          </p>
        </div>
      ) : (
        <div className="mt-2 lg:mt-3 divide-y divide-[#262626] overflow-hidden">
          {displayedProcesses.map((proc: ActiveProcess) => {
            const isExpanded = expandedProcessId === proc.id;
            const hasDetails = Boolean(
              (proc.params && Object.keys(proc.params).length > 0) || proc.message
            );
            const elapsedSec = Math.max(
              0,
              ((now - proc.startTime) / 1000)
            ).toFixed(1);

            return (
              <div
                key={proc.id}
                className="py-2.5 px-1 sm:px-2 hover:bg-[#202020]/40 rounded-lg transition-colors text-xs font-sans"
              >
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 cursor-pointer select-none',
                    !hasDetails && 'cursor-default'
                  )}
                  onClick={() => hasDetails && toggleExpand(proc.id)}
                >
                  {/* Left: Time, Type Badge, Provider, Message */}
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-[#6b7280] shrink-0">
                      {formatStartTime(proc.startTime)}
                    </span>

                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border shrink-0',
                        proc.type === 'scrape'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                          : 'bg-emerald-500/10 text-[#3ecf8e] border-emerald-500/20'
                      )}
                    >
                      {proc.type.toUpperCase()}
                    </span>

                    <span className="text-white font-medium capitalize shrink-0">
                      {proc.provider}
                    </span>

                    <span className="text-[#9ca3af] truncate">
                      {proc.message ||
                        (proc.params
                          ? Object.entries(proc.params)
                              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                              .join(' ')
                          : proc.status)}
                    </span>
                  </div>

                  {/* Right: Elapsed Pill, Status Icon / Dot & Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-0.5 rounded border border-[#3ecf8e]/20">
                      {proc.status === 'running' ? `${elapsedSec}s` : proc.status}
                    </span>

                    {proc.status === 'running' ? (
                      <Refresh className="w-3.5 h-3.5 text-[#3ecf8e] animate-spin shrink-0" />
                    ) : proc.status === 'completed' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0" />
                    ) : (
                      <XmarkCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        aria-label="Toggle process details"
                        className="text-[#6b7280] hover:text-white p-0.5"
                      >
                        {isExpanded ? (
                          <NavArrowDown className="w-3.5 h-3.5" />
                        ) : (
                          <NavArrowRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && hasDetails && (
                  <div className="mt-2 p-2.5 rounded bg-[#131313] border border-[#262626] text-[11px] text-[#9ca3af] overflow-x-auto">
                    {proc.message && (
                      <p className="text-[#e5e7eb] font-sans mb-1.5">{proc.message}</p>
                    )}
                    {proc.params && Object.keys(proc.params).length > 0 && (
                      <pre className="font-mono whitespace-pre-wrap">
                        {JSON.stringify(proc.params, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Redirect to full logs page if more than 5 processes exist */}
          {activeProcesses.length > 5 && (
            <div className="pt-2.5 mt-1 border-t border-[#262626] flex items-center justify-between text-xs font-sans text-[#9ca3af]">
              <span>Showing 5 of {activeProcesses.length} processes</span>
              <Link
                href="/logs"
                className="flex items-center gap-1 text-[#3ecf8e] hover:underline font-medium"
              >
                <span>View All</span>
                <OpenNewWindow className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ActiveProcessesList;
