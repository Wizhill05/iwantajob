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

type FilterTab = 'all' | 'scrapes' | 'parses' | 'errors';

export function RecentActivityLog() {
  const { logs, clearLogs } = useActivity();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter((entry) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'scrapes') return entry.level === 'SCRAPE';
    if (activeFilter === 'parses') return entry.level === 'PARSE';
    if (activeFilter === 'errors')
      return entry.level === 'ERROR' || entry.level === 'WARN';
    return true;
  });

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
    <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-[#3ecf8e]" />
          <div>
            <h3 className="text-sm font-semibold font-heading text-white">
              Recent Activity Feed
            </h3>
            <p className="text-[11px] font-mono text-[#9ca3af]">
              Live operational event stream and latency diagnostics
            </p>
          </div>
        </div>

        {/* Right Actions: Filter Tabs + Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Pills */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#202020] border border-[#262626] text-xs font-mono">
            {(['all', 'scrapes', 'parses', 'errors'] as FilterTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFilter(tab)}
                  className={cn(
                    'px-2.5 py-1 rounded-md capitalize transition-all',
                    activeFilter === tab
                      ? 'bg-[#181818] text-[#3ecf8e] font-medium border border-[#3ecf8e]/30 shadow-sm'
                      : 'text-[#9ca3af] hover:text-white'
                  )}
                >
                  {tab}
                </button>
              )
            )}
          </div>

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

          {/* View Full System Logs */}
          <Link
            href="/logs"
            title="View system console"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors text-xs font-mono"
          >
            <span>Full Console</span>
            <OpenNewWindow className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Logs Table / List */}
      {filteredLogs.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-[#6b7280] mb-3">
            <InfoCircle className="w-5 h-5" />
          </div>
          <Text className="text-xs font-mono font-medium text-[#9ca3af]">
            No activity logged for this filter
          </Text>
          <Text className="text-[11px] text-[#6b7280] mt-1">
            Trigger a scrape or normalization run to see live execution events.
          </Text>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-[#262626] overflow-hidden">
          {filteredLogs.slice(0, 15).map((log: LogEntry) => {
            const isExpanded = expandedLogId === log.id;
            const hasDetails = Boolean(log.details);

            return (
              <div
                key={log.id}
                className="py-2.5 px-2 hover:bg-[#202020]/40 rounded-lg transition-colors font-mono text-xs"
              >
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 cursor-pointer select-none',
                    !hasDetails && 'cursor-default'
                  )}
                  onClick={() => hasDetails && toggleExpand(log.id)}
                >
                  {/* Left: Time, Level Badge, Source, Message */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-[11px] text-[#6b7280] shrink-0">
                      {formatLogTime(log.timestamp)}
                    </span>

                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border shrink-0',
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
                      <span className="text-[11px] text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-0.5 rounded border border-[#3ecf8e]/20">
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
        </div>
      )}
    </Card>
  );
}

export default RecentActivityLog;
