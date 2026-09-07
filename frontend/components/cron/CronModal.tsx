'use client';

import React, { useState, useEffect } from 'react';
import {
  Xmark,
  Clock,
  Database,
  Linkedin,
  Building,
  Globe,
  Spark,
  Check,
  Refresh,
} from 'iconoir-react';
import type {
  CronJob,
  CreateCronJobPayload,
  UpdateCronJobPayload,
} from '@/lib/types';
import { cn } from '@/lib/utils';

interface CronModalProps {
  isOpen: boolean;
  job?: CronJob | null;
  onClose: () => void;
  onSave: (
    payload: CreateCronJobPayload | UpdateCronJobPayload,
    id?: string
  ) => Promise<void>;
  isSaving?: boolean;
}

const PROVIDERS: {
  id: 'indeed' | 'linkedin' | 'wellfound' | 'all';
  label: string;
  icon: React.ElementType;
  activeColor: string;
}[] = [
  {
    id: 'indeed',
    label: 'Indeed',
    icon: Database,
    activeColor: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    activeColor: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  },
  {
    id: 'wellfound',
    label: 'Wellfound',
    icon: Building,
    activeColor: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  },
  {
    id: 'all',
    label: 'All Scrapers',
    icon: Globe,
    activeColor: 'border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]',
  },
];

const WEEKDAYS = [
  { index: 0, label: 'M', name: 'Mon' },
  { index: 1, label: 'T', name: 'Tue' },
  { index: 2, label: 'W', name: 'Wed' },
  { index: 3, label: 'T', name: 'Thu' },
  { index: 4, label: 'F', name: 'Fri' },
  { index: 5, label: 'S', name: 'Sat' },
  { index: 6, label: 'S', name: 'Sun' },
];

const TIME_PRESETS = [
  { label: '06:00 AM', hour: 6, minute: 0 },
  { label: '07:00 AM', hour: 7, minute: 0 },
  { label: '08:00 AM', hour: 8, minute: 0 },
  { label: '09:00 AM', hour: 9, minute: 0 },
  { label: '12:00 PM', hour: 12, minute: 0 },
  { label: '06:00 PM', hour: 18, minute: 0 },
];

