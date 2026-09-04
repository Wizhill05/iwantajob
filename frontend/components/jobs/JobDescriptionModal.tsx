'use client';

import React, { useEffect, useState } from 'react';
import {
  Xmark,
  OpenNewWindow,
  Building,
  MapPin,
  Clock,
  Database,
  Coins,
  GraduationCap,
  Flash,
  Globe,
  Check,
  Notes,
  Code,
  Spark,
  Cpu,
} from 'iconoir-react';
import type { UnifiedJobItem } from '@/lib/types';
import { cn, formatSalaryLPA, formatRelativeTime } from '@/lib/utils';

interface JobDescriptionModalProps {
  job: UnifiedJobItem | null;
  isOpen: boolean;
  onClose: () => void;
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

export function JobDescriptionModal({
  job,
  isOpen,
  onClose,
}: JobDescriptionModalProps) {
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !job) return null;

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

  const salaryFormatted = formatSalaryLPA(
    job.salary_min_inr_year,
    job.salary_max_inr_year
  );

  const initialLetter = job.company_name
    ? job.company_name.trim().charAt(0).toUpperCase()
    : 'J';

  const handleCopyDescription = () => {
    if (job.description_text) {
      navigator.clipboard.writeText(job.description_text);
      setCopiedDesc(true);
      setTimeout(() => setCopiedDesc(false), 2000);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-drawer-title"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#131313]/80 backdrop-blur-sm transition-opacity duration-300"
      />

      {/* Sliding Drawer Container */}
      <div className="relative w-full max-w-2xl bg-[#181818] border-l border-[#262626] shadow-2xl z-10 flex flex-col h-full max-h-screen animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-[#262626] flex items-start justify-between gap-4 bg-[#181818]/90 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            {job.company_logo_url && !logoError ? (
              <img
                src={job.company_logo_url}
                alt={job.company_name}
                onError={() => setLogoError(true)}
                className="w-12 h-12 rounded-xl object-contain bg-[#202020] border border-[#262626] p-1 flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#202020] border border-[#262626] flex items-center justify-center flex-shrink-0 text-base font-mono font-bold text-[#3ecf8e]">
                {initialLetter || <Building className="w-6 h-6 text-[#9ca3af]" />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-mono font-medium rounded-full border',
                    sourceConfig.badgeClass
                  )}
                >
                  {sourceConfig.label}
                </span>

                {job.city && (
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full border border-[#262626] bg-[#141414] text-[#d1d5db] capitalize">
                    {job.city}
                  </span>
                )}

                {job.is_remote && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono bg-emerald-500/10 text-[#3ecf8e] border-emerald-500/25">
                    <Globe className="w-3 h-3" />
                    Remote
                  </span>
                )}

                {job.easy_apply_available && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono bg-amber-500/10 text-amber-300 border-amber-500/25">
                    <Flash className="w-3 h-3" />
                    Easy Apply
                  </span>
                )}

                {job.is_fresher_friendly && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono bg-teal-500/10 text-teal-300 border-teal-500/25">
                    <GraduationCap className="w-3 h-3" />
                    Fresher Friendly
                  </span>
                )}
              </div>

              <h2
                id="job-drawer-title"
                className="text-lg md:text-xl font-bold font-heading text-white mt-1.5 leading-snug"
              >
                {job.title}
              </h2>
              <p className="text-xs text-[#9ca3af] font-medium mt-0.5">
                {job.company_name || 'Confidential Employer'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg border border-[#262626] bg-[#202020] text-[#9ca3af] hover:text-white hover:border-[#383838] transition-colors flex-shrink-0"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Key Normalized Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Compensation Box */}
            <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af]">
                <div className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-[#3ecf8e]" />
                  <span>Annual Compensation</span>
                </div>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded text-[10px] font-mono border uppercase',
                    salaryMethodConfig.badgeClass
                  )}
                >
                  {salaryMethodConfig.label}
                </span>
              </div>
              <div className="text-base font-mono font-bold text-white">
                {salaryFormatted}
              </div>
              {job.salary_raw && (
                <div className="text-[11px] font-mono text-[#6b7280]">
                  Raw: &quot;{job.salary_raw}&quot;
                </div>
              )}
            </div>

