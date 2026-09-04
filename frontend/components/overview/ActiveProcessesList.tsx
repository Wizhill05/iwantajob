'use client';

import React, { useEffect, useState } from 'react';
import { Card, Text } from '@tremor/react';
import {
  Activity,
  Refresh,
  CheckCircle,
  XmarkCircle,
  Terminal,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { cn } from '@/lib/utils';
import type { ActiveProcess } from '@/lib/types';

export function ActiveProcessesList() {
  const { activeProcesses } = useActivity();
  const [now, setNow] = useState<number>(Date.now());

  // Update elapsed seconds ticker every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const runningCount = activeProcesses.filter(
    (p) => p.status === 'running'
  ).length;

  return (
    <Card className="bg-[#181818] border-[#262626] rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-[#3ecf8e]" />
          <div>
            <h3 className="text-sm font-semibold font-heading text-white">
              Active Process Monitor
            </h3>
            <p className="text-[11px] font-mono text-[#9ca3af]">
              Real-time ingestion and normalization runners
            </p>
          </div>
        </div>

        {runningCount > 0 ? (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[11px] font-mono text-[#3ecf8e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3ecf8e] animate-ping"></span>
            {runningCount} Running
          </span>
        ) : (
          <span className="text-[11px] font-mono text-[#6b7280]">
            Idle
          </span>
        )}
      </div>

      {activeProcesses.length === 0 ? (
        <div className="py-10 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-[#202020] border border-[#262626] flex items-center justify-center text-[#6b7280] mb-3">
            <Activity className="w-5 h-5" />
          </div>
          <Text className="text-xs font-mono font-medium text-[#9ca3af]">
            No active scraper or normalization jobs running
          </Text>
          <Text className="text-[11px] text-[#6b7280] mt-1 max-w-sm">
            Jobs launched from Scraper Lab or the Normalization Pipeline will be tracked here live.
          </Text>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {activeProcesses.map((proc: ActiveProcess) => {
            const elapsedSec = Math.max(
              0,
              ((now - proc.startTime) / 1000)
            ).toFixed(1);

            return (
              <div
                key={proc.id}
                className={cn(
                  'p-3 rounded-lg border transition-all text-xs font-mono',
                  proc.status === 'running'
                    ? 'bg-[#202020] border-[#3ecf8e]/30 shadow-[0_0_12px_rgba(62,207,142,0.05)]'
                    : proc.status === 'failed'
                    ? 'bg-[#202020] border-rose-500/30'
                    : 'bg-[#202020] border-[#262626]'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {proc.status === 'running' ? (
                      <Refresh className="w-4 h-4 text-[#3ecf8e] animate-spin" />
                    ) : proc.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-[#3ecf8e]" />
                    ) : (
                      <XmarkCircle className="w-4 h-4 text-rose-400" />
                    )}

                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border',
                        proc.type === 'scrape'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                          : 'bg-emerald-500/10 text-[#3ecf8e] border-emerald-500/20'
                      )}
                    >
                      {proc.type}
                    </span>

                    <span className="font-semibold text-white capitalize">
                      {proc.provider}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#9ca3af]">
                      {proc.status === 'running' ? `${elapsedSec}s elapsed` : proc.status}
                    </span>
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        proc.status === 'running'
                          ? 'bg-[#3ecf8e] animate-pulse'
                          : proc.status === 'completed'
                          ? 'bg-[#3ecf8e]'
                          : 'bg-rose-400'
                      )}
                    ></span>
                  </div>
                </div>

                {proc.params && Object.keys(proc.params).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#262626] text-[11px] text-[#9ca3af] truncate flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-[#6b7280] shrink-0" />
                    <span className="truncate">
                      {Object.entries(proc.params)
                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                        .join(' ')}
                    </span>
                  </div>
                )}

                {proc.message && (
                  <div className="mt-1 text-[11px] text-[#6b7280] italic truncate">
                    {proc.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default ActiveProcessesList;
