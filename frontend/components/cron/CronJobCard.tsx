'use client';

import React from 'react';
import {
  Clock,
  Play,
  EditPencil,
  Trash,
  Refresh,
  CheckCircle,
  WarningTriangle,
  Linkedin,
  Database,
  Building,
  Globe,
  Spark,
} from 'iconoir-react';
import type { CronJob } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface CronJobCardProps {
  job: CronJob;
  onToggle: (id: string) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onEdit: (job: CronJob) => void;
  onDelete: (id: string) => void;
  isRunning?: boolean;
  isToggling?: boolean;
}

const WEEKDAYS = [
  { index: 0, label: 'M', name: 'Mon' },
  { index: 1, label: 'T', name: 'Tue' },
  { index: 2, label: 'W', name: 'Wed' },
  { index: 3, label: 'T', name: 'Thu' },
  { index: 4, label: 'F', name: 'Fri' },
  { index: 5, label: 'S', name: 'Sat' },
  { index: 6, label: 'S', name: 'Sun' },
];

function formatTimeDisplay(hour: number, minute: number): { timeStr: string; period: string } {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const hStr = h12 < 10 ? `0${h12}` : `${h12}`;
  const mStr = minute < 10 ? `0${minute}` : `${minute}`;
  return { timeStr: `${hStr}:${mStr}`, period };
}

function getDaysSummary(days: number[]): string {
  if (!days || days.length === 0) return 'No days active';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i);
  if (isWeekdays) return 'Mon – Fri (Weekdays)';
  const isWeekends = sorted.length === 2 && sorted[0] === 5 && sorted[1] === 6;
  if (isWeekends) return 'Sat & Sun (Weekends)';

  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return sorted.map((d) => names[d]).join(', ');
}

