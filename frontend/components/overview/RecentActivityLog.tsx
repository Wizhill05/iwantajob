'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, Text } from '@tremor/react';
import {
  Terminal,
  Trash,
  OpenNewWindow,
  NavArrowDown,
  NavArrowRight,
  Clock,
  CheckCircle,
  XmarkCircle,
  InfoCircle,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from '@/lib/types';

export function RecentActivityLog() {
  const { logs, clearLogs } = useActivity();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'SCRAPE':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'PARSE':
        return 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20';
      case 'ERROR':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'WARN':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'INFO':
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const formatLogTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="-mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-lg bg-transparent sm:bg-[#181818] p-3.5 sm:p-5 shadow-none sm:shadow-sm">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 pb-3 lg:pb-4 border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-[#3ecf8e]" />
          <h3 className="text-sm font-semibold font-heading text-white">
            Recent Activity Feed
          </h3>
          <Link
            href="/logs"
            title="View full console"
            className="text-[#9ca3af] hover:text-[#3ecf8e] transition-colors p-1 rounded hover:bg-[#202020]"
          >
            <OpenNewWindow className="w-4 h-4" />
          </Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Clear Logs */}
          <button
            type="button"
            onClick={clearLogs}
            disabled={logs.length === 0}
            title="Clear logs"
            className="p-1.5 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-rose-400 hover:border-rose-500/30 transition-colors disabled:opacity-40"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs Table / List */}
      {logs.length === 0 ? (
        <div className="py-8 lg:py-12 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-[#6b7280] mb-3">
            <InfoCircle className="w-5 h-5" />
          </div>
          <p className="text-xs font-sans font-medium text-[#9ca3af]">
            No activity logged yet
          </p>
          <p className="text-[11px] font-sans text-[#6b7280] mt-1">
            Trigger a scrape or normalization run to see live execution events.
          </p>
        </div>
      ) : (
        <div className="mt-2 lg:mt-3 divide-y divide-[#262626] overflow-hidden">
          {logs.slice(0, 5).map((log: LogEntry) => {
            const isExpanded = expandedLogId === log.id;
            const hasDetails = Boolean(log.details);

            return (
              <div
                key={log.id}
                className="py-2.5 px-1 sm:px-2 hover:bg-[#202020]/40 rounded-lg transition-colors text-xs font-sans"
              >
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 cursor-pointer select-none',
                    !hasDetails && 'cursor-default'
                  )}
                  onClick={() => hasDetails && toggleExpand(log.id)}
                >
                  {/* Left: Time, Level Badge, Source, Message */}
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-[#6b7280] shrink-0">
                      {formatLogTime(log.timestamp)}
                    </span>

                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border shrink-0',
                        getLevelBadge(log.level)
                      )}
                    >
                      {log.level}
                    </span>

                    <span className="text-white font-medium capitalize shrink-0">
                      {log.source}
                    </span>

                    <span className="text-[#9ca3af] truncate">
                      {log.message}
                    </span>
                  </div>

                  {/* Right: Latency duration & expand toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    {log.durationMs !== undefined && (
                      <span className="text-[11px] font-mono text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-0.5 rounded border border-[#3ecf8e]/20">
                        {log.durationMs}ms
                      </span>
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        aria-label="Toggle details"
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
                    <pre className="font-mono whitespace-pre-wrap">
                      {typeof log.details === 'string'
                        ? log.details
                        : JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {/* Redirect to full logs page if more than 5 logs exist */}
          {logs.length > 5 && (
            <div className="pt-2.5 mt-1 border-t border-[#262626] flex items-center justify-between text-xs font-sans text-[#9ca3af]">
              <span>Showing 5 of {logs.length} events</span>
              <Link
                href="/logs"
                className="flex items-center gap-1 text-[#3ecf8e] hover:underline font-medium"
              >
                <span>View Full Console</span>
                <OpenNewWindow className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecentActivityLog;
