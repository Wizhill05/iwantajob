'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { activeProcesses } = useActivity();
  const runningCount = activeProcesses.filter((p) => p.status === 'running').length;

  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const containerRef = useRef<HTMLElement | null>(null);

  // Optimistic active path state for instant response
  const [optimisticPath, setOptimisticPath] = useState<string>(pathname);
  const [indicatorLeft, setIndicatorLeft] = useState<number>(0);
  const [isReady, setIsReady] = useState<boolean>(false);

  // Sync optimistic path when real route change completes
  useEffect(() => {
    setOptimisticPath(pathname);
  }, [pathname]);

  // Determine active index based on optimistic path
  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === '/'
      ? optimisticPath === '/'
      : optimisticPath === item.href || optimisticPath?.startsWith(item.href + '/')
  );

  useEffect(() => {
    const updateIndicator = () => {
      if (activeIndex === -1) {
        setIsReady(false);
        return;
      }
      const activeEl = itemRefs.current[activeIndex];
      if (activeEl) {
        setIndicatorLeft(activeEl.offsetLeft);
        setIsReady(true);
      }
    };

    updateIndicator();
    const handleResize = () => updateIndicator();
    window.addEventListener('resize', handleResize);

    const timer = setTimeout(updateIndicator, 40);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [optimisticPath, activeIndex]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // If clicking current page, let default behavior occur
    if (optimisticPath === href) return;

    // Immediately trigger ball animation optimistically
    setOptimisticPath(href);

    // Pre-calculate target position for zero-latency response using offsetLeft
    const targetIdx = NAV_ITEMS.findIndex((item) => item.href === href);
    const targetEl = itemRefs.current[targetIdx];
    if (targetEl) {
      setIndicatorLeft(targetEl.offsetLeft);
    }
  };

  return (
    <nav
      ref={containerRef}
      aria-label="Mobile navigation dock"
      className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full border border-[#2a2a2a] bg-[#181818]/95 backdrop-blur-xl p-2 shadow-2xl flex items-center gap-2 select-none overflow-hidden"
    >
      {/* Moving Selection Circle Indicator */}
      <div
        className={cn(
          'absolute top-2 left-0 w-12 h-12 rounded-full bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 shadow-sm pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
          isReady ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          transform: `translateX(${indicatorLeft}px)`,
        }}
      />

      {NAV_ITEMS.map((item, index) => {
        const Icon = item.icon;
        const isActive = index === activeIndex;
        const isLogsItem = item.href === '/logs';

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => handleNavClick(e, item.href)}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            aria-label={item.name}
            title={item.name}
            className={cn(
              'relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200 active:scale-95',
              isActive
                ? 'text-[#3ecf8e]'
                : 'text-[#9ca3af] hover:text-[#f3f4f6]'
            )}
          >
            <div className="relative flex items-center justify-center">
              <Icon className="w-5 h-5 transition-transform duration-200" />
              {/* Notification badge if background tasks are running */}
              {isLogsItem && runningCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-mono font-bold rounded-full bg-[#3ecf8e] text-[#131313] ring-2 ring-[#181818]">
                  {runningCount}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;
