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
  { name: 'Scrapers', href: '/scrapers', icon: Cpu },
  { name: 'Pipeline', href: '/pipeline', icon: RefreshDouble },
  { name: 'Jobs', href: '/jobs', icon: Suitcase },
  { name: 'Logs', href: '/logs', icon: Terminal },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { activeProcesses } = useActivity();

  const runningCount = activeProcesses.filter((p) => p.status === 'running').length;

  return (
    <nav
      aria-label="Mobile navigation dock"
      className="lg:hidden fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 bg-[#181818]/90 backdrop-blur-md rounded-2xl border border-[#2a2a2a] shadow-2xl px-3 py-2 flex justify-around items-center select-none"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname?.startsWith(item.href + '/');

        const isLogsItem = item.href === '/logs';

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex flex-col items-center justify-center min-w-[52px] py-1 px-2 rounded-xl transition-all duration-150',
              isActive
                ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border border-[#3ecf8e]/30 shadow-[0_0_12px_rgba(62,207,142,0.15)]'
                : 'text-[#9ca3af] hover:text-[#f3f4f6] border border-transparent'
            )}
          >
            <div className="relative">
              <Icon
                className={cn(
                  'w-5 h-5 transition-transform duration-150',
                  isActive ? 'text-[#3ecf8e] scale-105' : 'text-[#9ca3af]'
                )}
              />

              {/* Notification badge if background tasks are running */}
              {isLogsItem && runningCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[15px] h-[15px] px-1 text-[9px] font-mono font-bold rounded-full bg-[#3ecf8e] text-[#131313] ring-2 ring-[#181818]">
                  {runningCount}
                </span>
              )}
            </div>

            <span
              className={cn(
                'text-[10px] tracking-tight mt-0.5 font-medium transition-colors',
                isActive ? 'text-[#3ecf8e] font-semibold' : 'text-[#6b7280]'
              )}
            >
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;
