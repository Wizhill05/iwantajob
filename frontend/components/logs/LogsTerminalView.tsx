'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Terminal,
  Search,
  Trash,
  Download,
  Copy,
  Check,
  NavArrowDown,
  NavArrowRight,
  Play,
  Pause,
  Xmark,
  InfoCircle,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from '@/lib/types';

type LevelFilter = 'ALL' | LogLevel;

export function LogsTerminalView() {
  const { logs, clearLogs, addLog } = useActivity();

  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter logs by level and search query
  const filteredLogs = useMemo(() => {
    let result = logs.filter((log) => {
      // Level filter
      if (selectedLevel !== 'ALL' && log.level !== selectedLevel) {
        return false;
      }
      // Text search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const msgMatch = log.message.toLowerCase().includes(query);
        const sourceMatch = log.source.toLowerCase().includes(query);
        const levelMatch = log.level.toLowerCase().includes(query);
        const timeMatch = log.timestamp.toLowerCase().includes(query);
        const detailsMatch = log.details
          ? JSON.stringify(log.details).toLowerCase().includes(query)
          : false;

        if (!msgMatch && !sourceMatch && !levelMatch && !timeMatch && !detailsMatch) {
          return false;
        }
      }
      return true;
    });

    if (sortOrder === 'oldest') {
      result = [...result].reverse();
    }

    return result;
  }, [logs, selectedLevel, searchQuery, sortOrder]);

  // Counts by level
  const counts = useMemo(() => {
    const summary: Record<string, number> = {
      ALL: logs.length,
      INFO: 0,
      SCRAPE: 0,
      PARSE: 0,
      WARN: 0,
      ERROR: 0,
    };
    logs.forEach((log) => {
      if (summary[log.level] !== undefined) {
        summary[log.level] += 1;
      }
    });
    return summary;
  }, [logs]);

  // Handle auto-scroll lock
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      if (sortOrder === 'newest') {
        scrollContainerRef.current.scrollTop = 0;
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [logs.length, autoScroll, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLogIds(new Set(filteredLogs.map((l) => l.id)));
  };

  const collapseAll = () => {
    setExpandedLogIds(new Set());
  };

  const handleCopyLogs = async () => {
    try {
      const exportText = filteredLogs
        .map(
          (l) =>
            `[${l.timestamp}] [${l.level}] [${l.source}] ${l.message}${
              l.durationMs !== undefined ? ` (${l.durationMs}ms)` : ''
            }${l.details ? `\nDetails: ${JSON.stringify(l.details, null, 2)}` : ''}`
        )
        .join('\n');

      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `iwantajob-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerateSampleLogs = () => {
    addLog('INFO', 'system', 'Gateway health check probe passed [200 OK]', 12);
    addLog('SCRAPE', 'indeed', 'Fetched 25 raw job postings for "software engineer" India', 450, {
      what: 'software engineer',
      where: 'India',
      limit: 25,
      returned_count: 25,
    });
    addLog('PARSE', 'indeed', 'Normalized 25 raw Indeed postings into unified_jobs schema', 310, {
      source: 'indeed',
      processed: 25,
      promoted: 25,
      errors: [],
    });
    addLog('WARN', 'linkedin', 'Rate throttle threshold reached; switching to exponential backoff', 180, {
      threshold_pct: 85,
      retry_after_sec: 5,
    });
    addLog('SCRAPE', 'wellfound', 'Parsed SSR Apollo state from /jobs/ai-engineer-india', 620, {
      role: 'ai-engineer',
      location: 'india',
      apollo_nodes_extracted: 14,
    });
  };

  const getLevelStyle = (level: LogLevel) => {
    switch (level) {
      case 'INFO':
        return {
          tag: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
          text: 'text-sky-300',
        };
      case 'SCRAPE':
        return {
          tag: 'text-[#3ecf8e] bg-[#3ecf8e]/10 border-[#3ecf8e]/20',
          text: 'text-[#3ecf8e]',
        };
      case 'PARSE':
        return {
          tag: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
          text: 'text-purple-300',
        };
      case 'WARN':
        return {
          tag: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          text: 'text-amber-300',
        };
      case 'ERROR':
        return {
          tag: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
          text: 'text-rose-300',
        };
      default:
        return {
          tag: 'text-neutral-400 bg-neutral-800 border-neutral-700',
          text: 'text-neutral-300',
        };
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const ms = String(date.getMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${ms}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col space-y-3 font-mono">
      {/* Control Bar: Filters, Search, Actions */}
      <div className="bg-[#181818] border border-[#262626] rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Level Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'INFO', 'SCRAPE', 'PARSE', 'WARN', 'ERROR'] as LevelFilter[]).map((lvl) => {
            const count = counts[lvl] || 0;
            const isSelected = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 border select-none',
                  isSelected
                    ? lvl === 'ALL'
                      ? 'bg-neutral-800 text-white border-neutral-600 font-semibold'
                      : lvl === 'SCRAPE'
                      ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/40 font-semibold'
                      : lvl === 'PARSE'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/40 font-semibold'
                      : lvl === 'ERROR'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 font-semibold'
                      : lvl === 'WARN'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 font-semibold'
                      : 'bg-sky-500/15 text-sky-300 border-sky-500/40 font-semibold'
                    : 'bg-[#202020] text-[#9ca3af] border-[#262626] hover:text-white hover:border-[#383838]'
                )}
              >
                <span>{lvl}</span>
                <span
                  className={cn(
                    'text-[10px] px-1 rounded',
                    isSelected ? 'bg-black/30' : 'bg-[#181818] text-[#6b7280]'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-full bg-[#121212] border border-[#262626] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e]/50 focus:ring-1 focus:ring-[#3ecf8e]/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
              >
                <Xmark className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Auto-scroll toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll((prev) => !prev)}
            title={autoScroll ? 'Auto-scroll is locked to latest entry' : 'Auto-scroll paused'}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors whitespace-nowrap',
              autoScroll
                ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                : 'bg-[#202020] text-[#9ca3af] border-[#262626] hover:text-white'
            )}
          >
            {autoScroll ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span className="hidden md:inline">Auto-scroll</span>
          </button>

          {/* Sort Order Toggle */}
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
            title={`Showing ${sortOrder} first`}
            className="px-2.5 py-1 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white text-xs font-mono transition-colors whitespace-nowrap"
          >
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </button>

          {/* Copy Logs */}
          <button
            type="button"
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            title="Copy logs to clipboard"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white hover:border-[#383838] text-xs font-mono transition-colors disabled:opacity-40"
          >
            {copied ? <Check className="w-3 h-3 text-[#3ecf8e]" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredLogs.length === 0}
            title="Export filtered logs as JSON"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white hover:border-[#383838] text-xs font-mono transition-colors disabled:opacity-40"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            onClick={clearLogs}
            disabled={logs.length === 0}
            title="Clear all log entries"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-rose-400 hover:border-rose-500/30 text-xs font-mono transition-colors disabled:opacity-40"
          >
            <Trash className="w-3 h-3" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Monospace Terminal Body */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Terminal Title Bar */}
        <div className="bg-[#121212] px-4 py-2.5 border-b border-[#202020] flex items-center justify-between text-xs select-none">
          {/* Window dots decoration & session title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#262626] inline-block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#262626] inline-block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#262626] inline-block"></span>
            </div>
            <div className="flex items-center gap-1.5 text-[#9ca3af]">
              <Terminal className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span className="text-white font-medium">system.log</span>
              <span className="text-[#6b7280]">{"// opencode-worker-stdout"}</span>
            </div>
          </div>

          {/* Terminal Right Info & Accordion Batch Toggles */}
          <div className="flex items-center gap-3 text-[11px] text-[#6b7280]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="hover:text-white transition-colors"
                title="Expand all details"
              >
                Expand all
              </button>
              <span>/</span>
              <button
                type="button"
                onClick={collapseAll}
                className="hover:text-white transition-colors"
                title="Collapse all details"
              >
                Collapse all
              </button>
            </div>

            <span className="hidden sm:inline text-[#262626]">|</span>

            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  autoScroll ? 'bg-[#3ecf8e] animate-pulse' : 'bg-[#6b7280]'
                )}
              ></span>
              <span className={autoScroll ? 'text-[#3ecf8e]' : 'text-[#6b7280]'}>
                {autoScroll ? 'STREAMING' : 'PAUSED'}
              </span>
            </div>

            <span className="text-[#9ca3af]">
              {filteredLogs.length} of {logs.length} events
            </span>
          </div>
        </div>

        {/* Scrollable Log Stream */}
        <div
          ref={scrollContainerRef}
          className="p-4 overflow-y-auto max-h-[580px] min-h-[380px] text-xs font-mono space-y-1 divide-y divide-[#181818]/60"
        >
          {filteredLogs.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[#181818] border border-[#262626] flex items-center justify-center text-[#6b7280]">
                <InfoCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-medium">No log events recorded</p>
                <p className="text-[#6b7280] text-[11px] max-w-md">
                  {logs.length > 0
                    ? `No events match level "${selectedLevel}" and search query "${searchQuery}".`
                    : 'System console is waiting for incoming operations from Scraper Lab or Normalization Pipeline.'}
                </p>
              </div>
              {logs.length === 0 && (
                <button
                  type="button"
                  onClick={handleGenerateSampleLogs}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e] hover:bg-[#3ecf8e]/20 transition-all text-xs font-medium"
                >
                  Generate sample diagnostic telemetry
                </button>
              )}
            </div>
          ) : (
            filteredLogs.map((log: LogEntry) => {
              const isExpanded = expandedLogIds.has(log.id);
              const hasDetails = Boolean(log.details);
              const style = getLevelStyle(log.level);

              return (
                <div
                  key={log.id}
                  className="pt-1.5 pb-1.5 hover:bg-[#141414] px-2 rounded-md transition-colors"
                >
                  <div
                    className={cn(
                      'flex items-start justify-between gap-3 select-text',
                      hasDetails && 'cursor-pointer'
                    )}
                    onClick={() => hasDetails && toggleExpand(log.id)}
                  >
                    {/* Log prefix: Timestamp + Level Tag + Source */}
                    <div className="flex items-start gap-2.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                      {/* Timestamp */}
                      <span className="text-[#6b7280] text-[11px] shrink-0 select-none pt-0.5">
                        [{formatTimestamp(log.timestamp)}]
                      </span>

                      {/* Level Badge */}
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[10px] uppercase font-bold border shrink-0 select-none',
                          style.tag
                        )}
                      >
                        [{log.level}]
                      </span>

                      {/* Source */}
                      <span className="text-neutral-400 font-semibold shrink-0 select-none pt-0.5">
                        [{log.source}]
                      </span>

                      {/* Message */}
                      <span className="text-neutral-200 break-words flex-1 pt-0.5">
                        {log.message}
                      </span>
                    </div>

                    {/* Right: Latency duration & Accordion Arrow */}
                    <div className="flex items-center gap-2 shrink-0 select-none pt-0.5">
                      {log.durationMs !== undefined && (
                        <span className="text-[11px] text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-0.5 rounded border border-[#3ecf8e]/20">
                          +{log.durationMs}ms
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

                  {/* Expandable JSON / Structured Details Block */}
                  {isExpanded && hasDetails && (
                    <div className="mt-2 ml-4 p-3 rounded-lg bg-[#050505] border border-[#222222] text-[11px] overflow-x-auto relative">
                      <div className="flex items-center justify-between text-[10px] text-[#6b7280] border-b border-[#1c1c1c] pb-1.5 mb-2">
                        <span>Payload Metadata & Context</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              typeof log.details === 'string'
                                ? log.details
                                : JSON.stringify(log.details, null, 2)
                            );
                          }}
                          className="hover:text-[#3ecf8e] transition-colors"
                        >
                          Copy Payload
                        </button>
                      </div>
                      <pre className="text-[#a3e635] whitespace-pre-wrap leading-relaxed font-mono">
                        {typeof log.details === 'string'
                          ? log.details
                          : JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Status Footer */}
        <div className="bg-[#121212] px-4 py-2 border-t border-[#202020] flex items-center justify-between text-[11px] text-[#6b7280]">
          <div className="flex items-center gap-2">
            <span className="text-[#3ecf8e]">&gt;</span>
            <span>iwantajob staging daemon active</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Buffer: max 100 entries</span>
            <span className="text-[#262626]">|</span>
            <span>UTF-8</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogsTerminalView;
