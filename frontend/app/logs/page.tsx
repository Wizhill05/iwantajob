'use client';

import React from 'react';
import { LogsTerminalView } from '@/components/logs/LogsTerminalView';
import { PageHero } from '@/components/layout/PageHero';

export default function SystemLogsPage() {
  return (
    <div className="relative pb-24 lg:pb-12 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Centered Dynamic Hero */}
      <PageHero title="Logs" />

      {/* Main Content Pane */}
      <div className="relative z-10 -mt-8 pt-4 space-y-4 bg-[#131313] min-h-[60vh] w-full">
        <LogsTerminalView />
      </div>
    </div>
  );
}


