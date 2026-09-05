'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type ScraperTabKey = 'linkedin' | 'indeed' | 'wellfound';

interface ScraperTabsProps {
  activeTab: ScraperTabKey;
  onTabChange: (tab: ScraperTabKey) => void;
}

interface TabDefinition {
  key: ScraperTabKey;
  label: string;
  sublabel: string;
  badge: string;
  colorDot: string;
  activeBorder: string;
  activeText: string;
  activeBg: string;
}

const TABS: TabDefinition[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    sublabel: 'Guest API',
    badge: 'TLS Fingerprinted',
    colorDot: 'bg-blue-400',
    activeBorder: 'border-blue-500/50',
    activeText: 'text-blue-400',
    activeBg: 'bg-blue-500/10',
  },
  {
    key: 'indeed',
    label: 'Indeed',
    sublabel: 'Mobile GQL',
    badge: 'GraphQL Gateway',
    colorDot: 'bg-sky-400',
    activeBorder: 'border-sky-500/50',
    activeText: 'text-sky-400',
    activeBg: 'bg-sky-500/10',
  },
  {
    key: 'wellfound',
    label: 'Wellfound',
    sublabel: 'Apollo SSR',
    badge: '__NEXT_DATA__',
    colorDot: 'bg-rose-400',
    activeBorder: 'border-rose-500/50',
    activeText: 'text-rose-400',
    activeBg: 'bg-rose-500/10',
  },
];

export function ScraperTabs({ activeTab, onTabChange }: ScraperTabsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-b border-[#262626] pb-3">
      <div className="grid grid-cols-3 gap-2 w-full">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all relative overflow-hidden',
                isActive
                  ? cn('bg-[#181818]', tab.activeBorder, 'shadow-sm')
                  : 'bg-[#181818]/60 border-[#262626] hover:border-[#383838] hover:bg-[#181818]'
              )}
            >
              {/* Active subtle top highlight indicator */}
              {isActive && (
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 h-0.5',
                    tab.colorDot
                  )}
                />
              )}

              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      isActive ? tab.colorDot : 'bg-[#6b7280]'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs sm:text-sm font-semibold font-heading',
                      isActive ? 'text-white' : 'text-[#9ca3af]'
                    )}
                  >
                    {tab.label}
                  </span>
                </div>

                <span
                  className={cn(
                    'hidden md:inline-block px-1.5 py-0.5 text-[9px] font-sans rounded border',
                    isActive
                      ? cn(tab.activeText, tab.activeBg, tab.activeBorder)
                      : 'text-[#6b7280] border-[#262626] bg-[#131313]'
                  )}
                >
                  {tab.badge}
                </span>
              </div>

              <span className="text-[11px] font-sans text-[#9ca3af] mt-0.5">
                {tab.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ScraperTabs;
