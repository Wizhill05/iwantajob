'use client';

import React from 'react';
import {
  Database,
  CheckCircle,
} from 'iconoir-react';
import type { ParsingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface KpiGridProps {
  status: ParsingStatus | null;
  isLoading?: boolean;
  latencyMs?: number | null;
  isOnline?: boolean | null;
}

export function KpiGrid({
  status,
  isLoading = false,
}: KpiGridProps) {
  const totalRaw = status
    ? (status.indeed?.total_raw || 0) +
      (status.linkedin?.total_raw || 0) +
      (status.wellfound?.total_raw || 0)
    : 0;

  const unifiedTotal = status?.unified_total || 0;

  if (isLoading && !status) {
    return (
      <div className="grid grid-cols-2 gap-4 py-4 sm:py-6 bg-transparent">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-28 sm:h-32 bg-transparent px-4 py-4 animate-pulse flex flex-col items-center justify-center text-center space-y-3"
          >
            <div className="h-10 sm:h-12 w-28 bg-[#1f1f1f] rounded"></div>
            <div className="h-3 w-32 bg-[#1a1a1a] rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 py-4 sm:py-6 bg-transparent">
      {/* 1. Bronze Raw Unfiltered Data */}
      <div className="bg-transparent px-2 sm:px-4 py-2 flex flex-col items-center justify-center text-center">
        <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight bg-gradient-to-br from-[#d97706] via-[#b45309] to-[#78350f] bg-clip-text text-transparent drop-shadow-sm select-none">
          {totalRaw.toLocaleString()}
        </div>

        <div className="mt-2 sm:mt-3 text-xs font-medium tracking-wide text-[#9ca3af]">
          Unfiltered Raw Data
        </div>
      </div>

      {/* 2. Silver Clean Parsed Data */}
      <div className="bg-transparent px-2 sm:px-4 py-2 flex flex-col items-center justify-center text-center">
        <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight bg-gradient-to-br from-[#ffffff] via-[#e2e8f0] to-[#64748b] bg-clip-text text-transparent drop-shadow-sm select-none">
          {unifiedTotal.toLocaleString()}
        </div>

        <div className="mt-2 sm:mt-3 text-xs font-medium tracking-wide text-[#9ca3af]">
          Clean Parsed Data
        </div>
      </div>
    </div>
  );
}

export default KpiGrid;
