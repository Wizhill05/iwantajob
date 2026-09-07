'use client';

import React, { useState } from 'react';
import {
  OpenNewWindow,
  Globe,
  Check,
  Clock,
  Coins,
  MapPin,
  Building,
  NavArrowDown,
  NavArrowUp,
  Page,
} from 'iconoir-react';
import type { JobItem } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface ScrapedJobCardProps {
  job: JobItem;
  index?: number;
}

const SOURCE_CONFIG = {
  indeed: {
    label: 'Indeed',
    badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  },
  linkedin: {
    label: 'LinkedIn',
    badgeClass: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  },
  wellfound: {
    label: 'Wellfound',
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  },
};

export function ScrapedJobCard({ job, index }: ScrapedJobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const sourceConfig = SOURCE_CONFIG[job.source] || {
    label: job.source,
    badgeClass: 'text-gray-400 bg-gray-500/10 border-gray-500/25',
  };

  const initialLetter = job.company_name
    ? job.company_name.trim().charAt(0).toUpperCase()
    : 'J';

  return (
    <div className="bg-[#181818] hover:bg-[#1c1c1c] transition-all p-3.5 sm:p-4 shadow-none space-y-3">
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Logo or Monogram */}
          {job.company_logo_url && !logoError ? (
            <img
              src={job.company_logo_url}
              alt={job.company_name}
              onError={() => setLogoError(true)}
              className="w-9 h-9 rounded-md object-contain bg-[#202020] border border-[#262626] p-1 flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-[#202020] border border-[#262626] flex items-center justify-center flex-shrink-0 text-sm font-sans font-semibold text-[#3ecf8e]">
              {initialLetter || <Building className="w-4 h-4 text-[#9ca3af]" />}
            </div>
          )}

          {/* Title & Company */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs sm:text-sm font-semibold text-white font-heading truncate leading-snug">
                {job.title}
              </h4>
              <span
                className={cn(
                  'px-1.5 py-0.2 text-[9px] font-sans font-medium rounded border',
                  sourceConfig.badgeClass
                )}
              >
                {sourceConfig.label}
              </span>
              {job.is_in_db && (
                <span className="px-1.5 py-0.2 text-[9px] font-sans font-medium rounded border bg-blue-500/10 border-blue-500/30 text-blue-400">
                  In DB
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#9ca3af] font-medium truncate mt-0.5 font-sans">
              {job.company_name || 'Confidential Employer'}
            </p>
          </div>
        </div>

        {/* View Canonical Job Link */}
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open listing in new tab"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#202020] hover:bg-[#262626] border border-[#262626] hover:border-[#383838] text-xs font-sans font-medium text-[#9ca3af] hover:text-white transition-all flex-shrink-0"
          >
            <span>View</span>
            <OpenNewWindow className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Metadata Badges / Tags Row */}
      <div className="flex items-center gap-1.5 md:gap-2 flex-wrap text-xs text-[#9ca3af] font-sans">
        {/* Location */}
        {job.location_raw && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-[11px] font-sans text-[#d1d5db]">
            <MapPin className="w-3 h-3 text-[#9ca3af]" />
            <span className="truncate max-w-[180px]">{job.location_raw}</span>
          </span>
        )}

        {/* City if separate and distinct */}
        {job.city && job.city.toLowerCase() !== job.location_raw.toLowerCase() && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-[11px] font-sans text-[#9ca3af] capitalize">
            {job.city}
          </span>
        )}

        {/* Remote Status */}
        {job.is_remote && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#3ecf8e]/10 border border-[#3ecf8e]/30 text-[11px] font-sans text-[#3ecf8e]">
            <Globe className="w-3 h-3" />
            <span>Remote</span>
          </span>
        )}

        {/* Salary */}
        {job.salary_raw && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-sans text-emerald-400">
            <Coins className="w-3 h-3" />
            <span>{job.salary_raw}</span>
          </span>
        )}

        {/* Posted Timestamp */}
        {job.posted_at && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-[11px] font-sans text-[#9ca3af]">
            <Clock className="w-3 h-3 text-[#9ca3af]" />
            <span>{formatRelativeTime(job.posted_at)}</span>
          </span>
        )}

        {/* Attributes/Cards */}
        {Array.isArray(job.attributes) &&
          job.attributes.map((attr, i) => {
            const label =
              typeof attr === 'object' && attr !== null
                ? attr.label || attr.key || ''
                : String(attr);
            if (!label) return null;
            return (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded bg-[#202020] border border-[#262626] text-[10px] font-sans text-[#9ca3af]"
              >
                {label}
              </span>
            );
          })}
      </div>

      {/* Expandable Job Description Section */}
      <div className="pt-2 border-t border-[#262626]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-sans text-[#9ca3af] hover:text-white transition-colors"
          >
            {expanded ? (
              <>
                <NavArrowUp className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Hide Description</span>
              </>
            ) : (
              <>
                <NavArrowDown className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>View Description</span>
              </>
            )}
          </button>

          <span className="text-[10px] font-mono text-[#6b7280]">
            ID: {job.external_id}
          </span>
        </div>

        {expanded && (
          <div className="mt-3 p-3.5 rounded-lg bg-[#131313] border border-[#262626] max-h-72 overflow-y-auto">
            {job.description_text ? (
              <p className="text-xs text-[#d1d5db] leading-relaxed whitespace-pre-wrap font-sans">
                {job.description_text}
              </p>
            ) : (
              <p className="text-xs font-sans text-[#6b7280] italic">
                No description text captured in card payload.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScrapedJobCard;
