'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ViewGrid,
  Cpu,
  RefreshDouble,
  Suitcase,
  Terminal,
  Activity,
  Server,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/', icon: ViewGrid },
  { name: 'Scraper Lab', href: '/scrapers', icon: Cpu },
  { name: 'Pipeline', href: '/pipeline', icon: RefreshDouble },
  { name: 'Unified Jobs', href: '/jobs', icon: Suitcase },
  { name: 'Logs & System', href: '/logs', icon: Terminal },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const { activeProcesses } = useActivity();

  const runningCount = activeProcesses.filter((p) => p.status === 'running').length;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-[#131313] border-r border-[#262626] z-30 select-none">
      {/* Top Terminal Branding */}
      <div className="h-16 px-5 flex items-center border-b border-[#262626]/80 justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 group transition-opacity hover:opacity-90"
        >
          <div className="flex items-center gap-1.5 font-mono text-sm tracking-tight text-white font-semibold">
            <span className="text-[#3ecf8e] group-hover:drop-shadow-[0_0_8px_rgba(62,207,142,0.8)] transition-all">
              &gt;_
            </span>
            <span>[iWantAJob]</span>
          </div>
        </Link>
        <span className="font-mono text-[10px] tracking-wider uppercase font-semibold px-2 py-0.5 rounded border border-[#3ecf8e]/30 bg-[#3ecf8e]/10 text-[#3ecf8e] shadow-[0_0_10px_rgba(62,207,142,0.15)]">
          v1.1
        </span>
      </div>

      {/* Running Process Indicator Pill if processes active */}
      {runningCount > 0 && (
        <div className="px-4 pt-3 pb-1">
          <Link
            href="/logs"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[#3ecf8e] text-xs font-mono transition-all hover:bg-[#3ecf8e]/15"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>{runningCount} Active Task{runningCount > 1 ? 's' : ''}</span>
            </div>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ecf8e] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3ecf8e]"></span>
            </span>
          </Link>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-[#6b7280]">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/30 shadow-[inset_0_0_12px_rgba(62,207,142,0.06)]'
                  : 'text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#181818] border border-transparent hover:border-[#262626]'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive
                      ? 'text-[#3ecf8e]'
                      : 'text-[#9ca3af] group-hover:text-[#f3f4f6]'
                  )}
                />
                <span>{item.name}</span>
              </div>
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e] shadow-[0_0_6px_rgba(62,207,142,0.8)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Panel with API Health and Port Info */}
      <div className="p-3 border-t border-[#262626] bg-[#181818]/60">
        <div className="p-3 rounded-lg border border-[#262626] bg-[#131313] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-[#9ca3af]">
              <Server className="w-3.5 h-3.5" />
              <span>Backend API</span>
            </div>
            <span className="text-[#6b7280] font-mono text-[10px]">localhost:8020</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#262626]/60 text-[10px] font-mono text-[#6b7280]">
            <span>System Host</span>
            <span className="text-[#3ecf8e] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e]"></span>
              Ready
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default DesktopSidebar;
