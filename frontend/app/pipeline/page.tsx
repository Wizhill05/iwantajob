'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { Refresh, RefreshDouble } from 'iconoir-react';
import { api } from '@/lib/api';
import type { ParsingStatus } from '@/lib/types';
import { SquareParserActions } from '@/components/pipeline/SquareParserActions';
import { PageHero } from '@/components/layout/PageHero';
import { cn } from '@/lib/utils';

function PipelineContent() {
  const [parsingStatus, setParsingStatus] = useState<ParsingStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPipelineData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const status = await api.getParsingStatus();
      setParsingStatus(status);
      setLastUpdated(new Date());
    } catch {
      // Backend offline or error handled gracefully
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPipelineData();

    // Auto-poll status every 10 seconds
    const interval = setInterval(() => {
      loadPipelineData();
    }, 10000);

    const handlePlatformRefresh = () => {
      loadPipelineData();
    };
    window.addEventListener('platform:refresh', handlePlatformRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('platform:refresh', handlePlatformRefresh);
    };
  }, [loadPipelineData]);

  return (
    <div className="relative max-w-7xl mx-auto pb-16">
      {/* Centered Dynamic Hero covering ~30% with shimmer heading and full-width dots */}
      <PageHero title="Pipeline" />

      {/* Main Content Pane Starting After Half Viewport - Clean and Unboxed */}
      <div className="relative z-10 -mt-8 pt-4 space-y-6 bg-[#131313] min-h-[60vh]">
        {/* Top Mini Toolbar: Direct Refresh & Last Synced */}
        <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
          <span className="text-xs font-heading font-semibold text-white tracking-wide uppercase text-[11px]">
            Decoupled Normalizers
          </span>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] font-mono text-[#6b7280]">
                {lastUpdated.toLocaleTimeString([], { hour12: false })}
              </span>
            )}
            <button
              type="button"
              onClick={loadPipelineData}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#222222] text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
              title="Refresh Pipeline Status"
            >
              <Refresh
                className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')}
              />
            </button>
          </div>
        </div>

        {/* 4 Big Square Action Buttons + Minimal Bottom Strip */}
        <SquareParserActions
          status={parsingStatus}
          onParseComplete={loadPipelineData}
        />
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-mono text-[#3ecf8e]">
            <RefreshDouble className="w-4 h-4 animate-spin" />
            <span>Loading Pipeline...</span>
          </div>
        </div>
      }
    >
      <PipelineContent />
    </Suspense>
  );
}
