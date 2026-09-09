'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Trash,
  Download,
  Copy,
  Check,
  NavArrowDown,
  NavArrowUp,
  NavArrowRight,
  Play,
  Pause,
  Xmark,
  Filter,
  Refresh,
  Database,
  WarningTriangle,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from '@/lib/types';

type LevelFilter = 'ALL' | LogLevel;

export function LogsTerminalView() {
  const { logs, clearLogs, addLog } = useActivity();

  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Loading indicator states for click actions
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isClearingTestData, setIsClearingTestData] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Active filter count (excluding default 'ALL' and 'all')
  const activeFilterCount =
    (selectedLevel !== 'ALL' ? 1 : 0) +
    (selectedSource !== 'all' ? 1 : 0) +
    (searchQuery.trim() !== '' ? 1 : 0);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs.filter((log) => {
      // Source filter
      if (selectedSource !== 'all' && log.source.toLowerCase() !== selectedSource.toLowerCase()) {
        return false;
      }
      // Level filter
      if (selectedLevel !== 'ALL' && log.level !== selectedLevel) {
        return false;
      }
      // Search query
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
  }, [logs, selectedLevel, selectedSource, searchQuery, sortOrder]);

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

  const handleCopyLogs = async () => {
    if (isCopying || filteredLogs.length === 0) return;
    setIsCopying(true);
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
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    } catch {
      // Clipboard unavailable
    } finally {
      setIsCopying(false);
    }
  };

  const handleExportJson = () => {
    if (isExporting || filteredLogs.length === 0) return;
    setIsExporting(true);
    setTimeout(() => {
      try {
        const dataStr =
          'data:text/json;charset=utf-8,' +
          encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute(
          'download',
          `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        );
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } finally {
        setIsExporting(false);
      }
    }, 400);
  };

  const handleClearLogs = () => {
    if (isClearing || logs.length === 0) return;
    setIsClearing(true);
    setTimeout(() => {
      clearLogs();
      setIsClearing(false);
    }, 300);
  };

  const handleClearTestData = async () => {
    if (isClearingTestData) return;
    setIsClearingTestData(true);
    const start = Date.now();
    try {
      const res = await api.clearTestData();
      addLog(
        'INFO',
        'system',
        `Cleared ${res.total_deleted} test row(s) from database`,
        Date.now() - start,
        res.deleted
      );
    } catch (err) {
      addLog(
        'ERROR',
        'system',
        `Failed to clear test data: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - start
      );
    } finally {
      setIsClearingTestData(false);
    }
  };

  const resetFilters = () => {
    setSelectedLevel('ALL');
    setSelectedSource('all');
    setSearchQuery('');
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
      return `${hours}:${minutes}:${seconds}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-3 w-full min-w-0">
      {/* Top Action Toolbar: Search + Filter Toggle + Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full min-w-0">
        {/* Mobile Row 1 / Desktop Flex-1: Full-width Search Bar */}
        <div className="relative flex-1 min-w-0 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full bg-[#181818] border border-[#262626] rounded-xl pl-9 pr-8 h-10 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white p-1"
            >
              <Xmark className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mobile Row 2 / Desktop Right Cluster: Filters on left, action icons on right */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          {/* Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-2 px-3.5 h-10 rounded-xl border text-xs font-sans font-medium transition-all shrink-0 select-none',
              isFilterOpen || activeFilterCount > 0
                ? 'bg-[#181818] border-[#3ecf8e] text-[#3ecf8e]'
                : 'bg-[#181818] border-[#262626] text-[#9ca3af] hover:text-white hover:border-[#383838]'
            )}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#3ecf8e] text-[#131313] font-mono text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {isFilterOpen ? (
              <NavArrowUp className="w-3.5 h-3.5" />
            ) : (
              <NavArrowDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* 4 Action Buttons Never Wrapping */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={() => setAutoScroll((prev) => !prev)}
              title={autoScroll ? 'Streaming live (click to pause)' : 'Paused (click to resume)'}
              className={cn(
                'w-10 h-10 rounded-xl border flex items-center justify-center transition-colors shrink-0',
                autoScroll
                  ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                  : 'bg-[#181818] text-[#9ca3af] border-[#262626] hover:text-white'
              )}
            >
              {autoScroll ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyLogs}
              disabled={filteredLogs.length === 0 || isCopying}
              title="Copy visible logs"
              className="w-10 h-10 rounded-xl border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              {isCopying ? (
                <Refresh className="w-4 h-4 animate-spin text-[#3ecf8e]" />
              ) : copySuccess ? (
                <Check className="w-4 h-4 text-[#3ecf8e]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            {/* Export Button */}
            <button
              type="button"
              onClick={handleExportJson}
              disabled={filteredLogs.length === 0 || isExporting}
              title="Export logs as JSON"
              className="w-10 h-10 rounded-xl border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              {isExporting ? (
                <Refresh className="w-4 h-4 animate-spin text-[#3ecf8e]" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>

            {/* Clear Logs Button */}
            <button
              type="button"
              onClick={handleClearLogs}
              disabled={logs.length === 0 || isClearing}
              title="Clear all logs"
              className="w-10 h-10 rounded-xl border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-rose-400 hover:border-rose-500/30 transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              {isClearing ? (
                <Refresh className="w-4 h-4 animate-spin text-rose-400" />
              ) : (
                <Trash className="w-4 h-4" />
              )}
            </button>

            {/* Clear Test Data Button — opens confirmation modal */}
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearingTestData}
              title="Clear test data from database (rows with test_/wf_/li_ IDs)"
              className="w-10 h-10 rounded-xl border border-[#262626] bg-[#181818] text-[#9ca3af] hover:text-amber-400 hover:border-amber-500/30 transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              {isClearingTestData ? (
                <Refresh className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Database className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Filter Tray (like Jobs page) */}
      {isFilterOpen && (
        <div className="bg-[#181818] border border-[#262626] rounded-xl p-3.5 space-y-3 animate-in fade-in-50 slide-in-from-top-1 duration-150 text-xs font-sans">
          <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
            <span className="font-semibold text-white">Log Filters</span>
            <div className="flex items-center gap-3">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[#9ca3af] hover:text-white transition-colors"
                >
                  Reset all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="text-[#3ecf8e] hover:underline"
              >
                Done
              </button>
            </div>
          </div>

          {/* Level Filter Pills */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[#6b7280]">Level:</span>
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
                      'px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 border select-none',
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
                        : 'bg-[#141414] text-[#9ca3af] border-[#262626] hover:text-white'
                    )}
                  >
                    <span>{lvl}</span>
                    <span className="text-[10px] text-[#6b7280] font-sans">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source Filter Pills */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-[#6b7280]">Source:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'All Sources' },
                { id: 'linkedin', label: 'LinkedIn' },
                { id: 'indeed', label: 'Indeed' },
                { id: 'wellfound', label: 'Wellfound' },
                { id: 'system', label: 'System' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSource(s.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs transition-all border select-none',
                    selectedSource === s.id
                      ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30 font-medium'
                      : 'bg-[#141414] text-[#9ca3af] border-[#262626] hover:text-white'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Order Toggle */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] text-[#6b7280]">Order:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSortOrder('newest')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs border select-none',
                  sortOrder === 'newest'
                    ? 'bg-[#262626] text-white border-neutral-600 font-medium'
                    : 'bg-[#141414] text-[#9ca3af] border-[#262626] hover:text-white'
                )}
              >
                Newest First
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('oldest')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs border select-none',
                  sortOrder === 'oldest'
                    ? 'bg-[#262626] text-white border-neutral-600 font-medium'
                    : 'bg-[#141414] text-[#9ca3af] border-[#262626] hover:text-white'
                )}
              >
                Oldest First
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Container */}
      <div className="bg-[#0e0e0e] border border-[#262626] rounded-xl overflow-hidden shadow-2xl flex flex-col w-full min-w-0">
        {/* Scrollable Log Stream */}
        <div
          ref={scrollContainerRef}
          className="p-3 sm:p-4 overflow-y-auto min-h-[500px] max-h-[75vh] text-xs font-mono space-y-1 divide-y divide-[#181818]/60 w-full min-w-0 overflow-x-hidden"
        >
          {filteredLogs.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center font-sans text-xs text-[#6b7280]">
              <span>No logs recorded yet</span>
            </div>
          ) : (
            filteredLogs.map((log: LogEntry) => {
              const isExpanded = expandedLogIds.has(log.id);
              const hasDetails = Boolean(log.details);
              const style = getLevelStyle(log.level);

              return (
                <div
                  key={log.id}
                  className="pt-1.5 pb-1.5 hover:bg-[#141414] px-2 rounded-md transition-colors w-full min-w-0 overflow-hidden"
                >
                  <div
                    className={cn(
                      'flex items-start justify-between gap-2 select-text min-w-0 w-full',
                      hasDetails && 'cursor-pointer'
                    )}
                    onClick={() => hasDetails && toggleExpand(log.id)}
                  >
                    {/* Log prefix: Timestamp + Level Tag + Source + Message */}
                    <div className="flex items-start gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                      {/* Timestamp */}
                      <span className="text-[#6b7280] text-[11px] shrink-0 select-none pt-0.5">
                        {formatTimestamp(log.timestamp)}
                      </span>

                      {/* Level Badge */}
                      <span
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 select-none font-sans',
                          style.tag
                        )}
                      >
                        {log.level}
                      </span>

                      {/* Source */}
                      <span className="text-neutral-400 font-semibold shrink-0 select-none pt-0.5">
                        [{log.source}]
                      </span>

                      {/* Message */}
                      <span className="text-neutral-200 break-words flex-1 min-w-0 pt-0.5">
                        {log.message}
                      </span>
                    </div>

                    {/* Right: Latency duration & Chevron */}
                    <div className="flex items-center gap-1.5 shrink-0 select-none pt-0.5">
                      {log.durationMs !== undefined && (
                        <span className="text-[10px] text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-0.5 rounded border border-[#3ecf8e]/20 font-mono">
                          +{log.durationMs}ms
                        </span>
                      )}

                      {hasDetails && (
                        <span className="text-[#6b7280]">
                          {isExpanded ? (
                            <NavArrowDown className="w-3.5 h-3.5" />
                          ) : (
                            <NavArrowRight className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expandable JSON / Structured Details Block */}
                  {isExpanded && hasDetails && (
                    <div className="mt-2 ml-2 sm:ml-4 p-3 rounded-lg bg-[#050505] border border-[#222222] text-[11px] overflow-x-auto relative max-w-full">
                      <pre className="text-[#a3e635] whitespace-pre-wrap break-all leading-relaxed font-mono">
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
      </div>

      {/* Clear Test Data Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isClearingTestData && setShowClearConfirm(false)}
        >
          <div
            className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-lg shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                <WarningTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-semibold font-heading text-white">
                  Clear test data from the database?
                </h3>
                <p className="text-xs text-[#9ca3af] leading-relaxed font-sans">
                  This permanently deletes all test-seeded rows (IDs starting with{' '}
                  <strong className="text-amber-300 font-mono">test_</strong>,{' '}
                  <strong className="text-amber-300 font-mono">wf_</strong> or{' '}
                  <strong className="text-amber-300 font-mono">li_</strong>) from the raw
                  and unified tables. This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                disabled={isClearingTestData}
                onClick={() => setShowClearConfirm(false)}
                className="p-1 rounded-md text-[#9ca3af] hover:text-white hover:bg-[#252525] transition-colors"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]">
              <button
                type="button"
                disabled={isClearingTestData}
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 rounded-md bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-[#d1d5db] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingTestData}
                onClick={() => {
                  setShowClearConfirm(false);
                  void handleClearTestData();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-sans font-semibold shadow-lg shadow-amber-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClearingTestData ? (
                  <>
                    <Refresh className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5" />
                    <span>Clear Test Data</span>
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

export default LogsTerminalView;


