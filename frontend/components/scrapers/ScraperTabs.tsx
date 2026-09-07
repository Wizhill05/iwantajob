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
}

const TABS: TabDefinition[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'indeed', label: 'Indeed' },
  { key: 'wellfound', label: 'Wellfound' },
];

export function ScraperTabs({ activeTab, onTabChange }: ScraperTabsProps) {
  return (
    <div className="flex items-center justify-center border-b border-[#262626] pb-3 select-none">
      <div className="inline-flex items-center gap-1 rounded-full border border-[#2a2a2a] bg-[#181818]/95 p-1 shadow-lg backdrop-blur-xl">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'px-5 py-1.5 rounded-full text-xs font-heading font-semibold transition-all duration-200 shrink-0 border select-none',
                isActive
                  ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/30 shadow-sm'
                  : 'border-transparent text-[#9ca3af] hover:text-white hover:bg-[#202020]'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ScraperTabs;


