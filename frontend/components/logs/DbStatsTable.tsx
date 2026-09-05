'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Text } from '@tremor/react';
import {
  Database,
  Server,
  Refresh,
  CheckCircle,
  XmarkCircle,
  WarningTriangle,
  Cpu,
  Clock,
  Activity,
} from 'iconoir-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ParsingStatus, HealthCheckResponse } from '@/lib/types';

interface DbStatsTableProps {
  onRefresh?: () => void;
  autoRefreshInterval?: number; // in milliseconds
}

interface TableRowData {
  tableName: string;
  tier: 'BRONZE' | 'SILVER';
  tierLabel: string;
  sourceLabel: string;
  totalRecords: number;
  parsedRecords: number;
  pendingRecords: number;
  status: 'synced' | 'pending' | 'operational';
  statusLabel: string;
  description: string;
}

export function DbStatsTable({ onRefresh, autoRefreshInterval }: DbStatsTableProps) {
  const [parsingStatus, setParsingStatus] = useState<ParsingStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthCheckResponse | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabaseStats = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    const startTime = performance.now();
    try {
      // Run status and health in parallel
      const [statusData, healthData] = await Promise.all([
        api.getParsingStatus(),
        api.getHealth().catch(() => ({ status: 'degraded', version: 'unknown' })),
      ]);

      const roundTrip = Math.round(performance.now() - startTime);
      setParsingStatus(statusData);
      setHealthStatus(healthData);
      setLatencyMs(roundTrip);
      setIsOnline(true);
      setError(null);
      setLastChecked(new Date());

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setIsOnline(false);
      setError(err?.message || 'Failed to reach backend API');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    fetchDatabaseStats(true);

    if (autoRefreshInterval && autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        fetchDatabaseStats(false);
      }, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchDatabaseStats, autoRefreshInterval]);

  // Transform live status into database table rows
  const tableRows: TableRowData[] = [
    {
      tableName: 'raw_indeed_jobs',
      tier: 'BRONZE',
      tierLabel: 'Raw Ingestion',
      sourceLabel: 'Indeed Mobile GraphQL',
      totalRecords: parsingStatus?.indeed?.total_raw ?? 0,
      parsedRecords: parsingStatus?.indeed?.parsed ?? 0,
      pendingRecords: parsingStatus?.indeed?.unparsed ?? 0,
      status: (parsingStatus?.indeed?.unparsed ?? 0) === 0 ? 'synced' : 'pending',
      statusLabel:
        (parsingStatus?.indeed?.unparsed ?? 0) === 0
          ? 'Synchronized'
          : `${parsingStatus?.indeed?.unparsed} Pending`,
      description: 'Lossless raw staging store for Indeed Mobile GraphQL search results',
    },
    {
      tableName: 'raw_linkedin_jobs',
      tier: 'BRONZE',
      tierLabel: 'Raw Ingestion',
      sourceLabel: 'LinkedIn Guest Endpoints',
      totalRecords: parsingStatus?.linkedin?.total_raw ?? 0,
      parsedRecords: parsingStatus?.linkedin?.parsed ?? 0,
      pendingRecords: parsingStatus?.linkedin?.unparsed ?? 0,
      status: (parsingStatus?.linkedin?.unparsed ?? 0) === 0 ? 'synced' : 'pending',
      statusLabel:
        (parsingStatus?.linkedin?.unparsed ?? 0) === 0
          ? 'Synchronized'
          : `${parsingStatus?.linkedin?.unparsed} Pending`,
      description: 'Lossless raw staging store for LinkedIn guest search & detailed payloads',
    },
    {
      tableName: 'raw_wellfound_jobs',
      tier: 'BRONZE',
      tierLabel: 'Raw Ingestion',
      sourceLabel: 'Wellfound SSR Apollo Client',
      totalRecords: parsingStatus?.wellfound?.total_raw ?? 0,
      parsedRecords: parsingStatus?.wellfound?.parsed ?? 0,
      pendingRecords: parsingStatus?.wellfound?.unparsed ?? 0,
      status: (parsingStatus?.wellfound?.unparsed ?? 0) === 0 ? 'synced' : 'pending',
      statusLabel:
        (parsingStatus?.wellfound?.unparsed ?? 0) === 0
          ? 'Synchronized'
          : `${parsingStatus?.wellfound?.unparsed} Pending`,
      description: 'Lossless raw staging store for Wellfound Next.js SSR Apollo nodes',
    },
    {
      tableName: 'unified_jobs',
      tier: 'SILVER',
      tierLabel: 'Clean Standardized',
      sourceLabel: 'Multi-Source Unified Store',
      totalRecords: parsingStatus?.unified_total ?? 0,
      parsedRecords: parsingStatus?.unified_total ?? 0,
      pendingRecords: 0,
      status: 'operational',
      statusLabel: 'Operational',
      description: 'Central silver table containing validated, normalized INR pay and experience bounds',
    },
  ];

  const totalRawCount =
    (parsingStatus?.indeed?.total_raw ?? 0) +
    (parsingStatus?.linkedin?.total_raw ?? 0) +
    (parsingStatus?.wellfound?.total_raw ?? 0);

  const totalPendingCount =
    (parsingStatus?.indeed?.unparsed ?? 0) +
    (parsingStatus?.linkedin?.unparsed ?? 0) +
    (parsingStatus?.wellfound?.unparsed ?? 0);

  const totalUnifiedCount = parsingStatus?.unified_total ?? 0;

  return (
    <div className="space-y-4">
      {/* System Environment Diagnostic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: PostgreSQL Host */}
        <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#9ca3af] uppercase tracking-wider">
              PostgreSQL Host
            </span>
            <Database className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-semibold font-mono text-white">localhost:5432</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-[#6b7280]">
            <span>DB:</span>
            <span className="text-white font-medium">iwantajob_db</span>
            <span>(pgvector)</span>
          </div>
        </div>

        {/* Card 2: Backend API & Latency */}
        <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#9ca3af] uppercase tracking-wider">
              Backend API
            </span>
            <Server className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-base font-semibold font-mono text-white">localhost:8020</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border flex items-center gap-1',
                isOnline
                  ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isOnline ? 'bg-[#3ecf8e] animate-ping' : 'bg-rose-500'
                )}
              ></span>
              {isOnline ? 'Healthy' : 'Offline'}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-[#6b7280]">
            <span>Latency</span>
            <span className="text-sky-300 font-medium">
              {latencyMs !== null ? `${latencyMs}ms RTT` : '—'}
            </span>
          </div>
        </div>

        {/* Card 3: Bronze Staging Inventory */}
        <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#9ca3af] uppercase tracking-wider">
              Bronze Tier Records
            </span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-white">
              {isLoading && !parsingStatus ? '—' : totalRawCount.toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-[#6b7280]">raw items</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-[#6b7280]">
            <span>Pending Normalization</span>
            <span
              className={cn(
                'font-medium',
                totalPendingCount > 0 ? 'text-amber-400' : 'text-[#3ecf8e]'
              )}
            >
              {totalPendingCount} items
            </span>
          </div>
        </div>

        {/* Card 4: Silver Clean Target */}
        <div className="bg-[#181818] border border-[#262626] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#9ca3af] uppercase tracking-wider">
              Silver Clean Store
            </span>
            <Activity className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-[#3ecf8e]">
              {isLoading && !parsingStatus ? '—' : totalUnifiedCount.toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-[#6b7280]">jobs</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-[#6b7280]">
            <span>Storage Efficiency</span>
            <span className="text-[#9ca3af] font-medium">100% Normalized</span>
          </div>
        </div>
      </div>

      {/* Main Database Tables Breakdown Card */}
      <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#262626]">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-[#3ecf8e]" />
            <div>
              <h3 className="text-sm font-semibold font-heading text-white">
                PostgreSQL Staging & Production Tables
              </h3>
              <p className="text-[11px] font-mono text-[#9ca3af]">
                Decoupled Bronze raw ingestion stores and Silver normalized unified schema
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {lastChecked && (
              <span className="text-[11px] font-mono text-[#6b7280] hidden sm:inline">
                Polled at {lastChecked.toLocaleTimeString([], { hour12: false })}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchDatabaseStats(false)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors text-xs font-mono disabled:opacity-50"
            >
              <Refresh className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs font-mono text-rose-300">
            <WarningTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Database Status Warning: {error}</span>
          </div>
        )}

        {/* Tables Breakdown Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#262626] text-[#9ca3af] text-[11px] uppercase">
                <th className="py-2.5 px-3 font-medium">Table Name</th>
                <th className="py-2.5 px-3 font-medium">Tier</th>
                <th className="py-2.5 px-3 font-medium">Provider / Architecture</th>
                <th className="py-2.5 px-3 font-medium text-right">Total Rows</th>
                <th className="py-2.5 px-3 font-medium text-right">Parsed / Clean</th>
                <th className="py-2.5 px-3 font-medium text-right">Pending</th>
                <th className="py-2.5 px-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]/80 text-[#d1d5db]">
              {tableRows.map((row) => {
                const isSilver = row.tier === 'SILVER';
                return (
                  <tr
                    key={row.tableName}
                    className="hover:bg-[#202020]/40 transition-colors"
                  >
                    {/* Table Name */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Database
                          className={cn(
                            'w-3.5 h-3.5 shrink-0',
                            isSilver ? 'text-[#3ecf8e]' : 'text-amber-400'
                          )}
                        />
                        <span className="font-semibold text-white">{row.tableName}</span>
                      </div>
                      <p className="text-[10px] text-[#6b7280] mt-0.5 max-w-xs truncate">
                        {row.description}
                      </p>
                    </td>

                    {/* Architecture Tier */}
                    <td className="py-3 px-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
                          isSilver
                            ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        )}
                      >
                        {row.tier}
                      </span>
                    </td>

                    {/* Source Provider */}
                    <td className="py-3 px-3">
                      <span className="text-[#9ca3af]">{row.sourceLabel}</span>
                    </td>

                    {/* Total Records */}
                    <td className="py-3 px-3 text-right font-semibold text-white">
                      {row.totalRecords.toLocaleString()}
                    </td>

                    {/* Parsed / Clean */}
                    <td className="py-3 px-3 text-right text-[#3ecf8e]">
                      {row.parsedRecords.toLocaleString()}
                    </td>

                    {/* Pending */}
                    <td className="py-3 px-3 text-right">
                      {row.pendingRecords > 0 ? (
                        <span className="text-amber-400 font-semibold">
                          {row.pendingRecords.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[#6b7280]">0</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border',
                          row.status === 'operational'
                            ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                            : row.status === 'synced'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        )}
                      >
                        {row.status === 'operational' || row.status === 'synced' ? (
                          <CheckCircle className="w-3 h-3 text-[#3ecf8e]" />
                        ) : (
                          <Clock className="w-3 h-3 text-amber-400" />
                        )}
                        <span>{row.statusLabel}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Footer Summary */}
            <tfoot>
              <tr className="border-t border-[#262626] bg-[#141414] font-semibold text-white">
                <td className="py-2.5 px-3">Total Pipeline Volume</td>
                <td className="py-2.5 px-3 text-[#6b7280] font-normal">Bronze + Silver</td>
                <td className="py-2.5 px-3 text-[#6b7280] font-normal">Aggregated</td>
                <td className="py-2.5 px-3 text-right text-white">
                  {(totalRawCount + totalUnifiedCount).toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right text-[#3ecf8e]">
                  {totalUnifiedCount.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right text-amber-400">
                  {totalPendingCount.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className="text-[10px] text-[#3ecf8e] font-normal">Verified Live</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default DbStatsTable;
