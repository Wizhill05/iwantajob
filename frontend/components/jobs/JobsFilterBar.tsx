'use client';

import React, { useState } from 'react';
import {
  Filter,
  Search,
  MapPin,
  Coins,
  GraduationCap,
  Flash,
  Undo,
  NavArrowDown,
  NavArrowUp,
  Xmark,
  Check,
} from 'iconoir-react';
import { cn } from '@/lib/utils';

export interface JobsFilterValues {
  source: 'all' | 'indeed' | 'linkedin' | 'wellfound';
  city: string;
  is_fresher_friendly: 'all' | 'true' | 'false';
  easy_apply_available: 'all' | 'true' | 'false';
  min_salary_lpa: number; // 0 to 50 LPA
  searchQuery?: string;
}

export const DEFAULT_FILTERS: JobsFilterValues = {
  source: 'all',
  city: '',
  is_fresher_friendly: 'all',
  easy_apply_available: 'all',
  min_salary_lpa: 0,
  searchQuery: '',
};

export function getActiveFilterCount(filters: JobsFilterValues): number {
  let count = 0;
  if (filters.source !== 'all') count++;
  if (filters.city.trim() !== '') count++;
  if (filters.is_fresher_friendly !== 'all') count++;
  if (filters.easy_apply_available !== 'all') count++;
  if (filters.min_salary_lpa > 0) count++;
  return count;
}

interface JobsFilterBarProps {
  filters: JobsFilterValues;
  onChange: (updated: JobsFilterValues) => void;
  onReset: () => void;
  totalResults?: number;
  isLoading?: boolean;
}

const POPULAR_CITIES = [
  { label: 'All Cities', value: '' },
  { label: 'Bengaluru', value: 'bengaluru' },
  { label: 'Pune', value: 'pune' },
  { label: 'Delhi-NCR', value: 'delhi-ncr' },
  { label: 'Hyderabad', value: 'hyderabad' },
  { label: 'Mumbai', value: 'mumbai' },
  { label: 'Gurugram', value: 'gurugram' },
  { label: 'Noida', value: 'noida' },
  { label: 'Remote', value: 'remote' },
];

const SOURCE_OPTIONS: Array<{
  id: JobsFilterValues['source'];
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'wellfound', label: 'Wellfound' },
];

