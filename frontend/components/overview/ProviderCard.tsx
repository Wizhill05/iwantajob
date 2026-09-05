'use client';

import React from 'react';
import Link from 'next/link';
import { ProgressBar } from '@tremor/react';
import {
  Play,
  RefreshDouble,
  Cpu,
  Database,
  NavArrowRight,
} from 'iconoir-react';
import type { ProviderParsingStats } from '@/lib/types';
import { cn } from '@/lib/utils';

export type ProviderKey = 'indeed' | 'linkedin' | 'wellfound';

interface ProviderCardProps {
  provider: ProviderKey;
  stats?: ProviderParsingStats;
  isLoading?: boolean;
}

const PROVIDER_METADATA: Record<
  ProviderKey,
  {
    name: string;
    engineBadge: string;
    description: string;
    scraperLink: string;
    pipelineLink: string;
    colorClass: string;
  }
> = {
  indeed: {
    name: 'Indeed',
    engineBadge: 'GraphQL Gateway',
    description: 'Mobile GraphQL Gateway (apis.indeed.com) with cursor pagination.',
    scraperLink: '/scrapers?tab=indeed',
    pipelineLink: '/pipeline?provider=indeed',
    colorClass: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
  },
  linkedin: {
    name: 'LinkedIn',
    engineBadge: 'Guest Scraper',
    description: 'Public guest endpoints with TLS fingerprinting and LRU caching.',
    scraperLink: '/scrapers?tab=linkedin',
    pipelineLink: '/pipeline?provider=linkedin',
    colorClass: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
  },
  wellfound: {
    name: 'Wellfound',
    engineBadge: 'Apollo SSR',
    description: 'Direct SSR Apollo Client state extraction bypassing Turnstile.',
    scraperLink: '/scrapers?tab=wellfound',
    pipelineLink: '/pipeline?provider=wellfound',
    colorClass: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
  },
};

export function ProviderCard({
  provider,
  stats,
  isLoading = false,
}: ProviderCardProps) {
  const meta = PROVIDER_METADATA[provider];

  const totalRaw = stats?.total_raw || 0;
  const parsed = stats?.parsed || 0;
  const unparsed = stats?.unparsed ?? (totalRaw - parsed);

  const parsedPercentage =
    totalRaw > 0 ? Math.min(100, (parsed / totalRaw) * 100) : 0;

  if (isLoading && !stats) {
    return (
      <div className="rounded-none md:rounded-xl bg-[#181818] border-0 md:border border-[#262626] p-5 animate-pulse flex flex-col justify-between h-64">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-[#262626] rounded"></div>
          <div className="h-5 w-24 bg-[#262626] rounded-full"></div>
        </div>
        <div className="space-y-2 my-4">
          <div className="h-3 w-full bg-[#262626] rounded"></div>
          <div className="h-3 w-4/5 bg-[#262626] rounded"></div>
        </div>
        <div className="h-2 w-full bg-[#262626] rounded"></div>
        <div className="h-8 w-full bg-[#262626] rounded mt-4"></div>
      </div>
    );
  }

  return (
    <div className="bg-[#181818] border-0 md:border border-[#262626] rounded-none md:rounded-xl p-4 sm:p-5 shadow-none md:shadow-sm hover:border-[#383838] transition-all flex flex-col justify-between">
      <div>
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold font-heading text-white">
                {meta.name}
              </h3>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-sans font-medium rounded-full border',
                  meta.colorClass
                )}
              >
                {meta.engineBadge}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#9ca3af] leading-relaxed line-clamp-2">
              {meta.description}
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-4 pt-3 border-t border-[#262626] grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] font-sans text-[#9ca3af] block">
              Total Raw
            </span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[#9ca3af]" />
              <span className="text-lg font-mono font-semibold text-white">
                {totalRaw.toLocaleString()}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[11px] font-sans text-[#9ca3af] block">
              Parsed Clean
            </span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <RefreshDouble className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span className="text-lg font-mono font-semibold text-[#3ecf8e]">
                {parsed.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Progress & Backlog Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-sans text-[#9ca3af] mb-1.5">
            <span>Progress: <span className="font-mono">{parsedPercentage.toFixed(0)}%</span></span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                unparsed > 0
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/20'
              )}
            >
              <span className="font-mono">{unparsed}</span> unparsed
            </span>
          </div>
          <ProgressBar
            value={parsedPercentage}
            color="emerald"
            className="h-1.5 [&>div]:bg-[#262626] [&>div>div]:bg-[#3ecf8e]"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 pt-3 border-t border-[#262626] grid grid-cols-2 gap-2">
        <Link
          href={meta.scraperLink}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] text-xs font-sans font-medium text-white transition-all hover:border-[#383838]"
        >
          <Play className="w-3.5 h-3.5 text-[#3ecf8e]" />
          <span>Test Scraper</span>
        </Link>

        <Link
          href={meta.pipelineLink}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/20 border border-[#3ecf8e]/30 text-xs font-sans font-medium text-[#3ecf8e] transition-all"
        >
          <RefreshDouble className="w-3.5 h-3.5" />
          <span>Trigger Pipeline</span>
        </Link>
      </div>
    </div>
  );
}

export default ProviderCard;
