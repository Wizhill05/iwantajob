'use client';

import React, { useState } from 'react';
import {
  OpenNewWindow,
  Globe,
  Flash,
  GraduationCap,
  Spark,
  Building,
  MapPin,
  Clock,
  Notes,
  Cpu,
  Eye,
  CheckCircle,
} from 'iconoir-react';
import type { UnifiedJobItem } from '@/lib/types';
import { cn, formatSalaryLPA, formatRelativeTime, truncate } from '@/lib/utils';

interface CleanJobCardProps {
  job: UnifiedJobItem;
  onViewDetails: (job: UnifiedJobItem) => void;
}

const SOURCE_CONFIG = {
  indeed: {
    label: 'Indeed',
    badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  linkedin: {
    label: 'LinkedIn',
    badgeClass: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  wellfound: {
    label: 'Wellfound',
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
};

const EXTRACTION_METHOD_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  native: {
    label: 'native',
    badgeClass: 'text-[#3ecf8e] bg-[#3ecf8e]/10 border-[#3ecf8e]/25',
  },
  regex: {
    label: 'regex',
    badgeClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  },
  llm: {
    label: 'llm',
    badgeClass: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  },
  none: {
    label: 'none',
    badgeClass: 'text-[#6b7280] bg-[#262626] border-[#383838]',
  },
};

function formatExperience(job: UnifiedJobItem): string {
  if (job.is_fresher_friendly || job.experience_min_years === 0) {
    if (job.experience_max_years && job.experience_max_years > 0) {
      return `Fresher (0 – ${job.experience_max_years} yrs)`;
    }
    return 'Fresher (0 yrs)';
  }

  if (job.experience_min_years != null && job.experience_max_years != null) {
    if (job.experience_min_years === job.experience_max_years) {
      return `${job.experience_min_years} yrs`;
    }
    return `${job.experience_min_years} – ${job.experience_max_years} yrs`;
  }

  if (job.experience_min_years != null) {
    return `${job.experience_min_years}+ yrs`;
  }

  if (job.experience_max_years != null) {
    return `Up to ${job.experience_max_years} yrs`;
  }

  return 'Not specified';
}

export function CleanJobCard({ job, onViewDetails }: CleanJobCardProps) {
  const [logoError, setLogoError] = useState(false);

  const sourceConfig = SOURCE_CONFIG[job.source] || {
    label: job.source,
    badgeClass: 'text-gray-400 bg-gray-500/10 border-gray-500/25',
  };

  const salaryMethodConfig =
    EXTRACTION_METHOD_CONFIG[job.salary_extraction_method] ||
    EXTRACTION_METHOD_CONFIG.none;

  const expMethodConfig =
    EXTRACTION_METHOD_CONFIG[job.experience_extraction_method] ||
    EXTRACTION_METHOD_CONFIG.none;

  const salaryText = formatSalaryLPA(
    job.salary_min_inr_year,
    job.salary_max_inr_year
  );

  const expText = formatExperience(job);

  const initialLetter = job.company_name
    ? job.company_name.trim().charAt(0).toUpperCase()
    : 'J';

  return (
    <div className="rounded-xl bg-[#181818] border border-[#262626] hover:border-[#383838] transition-all p-4 md:p-5 shadow-sm space-y-3.5 flex flex-col justify-between group">
      {/* Top Section */}
      <div className="space-y-3">
        {/* Header: Company Avatar, Title, Source & Fresher Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Company Logo / Monogram */}
            {job.company_logo_url && !logoError ? (
              <img
                src={job.company_logo_url}
                alt={job.company_name}
                onError={() => setLogoError(true)}
                className="w-10 h-10 rounded-lg object-contain bg-[#202020] border border-[#262626] p-1 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#202020] border border-[#262626] flex items-center justify-center flex-shrink-0 text-sm font-sans font-semibold text-[#3ecf8e]">
                {initialLetter || <Building className="w-5 h-5 text-[#9ca3af]" />}
              </div>
            )}

            {/* Title & Employer */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm md:text-base font-semibold text-white font-heading truncate leading-snug group-hover:text-[#3ecf8e] transition-colors">
                  {job.title}
                </h4>
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-sans font-medium rounded-full border',
                    sourceConfig.badgeClass
                  )}
                >
                  {sourceConfig.label}
                </span>
              </div>
              <p className="text-xs text-[#9ca3af] font-medium truncate mt-0.5 font-sans">
                {job.company_name || 'Confidential Employer'}
              </p>
            </div>
          </div>

          {/* Quick Apply Link */}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open canonical job page"
            className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] hover:border-[#383838] text-[#9ca3af] hover:text-[#3ecf8e] transition-all flex-shrink-0"
          >
            <OpenNewWindow className="w-4 h-4" />
          </a>
        </div>

        {/* Standardized Location & Setting Pills */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-sans">
          {/* Standardized City Slug */}
          <div className="flex items-center gap-1 text-[#d1d5db]">
            <MapPin className="w-3.5 h-3.5 text-[#3ecf8e] flex-shrink-0" />
            <span className="capitalize font-medium">
              {job.city || job.location_raw || 'Unspecified'}
            </span>
          </div>

          {/* Raw Location tooltip/secondary if different from city */}
          {job.location_raw && job.city && job.location_raw.toLowerCase() !== job.city.toLowerCase() && (
            <span className="text-[#6b7280] truncate max-w-[140px]" title={job.location_raw}>
              ({truncate(job.location_raw, 20)})
            </span>
          )}

          {/* Remote Badge */}
          {job.is_remote && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-emerald-500/10 text-[#3ecf8e] border-emerald-500/25">
              <Globe className="w-3 h-3" />
              Remote
            </span>
          )}

          {/* Easy Apply Badge */}
          {job.easy_apply_available && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/25">
              <Flash className="w-3 h-3" />
              Easy Apply
            </span>
          )}

          {/* Fresher Friendly Badge */}
          {job.is_fresher_friendly && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-teal-500/10 text-teal-300 border-teal-500/25">
              <GraduationCap className="w-3 h-3" />
              Fresher Friendly
            </span>
          )}
        </div>

        {/* Normalized Fields Row: Compensation & Experience */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#262626]/80">
          {/* Salary Box */}
          <div className="p-2 rounded-lg bg-[#141414] border border-[#262626] space-y-1">
            <div className="flex items-center justify-between text-[10px] font-sans text-[#9ca3af]">
              <span>Annual Compensation</span>
              <span
                className={cn(
                  'px-1 rounded text-[9px] font-sans font-medium border',
                  salaryMethodConfig.badgeClass
                )}
                title={`Extraction method: ${job.salary_extraction_method}`}
              >
                {salaryMethodConfig.label}
              </span>
            </div>
            <div className="text-xs font-mono font-semibold text-white">
              {salaryText}
            </div>
          </div>

          {/* Experience Box */}
          <div className="p-2 rounded-lg bg-[#141414] border border-[#262626] space-y-1">
            <div className="flex items-center justify-between text-[10px] font-sans text-[#9ca3af]">
              <span>Experience</span>
              <span
                className={cn(
                  'px-1 rounded text-[9px] font-sans font-medium border',
                  expMethodConfig.badgeClass
                )}
                title={`Extraction method: ${job.experience_extraction_method}`}
              >
                {expMethodConfig.label}
              </span>
            </div>
            <div className="text-xs font-mono font-semibold text-[#3ecf8e]">
              {expText}
            </div>
          </div>
        </div>

        {/* Description Excerpt */}
        {job.description_text && (
          <p className="text-xs text-[#9ca3af] leading-relaxed line-clamp-2">
            {job.description_text}
          </p>
        )}
      </div>

      {/* Card Footer: Metadata & Actions */}
      <div className="pt-3 border-t border-[#262626] flex items-center justify-between gap-2 text-xs font-sans">
        <div className="flex items-center gap-1.5 text-[#6b7280] text-[11px]">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatRelativeTime(job.posted_at || job.parsed_at)}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Details / Drawer Button */}
          <button
            type="button"
            onClick={() => onViewDetails(job)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] hover:border-[#383838] text-xs font-sans text-[#d1d5db] hover:text-white transition-all"
          >
            <Notes className="w-3.5 h-3.5 text-[#3ecf8e]" />
            <span>Details</span>
          </button>

          {/* Direct Apply Button */}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ecf8e]/15 hover:bg-[#3ecf8e]/25 border border-[#3ecf8e]/30 hover:border-[#3ecf8e]/50 text-xs font-sans font-semibold text-[#3ecf8e] transition-all"
          >
            <span>Apply</span>
            <OpenNewWindow className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default CleanJobCard;