export function CronJobCard({
  job,
  onToggle,
  onRun,
  onEdit,
  onDelete,
  isRunning = false,
  isToggling = false,
}: CronJobCardProps) {
  const { timeStr, period } = formatTimeDisplay(job.hour, job.minute);
  const daysSummary = getDaysSummary(job.days_of_week || []);

  const providerConfig = {
    indeed: {
      label: 'Indeed',
      badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
      icon: Database,
    },
    linkedin: {
      label: 'LinkedIn',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      icon: Linkedin,
    },
    wellfound: {
      label: 'Wellfound',
      badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      icon: Building,
    },
    all: {
      label: 'All Scrapers',
      badgeClass: 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30',
      icon: Globe,
    },
  }[job.provider] || {
    label: job.provider,
    badgeClass: 'bg-[#222] text-[#9ca3af] border-[#333]',
    icon: Globe,
  };

  const ProviderIcon = providerConfig.icon;

  // Format search params summary string
  const formatParams = (params: Record<string, any>): string => {
    if (!params || Object.keys(params).length === 0) return 'Default query params';
    const parts: string[] = [];
    if (params.what || params.keywords || params.role) {
      parts.push(`what: ${params.what || params.keywords || params.role}`);
    }
    if (params.where || params.location) {
      parts.push(`where: ${params.where || params.location}`);
    }
    if (params.limit !== undefined) {
      parts.push(`limit: ${params.limit}`);
    }
    return parts.length > 0 ? parts.join(' • ') : JSON.stringify(params);
  };

  return (
    <div
      className={cn(
        'rounded-xl bg-[#181818] border border-[#262626] transition-all p-5 shadow-sm space-y-4 flex flex-col justify-between group',
        !job.is_enabled && 'border-[#222222] bg-[#141414]'
      )}
    >
      {/* Top Header: Provider Badge + Active Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold font-heading border',
              providerConfig.badgeClass
            )}
          >
            <ProviderIcon className="w-3.5 h-3.5" />
            <span>{providerConfig.label}</span>
          </span>

          <span
            className={cn(
              'text-[11px] font-mono px-2 py-0.5 rounded border',
              job.is_enabled
                ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                : 'bg-[#222222] text-[#6b7280] border-[#333333]'
            )}
          >
            {job.is_enabled ? 'Active' : 'Paused'}
          </span>
        </div>

        {/* Enable / Disable Switch */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-sans text-[#6b7280]">
            {job.is_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={job.is_enabled}
            disabled={isToggling}
            onClick={() => onToggle(job.id)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50',
              job.is_enabled ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
            )}
            title={job.is_enabled ? 'Pause schedule' : 'Activate schedule'}
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                job.is_enabled ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {/* Middle: Job Name & Schedule Visuals */}
      <div className="space-y-3">
        <div>
          <h3
            className={cn(
              'text-base font-bold font-heading transition-colors',
              job.is_enabled ? 'text-white' : 'text-[#888888]'
            )}
          >
            {job.name}
          </h3>
          <p className="text-xs font-sans text-[#6b7280] mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[#9ca3af]" />
            <span>{daysSummary}</span>
          </p>
        </div>

        {/* Time Display and 7-day pill indicators */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-[#141414] border border-[#222222]">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'text-2xl font-black font-mono tracking-tight',
                job.is_enabled ? 'text-white' : 'text-[#888888]'
              )}
            >
              {timeStr}
            </span>
            <span className="text-xs font-mono font-semibold text-[#3ecf8e]">
              {period}
            </span>
          </div>

          {/* 7-Day Indicators (M, T, W, T, F, S, S) */}
          <div className="flex items-center gap-1">
            {WEEKDAYS.map((day) => {
              const isActive = job.days_of_week?.includes(day.index);
              return (
                <span
                  key={day.index}
                  title={`${day.name}: ${isActive ? 'Active' : 'Inactive'}`}
                  className={cn(
                    'w-6 h-6 rounded text-[10px] font-mono font-bold flex items-center justify-center transition-colors border',
                    isActive
                      ? job.is_enabled
                        ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/40 shadow-sm'
                        : 'bg-[#333333] text-[#9ca3af] border-[#444444]'
                      : 'bg-[#181818] text-[#4b5563] border-[#262626]'
                  )}
                >
                  {day.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Badges: Query Summary & Auto-parse status */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1f1f1f] border border-[#2a2a2a] text-[11px] font-mono text-[#d1d5db]">
            <span>{formatParams(job.search_params)}</span>
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border',
              job.auto_parse
                ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border-[#3ecf8e]/30'
                : 'bg-[#222] text-[#6b7280] border-[#2e2e2e]'
            )}
          >
            <Spark className="w-2.5 h-2.5" />
            <span>Auto-parse: {job.auto_parse ? 'ON' : 'OFF'}</span>
          </span>
        </div>
      </div>

      {/* Last Run Status & Result Summary */}
      <div className="pt-2 border-t border-[#262626]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {job.last_status === 'running' || isRunning ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Refresh className="w-2.5 h-2.5 animate-spin" />
              <span>Running...</span>
            </span>
          ) : job.last_status === 'success' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/30">
              <CheckCircle className="w-2.5 h-2.5" />
              <span>Success</span>
            </span>
          ) : job.last_status === 'failed' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <WarningTriangle className="w-2.5 h-2.5" />
              <span>Failed</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#222222] text-[#6b7280] border border-[#2e2e2e]">
              Never run
            </span>
          )}

          <span className="text-[11px] font-mono text-[#6b7280]">
            {job.last_run_at ? (
              <>Last run: {formatRelativeTime(job.last_run_at)}</>
            ) : (
              <>Pending first run</>
            )}
          </span>
        </div>

        {job.last_result_summary && (
          <span
            title={job.last_result_summary}
            className="text-[10px] font-mono text-[#9ca3af] max-w-[200px] truncate"
          >
            {job.last_result_summary}
          </span>
        )}
      </div>

      {/* Action Buttons: Run Now, Edit, Delete */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]/80">
        <button
          type="button"
          onClick={() => onRun(job.id)}
          disabled={isRunning}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium font-sans transition-all',
            isRunning
              ? 'bg-[#1e2a22] border-[#3ecf8e] text-[#3ecf8e]'
              : 'bg-[#181818] border-[#2a2a2a] hover:border-[#3ecf8e]/60 hover:bg-[#202020] text-white active:scale-95'
          )}
          title="Run this scraper now"
        >
          {isRunning ? (
            <>
              <Refresh className="w-3.5 h-3.5 animate-spin text-[#3ecf8e]" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Run Now</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onEdit(job)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] bg-[#181818] hover:bg-[#202020] hover:border-[#444] text-xs font-medium font-sans text-[#9ca3af] hover:text-white transition-all active:scale-95"
          title="Edit schedule details"
        >
          <EditPencil className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        <button
          type="button"
          onClick={() => onDelete(job.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2a2a] bg-[#181818] hover:bg-rose-500/10 hover:border-rose-500/40 text-xs font-medium font-sans text-[#9ca3af] hover:text-rose-400 transition-all active:scale-95"
          title="Delete schedule"
        >
          <Trash className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
}

export default CronJobCard;
