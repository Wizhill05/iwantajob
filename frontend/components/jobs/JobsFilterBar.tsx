'use client';

import React from 'react';
import {
  Filter,
  Search,
  MapPin,
  Coins,
  GraduationCap,
  Flash,
  Undo,
  Globe,
  Building,
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
  if (filters.searchQuery && filters.searchQuery.trim() !== '') count++;
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
  { label: 'Chennai', value: 'chennai' },
];

const SOURCE_OPTIONS: Array<{
  id: JobsFilterValues['source'];
  label: string;
  badgeClass: string;
  activeClass: string;
}> = [
  {
    id: 'all',
    label: 'All Sources',
    badgeClass: 'text-gray-400',
    activeClass: 'bg-[#262626] text-white border-[#3ecf8e]',
  },
  {
    id: 'indeed',
    label: 'Indeed',
    badgeClass: 'text-sky-400',
    activeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    badgeClass: 'text-blue-400',
    activeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
  },
  {
    id: 'wellfound',
    label: 'Wellfound',
    badgeClass: 'text-rose-400',
    activeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
  },
];

export function JobsFilterBar({
  filters,
  onChange,
  onReset,
  totalResults,
  isLoading = false,
}: JobsFilterBarProps) {
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
    <div className="bg-[#181818] border-y md:border border-[#262626] rounded-none md:rounded-xl p-4 md:p-5 shadow-none md:shadow-sm space-y-4">
      {/* Header Row: Filter Title, Active Count Badge & Reset Button */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#262626] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#202020] border border-[#262626] flex items-center justify-center text-[#3ecf8e]">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-heading text-white">
              Filter Clean Repository
            </h3>
            <p className="text-[11px] font-sans text-[#9ca3af]">
              Instant multi-dimensional filter across normalized fields
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <span
              className="px-2 py-0.5 rounded-full bg-[#3ecf8e]/15 text-[#3ecf8e] border border-[#3ecf8e]/30 font-sans text-xs font-medium inline-flex items-center gap-1"
            >
              <span className="font-mono">{activeCount}</span> {activeCount === 1 ? 'Filter Active' : 'Filters Active'}
            </span>
          ) : (
            <span className="text-[11px] font-sans text-[#6b7280]">
              No active filters
            </span>
          )}

          <button
            type="button"
            onClick={onReset}
            disabled={activeCount === 0 || isLoading}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-sans transition-all',
              activeCount > 0 && !isLoading
                ? 'bg-[#202020] hover:bg-[#262626] border-[#262626] hover:border-rose-500/40 text-[#9ca3af] hover:text-rose-400'
                : 'bg-[#181818] border-transparent text-[#4b5563] cursor-not-allowed opacity-50'
            )}
          >
            <Undo className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Primary Row: Keyword Search & City Slug Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Title / Keyword Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={filters.searchQuery || ''}
            onChange={(e) => updateField('searchQuery', e.target.value)}
            placeholder="Search title, tech stack, or employer..."
            className="w-full pl-9 pr-3 py-2 text-xs font-sans rounded-lg bg-[#141414] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
          />
        </div>

        {/* City Filter Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]">
            <MapPin className="w-4 h-4 text-[#3ecf8e]" />
          </div>
          <input
            type="text"
            value={filters.city}
            onChange={(e) => updateField('city', e.target.value.toLowerCase())}
            placeholder="Filter city (e.g. bengaluru, pune, delhi-ncr)..."
            className="w-full pl-9 pr-3 py-2 text-xs font-sans rounded-lg bg-[#141414] border border-[#262626] text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3ecf8e] transition-colors"
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
      </div>

      {/* Popular City Quick-Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-sans">
        <span className="text-[#6b7280] flex-shrink-0 mr-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Cities:
        </span>
        {POPULAR_CITIES.map((c) => {
          const isSelected =
            c.value === '' ? filters.city === '' : filters.city.toLowerCase() === c.value;

          return (
            <button
              key={c.label}
              type="button"
              onClick={() => updateField('city', isSelected && c.value !== '' ? '' : c.value)}
              className={cn(
                'px-2.5 py-1 rounded-md border transition-all whitespace-nowrap flex-shrink-0 text-xs font-sans',
                isSelected
                  ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/40 text-[#3ecf8e] font-semibold'
                  : 'bg-[#141414] border-[#262626] text-[#9ca3af] hover:text-white hover:border-[#383838]'
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Secondary Controls: Source, Fresher-Friendly & Easy Apply Segmented Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
        {/* Source Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-sans text-[#9ca3af] block">
            Aggregator Source
          </label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
            {SOURCE_OPTIONS.map((opt) => {
              const isSelected = filters.source === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateField('source', opt.id)}
                  className={cn(
                    'py-1.5 px-2 rounded text-[11px] font-sans transition-all text-center',
                    isSelected
                      ? cn('border font-semibold shadow-sm', opt.activeClass)
                      : 'text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fresher-Friendly Filter */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-sans text-[#9ca3af] flex items-center justify-between">
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>Experience Level</span>
            </span>
            <span className="text-[10px] text-[#6b7280]">min &le; 1 yr</span>
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
            {[
              { id: 'all', label: 'All Levels' },
              { id: 'true', label: 'Freshers Only' },
              { id: 'false', label: 'Experienced' },
            ].map((opt) => {
              const isSelected = filters.is_fresher_friendly === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    updateField('is_fresher_friendly', opt.id as JobsFilterValues['is_fresher_friendly'])
                  }
                  className={cn(
                    'py-1.5 px-2 rounded text-[11px] font-sans transition-all text-center',
                    isSelected
                      ? 'bg-[#3ecf8e]/15 border border-[#3ecf8e]/40 text-[#3ecf8e] font-semibold'
                      : 'text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Easy Apply Filter */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-sans text-[#9ca3af] flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Flash className="w-3.5 h-3.5 text-amber-400" />
              <span>Application Type</span>
            </span>
            <span className="text-[10px] text-[#6b7280]">Direct vs ATS</span>
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#141414] border border-[#262626] rounded-lg">
            {[
              { id: 'all', label: 'All Types' },
              { id: 'true', label: 'Easy Apply' },
              { id: 'false', label: 'External ATS' },
            ].map((opt) => {
              const isSelected = filters.easy_apply_available === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    updateField('easy_apply_available', opt.id as JobsFilterValues['easy_apply_available'])
                  }
                  className={cn(
                    'py-1.5 px-2 rounded text-[11px] font-sans transition-all text-center',
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold'
                      : 'text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] border border-transparent'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Salary Floor Slider */}
      <div className="pt-2 border-t border-[#262626] space-y-2">
        <div className="flex items-center justify-between text-xs font-sans">
          <div className="flex items-center gap-1.5 text-[#9ca3af]">
            <Coins className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Annual Compensation Floor</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded border text-xs font-semibold',
                filters.min_salary_lpa > 0
                  ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/30 text-[#3ecf8e]'
                  : 'bg-[#141414] border-[#262626] text-[#9ca3af]'
              )}
            >
              {filters.min_salary_lpa === 0
                ? 'Any Salary (0+ LPA)'
                : `Min: ₹${filters.min_salary_lpa}L/yr`}
            </span>
            {filters.min_salary_lpa > 0 && (
              <span className="text-[11px] font-mono text-[#6b7280] hidden sm:inline">
                (&ge; ₹{(filters.min_salary_lpa * 100000).toLocaleString('en-IN')}/yr)
              </span>
            )}
          </div>
        </div>

        {/* Range Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={filters.min_salary_lpa}
            onChange={(e) => updateField('min_salary_lpa', Number(e.target.value))}
            className="w-full h-1.5 bg-[#262626] rounded-lg appearance-none cursor-pointer accent-[#3ecf8e]"
          />
          <div className="flex justify-between text-[10px] font-mono text-[#6b7280]">
            <span>0 LPA</span>
            <span>10 LPA</span>
            <span>20 LPA</span>
            <span>30 LPA</span>
            <span>40 LPA</span>
            <span>50 LPA</span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] font-sans">
          <span className="text-[#6b7280] text-[10px] mr-1">Presets:</span>
          {[0, 6, 12, 18, 25, 35].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => updateField('min_salary_lpa', val)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] border transition-all font-mono',
                filters.min_salary_lpa === val
                  ? 'bg-[#3ecf8e]/20 border-[#3ecf8e]/40 text-[#3ecf8e] font-semibold'
                  : 'bg-[#141414] border-[#262626] text-[#9ca3af] hover:text-white hover:border-[#383838]'
              )}
            >
              {val === 0 ? 'Any' : `${val} LPA`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default JobsFilterBar;
