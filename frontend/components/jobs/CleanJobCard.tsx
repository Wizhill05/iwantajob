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
import { cn, formatSalaryAverageLPA, formatRelativeTime, truncate } from '@/lib/utils';

interface CleanJobCardProps {
  job: UnifiedJobItem;
  onViewDetails: (job: UnifiedJobItem) => void;
}

function formatExperience(job: UnifiedJobItem): string {
  // Only label as "Fresher" when the job genuinely requires no experience.
  // A job needing 1+ year can be flagged fresher-friendly (accepts early
  // candidates), but must not display as "Fresher (0 – Xy)".
  const isEntryLevel =
    job.experience_min_years === 0 ||
    (job.experience_min_years == null && job.is_fresher_friendly);
  if (isEntryLevel) {
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

  const salaryText = formatSalaryAverageLPA(
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
            <div className="text-[10px] font-sans text-[#9ca3af]">
              <span>Annual Compensation</span>
            </div>
            <div className="text-xs font-mono font-semibold text-white">
              {salaryText}
            </div>
          </div>

          {/* Experience Box */}
          <div className="p-2 rounded-lg bg-[#141414] border border-[#262626] space-y-1">
            <div className="text-[10px] font-sans text-[#9ca3af]">
              <span>Experience</span>
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
