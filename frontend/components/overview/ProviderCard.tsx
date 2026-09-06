'use client';

import React from 'react';
import Link from 'next/link';
import type { ProviderParsingStats } from '@/lib/types';
import { cn } from '@/lib/utils';

export type ProviderKey = 'indeed' | 'linkedin' | 'wellfound';

interface ProviderCardProps {
  provider: ProviderKey;
  stats?: ProviderParsingStats;
  isLoading?: boolean;
}

const PROVIDER_NAMES: Record<ProviderKey, string> = {
  indeed: 'Indeed',
  linkedin: 'LinkedIn',
  wellfound: 'Wellfound',
};

export function ProviderCard({
  provider,
  stats,
  isLoading = false,
}: ProviderCardProps) {
  const name = PROVIDER_NAMES[provider];
  const totalRaw = stats?.total_raw || 0;
  const parsed = stats?.parsed || 0;

  if (isLoading && !stats) {
    return (
      <div className="rounded-full bg-[#181818] border border-[#262626] px-5 py-2.5 animate-pulse flex items-center justify-between gap-6 sm:gap-8">
        <div className="h-4 w-16 bg-[#262626] rounded"></div>
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-7 bg-[#262626] rounded"></div>
          <div className="h-3 w-px bg-[#262626]"></div>
          <div className="h-4 w-7 bg-[#262626] rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/scrapers?tab=${provider}`}
      className="group bg-[#181818] hover:bg-[#202020] border border-[#262626] hover:border-[#383838] rounded-full px-5 py-2.5 transition-all flex items-center justify-between gap-6 sm:gap-8 select-none shadow-sm"
    >
      {/* Left: Platform Name */}
      <span className="text-xs sm:text-sm font-semibold font-heading text-white group-hover:text-[#3ecf8e] transition-colors">
        {name}
      </span>

      {/* Right: Two Numbers (Bronze Raw | Silver Clean) */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Raw Count (Darker Bronze) */}
        <span className="text-xs sm:text-sm font-mono font-semibold text-[#b45309]">
          {totalRaw.toLocaleString()}
        </span>

        {/* Separator Line */}
        <span className="h-3 w-px bg-[#2e2e2e]" aria-hidden="true" />

        {/* Clean Parsed Count (Silver) */}
        <span className="text-xs sm:text-sm font-mono font-semibold text-[#cbd5e1]">
          {parsed.toLocaleString()}
        </span>
      </div>
    </Link>
  );
}

export default ProviderCard;