            {/* Experience Box */}
            <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-[#9ca3af]">
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-[#3ecf8e]" />
                  <span>Experience Required</span>
                </div>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded text-[10px] font-mono border uppercase',
                    expMethodConfig.badgeClass
                  )}
                >
                  {expMethodConfig.label}
                </span>
              </div>
              <div className="text-base font-mono font-bold text-[#3ecf8e]">
                {job.is_fresher_friendly || job.experience_min_years === 0
                  ? 'Fresher Eligible (0 yrs)'
                  : job.experience_min_years != null
                  ? `${job.experience_min_years}${
                      job.experience_max_years ? ` – ${job.experience_max_years}` : '+'
                    } years`
                  : 'Not specified'}
              </div>
              <div className="text-[11px] font-mono text-[#6b7280]">
                Fresher Flag: {job.is_fresher_friendly ? 'TRUE' : 'FALSE'}
              </div>
            </div>
          </div>

          {/* Staging & Provenance Metadata Accordion / Card */}
          <div className="rounded-xl bg-[#141414] border border-[#262626] p-4 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#262626] pb-2 text-[11px] text-[#9ca3af]">
              <div className="flex items-center gap-1.5 text-[#3ecf8e] font-semibold">
                <Database className="w-3.5 h-3.5" />
                <span>Silver Tier Provenance</span>
              </div>
              <span>PostgreSQL / unified_jobs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
              <div>
                <span className="text-[#6b7280] block">Unified Job ID (UUID):</span>
                <span
                  onClick={() => handleCopyId(job.id)}
                  title="Click to copy UUID"
                  className="text-white cursor-pointer hover:text-[#3ecf8e] truncate block font-mono"
                >
                  {job.id}
                </span>
              </div>

              <div>
                <span className="text-[#6b7280] block">Raw Staging Ref ID:</span>
                <span
                  onClick={() => job.raw_ref_id && handleCopyId(job.raw_ref_id)}
                  title="Raw record foreign key"
                  className="text-white cursor-pointer hover:text-[#3ecf8e] truncate block font-mono"
                >
                  {job.raw_ref_id || 'Direct Ingestion'}
                </span>
              </div>

              <div>
                <span className="text-[#6b7280] block">Platform External ID:</span>
                <span className="text-[#9ca3af] font-mono">{job.external_id}</span>
              </div>

              <div>
                <span className="text-[#6b7280] block">Parsed Timestamp:</span>
                <span className="text-[#9ca3af] font-mono">
                  {new Date(job.parsed_at).toLocaleString()}
                </span>
              </div>

              {job.location_raw && (
                <div className="sm:col-span-2">
                  <span className="text-[#6b7280] block">Original Raw Location:</span>
                  <span className="text-[#9ca3af] font-mono">{job.location_raw}</span>
                </div>
              )}
            </div>
          </div>

          {/* Job Description Container */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-white font-semibold">
                <Notes className="w-4 h-4 text-[#3ecf8e]" />
                <span>Job Description</span>
              </div>

              <button
                type="button"
                onClick={handleCopyDescription}
                className="flex items-center gap-1 text-[11px] font-mono text-[#9ca3af] hover:text-[#3ecf8e] transition-colors"
              >
                {copiedDesc ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#3ecf8e]" />
                    <span className="text-[#3ecf8e]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Code className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>

            <div className="rounded-xl bg-[#141414] border border-[#262626] p-4 md:p-5 max-h-[380px] overflow-y-auto">
              <div className="whitespace-pre-wrap font-sans text-xs md:text-sm text-[#d1d5db] leading-relaxed select-text">
                {job.description_text || (
                  <span className="italic text-[#6b7280]">
                    No description text available for this role.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#262626] bg-[#181818]/90 backdrop-blur-md flex items-center justify-between gap-3 sticky bottom-0 z-20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] text-xs font-mono text-[#9ca3af] hover:text-white transition-colors"
          >
            Close
          </button>

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-xs font-mono font-bold text-[#131313] transition-all shadow-[0_0_15px_rgba(62,207,142,0.3)] hover:shadow-[0_0_20px_rgba(62,207,142,0.5)]"
          >
            <span>Direct Apply on {sourceConfig.label}</span>
            <OpenNewWindow className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default JobDescriptionModal;