export function JobsFilterBar({
  filters,
  onChange,
  onReset,
  isLoading = false,
}: JobsFilterBarProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const activeCount = getActiveFilterCount(filters);

  const updateField = <K extends keyof JobsFilterValues>(
    field: K,
    value: JobsFilterValues[K]
  ) => {
    onChange({
      ...filters,
      [field]: value,
    });
  };

  return (
    <div className="space-y-3">
      {/* Compact Top Control Bar */}
      <div className="flex items-center gap-2">
        {/* Quick Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={filters.searchQuery || ''}
            onChange={(e) => updateField('searchQuery', e.target.value)}
            placeholder="Search role, skills, or company..."
            className="w-full pl-9 pr-3 py-2 text-xs font-sans rounded-lg bg-[#181818] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => updateField('searchQuery', '')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-[#6b7280] hover:text-white"
            >
              <Xmark className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters Toggle Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-sans font-medium transition-all shrink-0',
            isOpen
              ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/40 text-[#3ecf8e]'
              : activeCount > 0
              ? 'bg-[#202020] border-[#3ecf8e]/40 text-white'
              : 'bg-[#181818] hover:bg-[#202020] border-[#262626] text-[#9ca3af] hover:text-white'
          )}
        >
          <Filter className={cn('w-3.5 h-3.5', activeCount > 0 ? 'text-[#3ecf8e]' : '')} />
          <span>Filters</span>

          {activeCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3ecf8e] text-[#131313] font-mono text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}

          {isOpen ? (
            <NavArrowUp className="w-3.5 h-3.5 text-[#3ecf8e]" />
          ) : (
            <NavArrowDown className="w-3.5 h-3.5 text-[#6b7280]" />
          )}
        </button>

        {/* Reset Button (only shown if filters are active) */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            disabled={isLoading}
            title="Reset Filters"
            className="p-2 rounded-xl bg-[#181818] hover:bg-[#202020] border border-[#262626] text-[#9ca3af] hover:text-rose-400 transition-colors shrink-0"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expandable Filters Section */}
      {isOpen && (
        <div className="bg-[#181818] -mx-4 sm:mx-0 border-y sm:border border-[#262626] sm:rounded-lg p-3.5 sm:p-4 space-y-4 animate-in fade-in-50 slide-in-from-top-2 duration-150">
          {/* Header Row in Expanded Section */}
          <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#3ecf8e]" />
              <span className="text-xs font-semibold text-white font-sans">
                Filter Parameters
              </span>
              {activeCount > 0 && (
                <span className="text-[11px] font-mono text-[#3ecf8e]">
                  ({activeCount} active)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-sans text-[#9ca3af] hover:text-white transition-colors"
                >
                  Reset all
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-sans text-[#3ecf8e] hover:underline"
              >
                Done
              </button>
            </div>
          </div>

          {/* City Search & Quick Pills */}
          <div className="space-y-2">
            <label className="text-[11px] font-sans text-[#9ca3af] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Location / City</span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={filters.city}
                onChange={(e) => updateField('city', e.target.value.toLowerCase())}
                placeholder="Enter city slug (e.g. bengaluru, pune, delhi-ncr)..."
                className="w-full px-3 py-1.5 text-xs font-sans rounded-lg bg-[#141414] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e]"
              />
              {filters.city && (
                <button
                  type="button"
                  onClick={() => updateField('city', '')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[10px] font-sans text-[#9ca3af] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {POPULAR_CITIES.map((c) => {
                const isSelected =
                  c.value === '' ? filters.city === '' : filters.city.toLowerCase() === c.value;

                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => updateField('city', isSelected && c.value !== '' ? '' : c.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap text-xs font-sans',
                      isSelected
                        ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/40 text-[#3ecf8e] font-medium'
                        : 'bg-[#141414] border-[#262626] text-[#9ca3af] hover:text-white'
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Three-Column Knobs: Source, Experience, Apply Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#262626]">
            {/* Aggregator Source */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-sans text-[#9ca3af] block">
                Platform Source
              </span>
              <div className="grid grid-cols-4 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateField('source', opt.id)}
                    className={cn(
                      'py-1 text-[11px] font-sans rounded transition-all text-center',
                      filters.source === opt.id
                        ? 'bg-[#222] text-white font-medium'
                        : 'text-[#808080] hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-sans text-[#9ca3af] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Experience</span>
                </span>
                <span className="text-[10px] text-[#6b7280]">min &le; 1 yr</span>
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'true', label: 'Freshers' },
                  { id: 'false', label: 'Experienced' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      updateField('is_fresher_friendly', opt.id as JobsFilterValues['is_fresher_friendly'])
                    }
                    className={cn(
                      'py-1 text-[11px] font-sans rounded transition-all text-center',
                      filters.is_fresher_friendly === opt.id
                        ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] font-medium'
                        : 'text-[#808080] hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Application Type */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-sans text-[#9ca3af] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Flash className="w-3.5 h-3.5 text-amber-400" />
                  <span>Apply Type</span>
                </span>
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'true', label: 'Easy Apply' },
                  { id: 'false', label: 'External' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      updateField('easy_apply_available', opt.id as JobsFilterValues['easy_apply_available'])
                    }
                    className={cn(
                      'py-1 text-[11px] font-sans rounded transition-all text-center',
                      filters.easy_apply_available === opt.id
                        ? 'bg-amber-500/15 text-amber-300 font-medium'
                        : 'text-[#808080] hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Minimum Salary Range Slider */}
          <div className="pt-2 border-t border-[#262626] space-y-2">
            <div className="flex items-center justify-between text-xs font-sans">
              <div className="flex items-center gap-1.5 text-[#9ca3af]">
                <Coins className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Annual Compensation Floor</span>
              </div>
              <span className="font-mono font-medium text-white">
                {filters.min_salary_lpa === 0 ? 'Any Pay' : `Min: ₹${filters.min_salary_lpa} LPA`}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={filters.min_salary_lpa}
              onChange={(e) => updateField('min_salary_lpa', Number(e.target.value))}
              className="w-full h-1.5 bg-[#262626] rounded appearance-none cursor-pointer accent-[#3ecf8e]"
            />

            <div className="flex items-center justify-between text-[10px] font-mono text-[#6b7280]">
              <span>0 LPA</span>
              <span>15 LPA</span>
              <span>30 LPA</span>
              <span>50 LPA+</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JobsFilterBar;