export function CronModal({
  isOpen,
  job,
  onClose,
  onSave,
  isSaving = false,
}: CronModalProps) {
  const isEditing = !!job;

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<'indeed' | 'linkedin' | 'wellfound' | 'all'>('indeed');
  const [hour, setHour] = useState<number>(6);
  const [minute, setMinute] = useState<number>(0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4]);
  const [queryWhat, setQueryWhat] = useState('software engineer');
  const [queryWhere, setQueryWhere] = useState('India');
  const [queryLimit, setQueryLimit] = useState<number>(25);
  const [autoParse, setAutoParse] = useState<boolean>(true);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or reset form values
  useEffect(() => {
    if (job) {
      setName(job.name);
      setProvider(job.provider);
      setHour(job.hour);
      setMinute(job.minute);
      setDaysOfWeek(job.days_of_week || [0, 1, 2, 3, 4]);

      const params = job.search_params || {};
      setQueryWhat(params.what || params.keywords || params.role || 'software engineer');
      setQueryWhere(params.where || params.location || 'India');
      setQueryLimit(params.limit !== undefined ? Number(params.limit) : 25);

      setAutoParse(job.auto_parse ?? true);
      setIsEnabled(job.is_enabled ?? true);
    } else {
      setName('Daily Morning Scrape');
      setProvider('indeed');
      setHour(6);
      setMinute(0);
      setDaysOfWeek([0, 1, 2, 3, 4]);
      setQueryWhat('software engineer');
      setQueryWhere('India');
      setQueryLimit(25);
      setAutoParse(true);
      setIsEnabled(true);
    }
    setErrorMsg(null);
  }, [job, isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const toggleDay = (dayIndex: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort((a, b) => a - b)
    );
  };

  const handleSelectDaysPreset = (preset: 'daily' | 'weekdays' | 'weekends') => {
    if (preset === 'daily') setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    if (preset === 'weekdays') setDaysOfWeek([0, 1, 2, 3, 4]);
    if (preset === 'weekends') setDaysOfWeek([5, 6]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Please specify a schedule name.');
      return;
    }

    if (daysOfWeek.length === 0) {
      setErrorMsg('Please select at least one active day of the week.');
      return;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      setErrorMsg('Please provide a valid hour (0-23) and minute (0-59).');
      return;
    }

    // Build search parameters based on target provider
    const searchParams: Record<string, any> = {
      limit: queryLimit > 0 ? queryLimit : 25,
    };

    if (provider === 'indeed' || provider === 'all') {
      searchParams.what = queryWhat.trim() || 'software engineer';
      searchParams.where = queryWhere.trim() || 'India';
    } else if (provider === 'linkedin') {
      searchParams.keywords = queryWhat.trim() || 'software engineer';
      searchParams.location = queryWhere.trim() || 'India';
    } else if (provider === 'wellfound') {
      searchParams.role = queryWhat.trim().toLowerCase().replace(/\s+/g, '-') || 'ai-engineer';
      searchParams.location = queryWhere.trim().toLowerCase() || 'india';
    }

    const payload: CreateCronJobPayload = {
      name: trimmedName,
      provider,
      hour,
      minute,
      days_of_week: daysOfWeek,
      search_params: searchParams,
      auto_parse: autoParse,
      is_enabled: isEnabled,
    };

    try {
      await onSave(payload, job?.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save cron job schedule.');
    }
  };

  // 12-hour preview string
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const timePreview = `${h12 < 10 ? `0${h12}` : h12}:${minute < 10 ? `0${minute}` : minute} ${period}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="w-full max-w-lg bg-[#181818] border border-[#2e2e2e] rounded-xl shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between bg-[#151515] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#3ecf8e]/10 border border-[#3ecf8e]/25 flex items-center justify-center text-[#3ecf8e]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-heading text-white">
                {isEditing ? 'Edit Cron Schedule' : 'New Cron Schedule'}
              </h2>
              <p className="text-[11px] font-sans text-[#6b7280]">
                Configure autonomous scraping timing and query parameters
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-1 rounded-md text-[#9ca3af] hover:text-white hover:bg-[#252525] transition-colors"
          >
            <Xmark className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-sans">
              {errorMsg}
            </div>
          )}

          {/* Schedule Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold font-heading text-[#d1d5db] block">
              Schedule Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Morning Indeed Scrape"
              className="w-full px-3.5 py-2 rounded-lg bg-[#141414] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555] transition-colors"
            />
          </div>

          {/* Provider Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold font-heading text-[#d1d5db] block">
              Target Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PROVIDERS.map((item) => {
                const Icon = item.icon;
                const isSelected = provider === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProvider(item.id)}
                    className={cn(
                      'flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium font-sans transition-all',
                      isSelected
                        ? item.activeColor
                        : 'border-[#262626] bg-[#141414] text-[#888] hover:text-[#d1d5db] hover:border-[#333]'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Run Time (Hour & Minute) */}
          <div className="space-y-2 p-3.5 rounded-lg bg-[#141414] border border-[#262626]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold font-heading text-[#d1d5db] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Execution Time (Local Time)</span>
              </label>
              <span className="text-xs font-mono font-bold text-[#3ecf8e] px-2 py-0.5 rounded bg-[#3ecf8e]/10 border border-[#3ecf8e]/20">
                {timePreview}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[11px] font-sans text-[#6b7280] block mb-1">
                  Hour (0 – 23)
                </span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-1.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white"
                />
              </div>

              <div>
                <span className="text-[11px] font-sans text-[#6b7280] block mb-1">
                  Minute (0 – 59)
                </span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-1.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* Quick Time Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-[10px] font-sans text-[#666] mr-1">Presets:</span>
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setHour(p.hour);
                    setMinute(p.minute);
                  }}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-mono border transition-all',
                    hour === p.hour && minute === p.minute
                      ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/40'
                      : 'bg-[#181818] text-[#888] border-[#2a2a2a] hover:text-white'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Days of Week */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold font-heading text-[#d1d5db]">
                Active Days of Week
              </label>
              <div className="flex items-center gap-1.5 text-[10px] font-sans text-[#6b7280]">
                <button
                  type="button"
                  onClick={() => handleSelectDaysPreset('daily')}
                  className="hover:text-[#3ecf8e] underline underline-offset-2"
                >
                  Daily
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => handleSelectDaysPreset('weekdays')}
                  className="hover:text-[#3ecf8e] underline underline-offset-2"
                >
                  Weekdays
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => handleSelectDaysPreset('weekends')}
                  className="hover:text-[#3ecf8e] underline underline-offset-2"
                >
                  Weekends
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((day) => {
                const isActive = daysOfWeek.includes(day.index);
                return (
                  <button
                    key={day.index}
                    type="button"
                    onClick={() => toggleDay(day.index)}
                    className={cn(
                      'py-2 rounded-lg text-xs font-mono font-bold flex flex-col items-center justify-center gap-0.5 border transition-all select-none',
                      isActive
                        ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/50 shadow-sm'
                        : 'bg-[#141414] text-[#6b7280] border-[#262626] hover:text-[#9ca3af] hover:border-[#333]'
                    )}
                  >
                    <span>{day.label}</span>
                    <span className="text-[9px] opacity-70 font-sans font-normal">
                      {day.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Query Parameters */}
          <div className="space-y-2.5 p-3.5 rounded-lg bg-[#141414] border border-[#262626]">
            <label className="text-xs font-semibold font-heading text-[#d1d5db] block">
              Search Parameters
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <span className="text-[11px] font-sans text-[#6b7280] block mb-1">
                  Job Role / Keywords
                </span>
                <input
                  type="text"
                  value={queryWhat}
                  onChange={(e) => setQueryWhat(e.target.value)}
                  placeholder="e.g. software engineer"
                  className="w-full px-3 py-1.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555]"
                />
              </div>

              <div>
                <span className="text-[11px] font-sans text-[#6b7280] block mb-1">
                  Location / City
                </span>
                <input
                  type="text"
                  value={queryWhere}
                  onChange={(e) => setQueryWhere(e.target.value)}
                  placeholder="e.g. India"
                  className="w-full px-3 py-1.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555]"
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] font-sans text-[#6b7280] block mb-1">
                Max Results Limit
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={queryLimit}
                onChange={(e) => setQueryLimit(parseInt(e.target.value) || 25)}
                className="w-32 px-3 py-1.5 rounded bg-[#1c1c1c] border border-[#2a2a2a] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white"
              />
            </div>
          </div>

          {/* Toggles: Auto-parse & Enabled */}
          <div className="space-y-3 pt-1">
            {/* Auto-parse Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#141414] border border-[#262626]">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-semibold font-heading text-white flex items-center gap-1.5">
                  <Spark className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Auto-Parse into Unified Jobs</span>
                </div>
                <p className="text-[11px] font-sans text-[#6b7280]">
                  Immediately triggers LLM normalization and extraction upon scrape completion.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={autoParse}
                onClick={() => setAutoParse(!autoParse)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  autoParse ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                    autoParse ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Is Enabled Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#141414] border border-[#262626]">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-semibold font-heading text-white">
                  Schedule Active
                </div>
                <p className="text-[11px] font-sans text-[#6b7280]">
                  When disabled, the scheduler ignores this job until re-enabled.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={() => setIsEnabled(!isEnabled)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  isEnabled ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                    isEnabled ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#262626]">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-[#d1d5db] hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#34b27b] text-[#131313] text-xs font-sans font-bold shadow-lg shadow-[#3ecf8e]/20 transition-all disabled:opacity-50'
              )}
            >
              {isSaving ? (
                <>
                  <Refresh className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isEditing ? 'Update Schedule' : 'Create Schedule'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CronModal;
