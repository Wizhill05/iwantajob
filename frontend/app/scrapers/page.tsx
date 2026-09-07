'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Cpu,
  Timer,
  CheckCircle,
  WarningTriangle,
  Code,
  Page,
  RefreshDouble,
} from 'iconoir-react';
import { ScraperTabs, type ScraperTabKey } from '@/components/scrapers/ScraperTabs';
import { LinkedInTester } from '@/components/scrapers/LinkedInTester';
import { IndeedTester } from '@/components/scrapers/IndeedTester';
import { WellfoundTester } from '@/components/scrapers/WellfoundTester';
import { ScrapedJobCard } from '@/components/scrapers/ScrapedJobCard';
import { RawJsonViewer } from '@/components/scrapers/RawJsonViewer';
import { PageHero } from '@/components/layout/PageHero';
import type { JobItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ScraperExecutionState {
  items: JobItem[];
  rawPayload: any;
  latencyMs: number | null;
  provider: string | null;
  timestamp: string | null;
}

function ScrapersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active tab derived from ?tab= or default to linkedin
  const tabParam = searchParams.get('tab') as ScraperTabKey | null;
  const initialTab: ScraperTabKey =
    tabParam === 'indeed' || tabParam === 'wellfound' || tabParam === 'linkedin'
      ? tabParam
      : 'linkedin';

  const [activeTab, setActiveTab] = useState<ScraperTabKey>(initialTab);

  // Sync tab with URL parameter changes
  useEffect(() => {
    if (tabParam && (tabParam === 'indeed' || tabParam === 'wellfound' || tabParam === 'linkedin')) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (tab: ScraperTabKey) => {
    setActiveTab(tab);
    setExecutionState({
      items: [],
      rawPayload: null,
      latencyMs: null,
      provider: null,
      timestamp: null,
    });
    setErrorMessage(null);
    router.replace(`/scrapers?tab=${tab}`, { scroll: false });
  };

  // Execution and results state
  const [executionState, setExecutionState] = useState<ScraperExecutionState>({
    items: [],
    rawPayload: null,
    latencyMs: null,
    provider: null,
    timestamp: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'json'>('cards');

  const handleResults = (
    provider: string,
    items: JobItem[],
    rawPayload: any,
    latencyMs: number
  ) => {
    setExecutionState({
      items,
      rawPayload,
      latencyMs,
      provider,
      timestamp: new Date().toLocaleTimeString(),
    });
    setErrorMessage(null);
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
  };

  return (
    <div className="relative max-w-7xl mx-auto pb-16">
      {/* Centered Dynamic Hero */}
      <PageHero title="Scrapers" />

      {/* Main Content Pane Starting After Half Viewport */}
      <div className="relative z-10 -mt-8 pt-4 space-y-6 bg-[#131313] min-h-[60vh]">
        {/* Provider Selector Tabs */}
        <ScraperTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Active Gateway Parameter Console */}
      <div>
        {activeTab === 'linkedin' && (
          <LinkedInTester
            onResults={(items, rawPayload, latencyMs) =>
              handleResults('LinkedIn Guest API', items, rawPayload, latencyMs)
            }
            onError={handleError}
            onLoadingChange={setIsLoading}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            resultsCount={executionState.items.length}
          />
        )}

        {activeTab === 'indeed' && (
          <IndeedTester
            onResults={(items, rawPayload, latencyMs) =>
              handleResults('Indeed Mobile GQL', items, rawPayload, latencyMs)
            }
            onError={handleError}
            onLoadingChange={setIsLoading}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            resultsCount={executionState.items.length}
          />
        )}

        {activeTab === 'wellfound' && (
          <WellfoundTester
            onResults={(items, rawPayload, latencyMs) =>
              handleResults('Wellfound Apollo SSR', items, rawPayload, latencyMs)
            }
            onError={handleError}
            onLoadingChange={setIsLoading}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            resultsCount={executionState.items.length}
          />
        )}
      </div>

      {/* Results Section */}
      <div className="space-y-4 pt-1">
        {/* Extracted stats display when items exist */}
        {executionState.items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs font-sans px-1">
            <div className="flex items-center gap-2 text-[11px] text-[#9ca3af]">
              <span>Extracted {executionState.items.length} roles</span>
              {executionState.latencyMs !== null && (
                <>
                  <span>•</span>
                  <span className="font-mono text-[#3ecf8e]">{executionState.latencyMs}ms</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 -mx-4 sm:mx-0 border-y sm:border border-rose-500/30 sm:rounded-2xl bg-rose-500/10 text-xs font-sans text-rose-300 flex items-start gap-3">
            <WarningTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-200">Scrape Error Occurred</div>
              <div className="mt-0.5 text-rose-300/90 font-mono">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-3">
            <div className="p-4 -mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-2xl bg-[#181818] text-center font-sans text-xs text-[#9ca3af] flex items-center justify-center gap-2">
              <RefreshDouble className="w-4 h-4 text-[#3ecf8e] animate-spin" />
              <span>Querying upstream gateway and processing responses...</span>
            </div>
            <div className="-mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-2xl overflow-hidden divide-y divide-[#262626]">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-[#181818] p-4 animate-pulse space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-48 bg-[#262626] rounded" />
                    <div className="h-4 w-16 bg-[#262626] rounded" />
                  </div>
                  <div className="h-3 w-32 bg-[#262626] rounded" />
                  <div className="h-3 w-full bg-[#262626] rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && executionState.items.length === 0 && !errorMessage && (
          <div className="p-8 -mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-2xl bg-[#181818] text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center mx-auto text-[#3ecf8e]">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold font-heading text-white">
              No Scraper Run Yet
            </h3>
            <p className="text-xs text-[#9ca3af] max-w-md mx-auto leading-relaxed">
              Configure parameters above and click &quot;Run Scraper&quot; to test real-time extraction and preview parsed job cards.
            </p>
          </div>
        )}

        {/* Successful Output View */}
        {!isLoading && executionState.items.length > 0 && (
          <div>
            {viewMode === 'cards' ? (
              <div className="-mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-2xl divide-y divide-[#262626] overflow-hidden">
                {executionState.items.map((job, idx) => (
                  <ScrapedJobCard key={`${job.external_id}-${idx}`} job={job} index={idx} />
                ))}
              </div>
            ) : (
              <div className="-mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-2xl overflow-hidden">
                <RawJsonViewer
                  data={executionState.rawPayload}
                  title={`${executionState.provider || 'Scraper'} Raw JSON Response`}
                />
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default function ScrapersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 rounded-xl bg-[#181818] border border-[#262626] text-center font-mono text-xs text-[#9ca3af]">
          Loading Scraper Testing Lab...
        </div>
      }
    >
      <ScrapersContent />
    </Suspense>
  );
}
