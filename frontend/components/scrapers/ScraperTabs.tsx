'use client';

import React from 'react';
import { FaLinkedin } from 'react-icons/fa6';
import { SiIndeed, SiWellfound, SiGlassdoor } from 'react-icons/si';
import { cn } from '@/lib/utils';

export type ScraperTabKey = 'linkedin' | 'indeed' | 'wellfound' | 'glassdoor';

interface ScraperTabsProps {
  activeTab: ScraperTabKey;
  onTabChange: (tab: ScraperTabKey) => void;
}

interface TabDefinition {
  key: ScraperTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  inactiveClass: string;
}

const TABS: TabDefinition[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: FaLinkedin,
    activeClass: 'bg-[#0077b5]/15 text-[#0077b5] border-[#0077b5]/30 shadow-sm',
    inactiveClass: 'text-[#9ca3af] hover:text-[#0077b5] hover:bg-[#202020]',
  },
  {
    key: 'indeed',
    label: 'Indeed',
    icon: SiIndeed,
    activeClass: 'bg-[#2164f3]/15 text-sky-400 border-sky-500/30 shadow-sm',
    inactiveClass: 'text-[#9ca3af] hover:text-sky-400 hover:bg-[#202020]',
  },
  {
    key: 'wellfound',
    label: 'Wellfound',
    icon: SiWellfound,
    activeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-sm',
    inactiveClass: 'text-[#9ca3af] hover:text-rose-400 hover:bg-[#202020]',
  },
  {
    key: 'glassdoor',
    label: 'Glassdoor',
    icon: SiGlassdoor,
    activeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm',
    inactiveClass: 'text-[#9ca3af] hover:text-emerald-400 hover:bg-[#202020]',
  },
];

export function ScraperTabs({ activeTab, onTabChange }: ScraperTabsProps) {
  return (
    <div className="flex items-center justify-center border-b border-[#262626] pb-3 select-none">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] bg-[#181818]/95 p-1 shadow-lg backdrop-blur-xl">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              title={tab.label}
              aria-label={tab.label}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-heading font-semibold transition-all duration-200 shrink-0 border select-none',
                isActive
                  ? tab.activeClass
                  : cn('border-transparent', tab.inactiveClass)
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ScraperTabs;
