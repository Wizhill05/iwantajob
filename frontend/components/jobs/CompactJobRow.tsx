'use client';

import React, { useState, useRef } from 'react';
import {
  NavArrowRight,
  OpenNewWindow,
  Bookmark,
  BookmarkSolid,
  Archive,
  Trash,
  Globe,
  Flash,
  Building,
  MapPin,
  Clock,
  Eye,
  Undo,
} from 'iconoir-react';
import type { UnifiedJobItem } from '@/lib/types';
import { cn, formatSalaryLPA, formatRelativeTime } from '@/lib/utils';

interface CompactJobRowProps {
  job: UnifiedJobItem;
  isSaved: boolean;
  isArchived: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onToggleSave: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete: (id: string) => void;
  onViewFullModal: (job: UnifiedJobItem) => void;
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

function formatExperience(job: UnifiedJobItem): string {
  if (job.is_fresher_friendly || job.experience_min_years === 0) {
    if (job.experience_max_years && job.experience_max_years > 0) {
      return `Fresher (0 - ${job.experience_max_years}y)`;
    }
    return 'Fresher';
  }
  if (job.experience_min_years != null && job.experience_max_years != null) {
    if (job.experience_min_years === job.experience_max_years) {
      return `${job.experience_min_years}y`;
    }
    return `${job.experience_min_years} - ${job.experience_max_years}y`;
  }
  if (job.experience_min_years != null) {
    return `${job.experience_min_years}y+`;
  }
  if (job.experience_max_years != null) {
    return `< ${job.experience_max_years}y`;
  }
  return 'Exp unspecified';
}

export function CompactJobRow({
  job,
  isSaved,
  isArchived,
  isExpanded: controlledIsExpanded,
  onToggleExpand,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPress,
  onToggleSave,
  onArchive,
  onUnarchive,
  onDelete,
  onViewFullModal,
}: CompactJobRowProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState<boolean>(false);
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;

  const toggleExpansion = () => {
    if (onToggleExpand) {
      onToggleExpand(job.id);
    } else {
      setInternalIsExpanded((prev) => !prev);
    }
  };
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    isLongPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      if (onLongPress) {
        onLongPress(job.id);
      }
    }, 500);
  };

  const sourceMeta = SOURCE_CONFIG[job.source] || {
    label: job.source,
    badgeClass: 'text-gray-400 bg-gray-500/10 border-gray-500/25',
  };

  const salaryDisplay = formatSalaryLPA(
    job.salary_min_inr_year,
    job.salary_max_inr_year
  );
  const expDisplay = formatExperience(job);
  const timeDisplay = formatRelativeTime(job.posted_at || job.parsed_at);

  // Touch Handlers for mobile swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSelectMode || isExpanded) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsSwiping(true);
    startLongPress();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isSelectMode || isExpanded) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // If movement is detected, cancel long press
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearLongPressTimer();
    }

    // Detect if movement is primarily horizontal or vertical scroll
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipe.current) {
      // Clamped horizontal offset with resistance
      const clamped = Math.max(-140, Math.min(140, deltaX));
      setSwipeOffset(clamped);
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    if (isSelectMode || isExpanded) {
      setIsSwiping(false);
      setSwipeOffset(0);
      isHorizontalSwipe.current = null;
      return;
    }
    setIsSwiping(false);
    const threshold = 70;

    if (isLongPressTriggeredRef.current) {
      setSwipeOffset(0);
      isHorizontalSwipe.current = null;
      return;
    }

    if (swipeOffset > threshold) {
      // Swiped Right -> Archive
      if (isArchived && onUnarchive) {
        onUnarchive(job.id);
      } else {
        onArchive(job.id);
      }
    } else if (swipeOffset < -threshold) {
      // Swiped Left -> Save / Favorite
      onToggleSave(job.id);
    }

    // Reset offset smoothly
    setSwipeOffset(0);
    isHorizontalSwipe.current = null;
  };

  // Mouse Pointer handlers for desktop click-and-hold
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelectMode || isExpanded) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    // Only primary mouse button
    if (e.button === 0) {
      startLongPress();
    }
  };

  const handleMouseUp = () => {
    if (isSelectMode) return;
    clearLongPressTimer();
  };

  const handleMouseLeave = () => {
    if (isSelectMode) return;
    clearLongPressTimer();
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // If selection mode is active, directly toggle selection and don't do anything else
    if (isSelectMode) {
      e.preventDefault();
      e.stopPropagation();
      if (onToggleSelect) {
        onToggleSelect(job.id);
      }
      return;
    }

    // Avoid toggling expansion when clicking external links or buttons
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }

    // If click was the release of a long press that just triggered, don't expand
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }

    toggleExpansion();
  };

  return (
    <div className="relative overflow-hidden border-b border-[#262626] select-none group bg-[#131313]">
      {/* Background Swipe Trays */}
      <div className="absolute inset-0 flex items-center justify-between pointer-events-none text-xs font-sans px-4">
        {/* Right Swipe (Archive) Indicator */}
        <div
          className={cn(
            'flex items-center gap-2 text-amber-400 font-medium transition-opacity',
            swipeOffset > 25 ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Archive className="w-4 h-4" />
          <span>{isArchived ? 'Restore' : 'Archive'}</span>
        </div>

        {/* Left Swipe (Save) Indicator */}
        <div
          className={cn(
            'flex items-center gap-2 text-[#3ecf8e] font-medium transition-opacity ml-auto',
            swipeOffset < -25 ? 'opacity-100' : 'opacity-0'
          )}
        >
          <span>{isSaved ? 'Unsave' : 'Save'}</span>
          <Bookmark className="w-4 h-4" />
        </div>
      </div>

      {/* Main Row Content Surface */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${job.title} at ${job.company_name}`}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isSelectMode) {
              if (onToggleSelect) onToggleSelect(job.id);
            } else {
              toggleExpansion();
            }
          }
        }}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleRowClick}
        className={cn(
          'relative bg-[#131313] hover:bg-[#181818]/80 cursor-pointer transition-colors px-3 sm:px-4 py-3 select-none outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3ecf8e] focus-visible:ring-inset',
          isExpanded && 'bg-[#181818]',
          isSelected && 'bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/15 border-l-2 border-l-[#3ecf8e]'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Checkbox for Select Mode */}
          {isSelectMode && (
            <div className="flex items-center justify-center shrink-0 pr-1 pointer-events-none">
              <div
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center transition-all',
                  isSelected
                    ? 'bg-[#3ecf8e] border-[#3ecf8e] text-black'
                    : 'border-[#444] bg-[#1a1a1a]'
                )}
              >
                {isSelected && (
                  <svg className="w-3 h-3 stroke-current stroke-[3] fill-none" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Left Column: Expand indicator, Title & Company */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {!isSelectMode && (
              <span
                aria-hidden="true"
                className="shrink-0 flex items-center justify-center p-0.5 pointer-events-none select-none"
              >
                <NavArrowRight
                  className={cn(
                    'w-4 h-4 transition-transform duration-200 ease-out',
                    isExpanded
                      ? 'rotate-90 text-[#3ecf8e]'
                      : 'text-[#6b7280] group-hover:text-white'
                  )}
                />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white text-xs sm:text-sm truncate">
                  {job.title}
                </span>

                {isSaved && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans px-1.5 py-0.2 rounded bg-[#3ecf8e]/15 text-[#3ecf8e] border border-[#3ecf8e]/30">
                    <BookmarkSolid className="w-2.5 h-2.5" />
                    <span>Saved</span>
                  </span>
                )}

                {isArchived && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Archive className="w-2.5 h-2.5" />
                    <span>Archived</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9ca3af]">
                <span className="text-[#d1d5db] font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {job.company_name}
                </span>
                <span className="text-[#4b5563]">•</span>
                <span className="truncate max-w-[120px]">
                  {job.city || job.location_raw}
                </span>
                <span className="text-[#4b5563] hidden sm:inline">•</span>
                <span className="hidden sm:inline text-[#6b7280]">
                  {timeDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Compensation, Experience badge, Source, Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right flex flex-col items-end">
              <span className="font-mono text-xs sm:text-sm font-semibold text-[#3ecf8e]">
                {salaryDisplay}
              </span>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-[#9ca3af] font-sans">
                  {expDisplay}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 text-[9px] font-sans font-medium rounded border',
                    sourceMeta.badgeClass
                  )}
                >
                  {sourceMeta.label}
                </span>
              </div>
            </div>

            {/* Desktop Quick Actions */}
            <div className="hidden md:flex items-center gap-1 pl-2 border-l border-[#262626]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(job.id);
                }}
                title={isSaved ? 'Remove from Saved' : 'Save Job'}
                className={cn(
                  'p-1.5 rounded-lg border transition-colors outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3ecf8e]',
                  isSaved
                    ? 'bg-[#3ecf8e]/15 border-[#3ecf8e]/40 text-[#3ecf8e]'
                    : 'bg-transparent border-transparent text-[#6b7280] hover:text-white hover:border-[#383838]'
                )}
              >
                {isSaved ? (
                  <BookmarkSolid className="w-3.5 h-3.5" />
                ) : (
                  <Bookmark className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isArchived && onUnarchive) {
                    onUnarchive(job.id);
                  } else {
                    onArchive(job.id);
                  }
                }}
                title={isArchived ? 'Restore to Active' : 'Archive Job'}
                className={cn(
                  'p-1.5 rounded-lg border transition-colors outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3ecf8e]',
                  isArchived
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-transparent border-transparent text-[#6b7280] hover:text-white hover:border-[#383838]'
                )}
              >
                {isArchived ? (
                  <Undo className="w-3.5 h-3.5" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(job.id);
                }}
                title="Hide / Delete Job"
                className="p-1.5 rounded-lg border border-transparent text-[#6b7280] hover:text-rose-400 hover:border-rose-500/30 transition-colors outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
              >
                <Trash className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Dropdown Expansion Drawer */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              'bg-[#161616] border-t border-[#262626] px-4 sm:px-6 py-4 space-y-4 transition-opacity duration-200 ease-out select-text',
              isExpanded ? 'opacity-100' : 'opacity-0'
            )}
          >
            {/* Tag Badges */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-sans">
              {job.is_remote && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#202020] border border-[#2e2e2e] text-[#d1d5db]">
                  <Globe className="w-3 h-3 text-[#3ecf8e]" />
                  <span>Remote setting</span>
                </span>
              )}

              {job.easy_apply_available && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  <Flash className="w-3 h-3 text-amber-400" />
                  <span>Direct Easy Apply</span>
                </span>
              )}

              <span className="px-2 py-0.5 rounded bg-[#202020] border border-[#2e2e2e] text-[#9ca3af]">
                Source: <span className="text-white">{job.source}</span>
              </span>
            </div>

            {/* Job Description Excerpt */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-white">Job Description Overview</span>
              <div className="text-xs text-[#9ca3af] leading-relaxed line-clamp-4 bg-[#111111] p-3 rounded-lg border border-[#222222]">
                {job.description_text || 'No full description text was provided in the raw scrape record.'}
              </div>
            </div>

            {/* Action Row & Provenance */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#262626]">
              <div
                className="text-[11px] text-[#6b7280] min-w-0 flex-1 truncate"
                title={`Ref ID: ${job.external_id || job.id}`}
              >
                Ref ID: <span className="font-mono text-[#9ca3af]">{job.external_id || job.id.slice(0, 8)}</span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* 1. Inspect Full Text (Sky Blue) */}
                <button
                  type="button"
                  onClick={() => onViewFullModal(job)}
                  title="Inspect Full Text"
                  aria-label="Inspect Full Text"
                  className="w-10 h-10 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 hover:border-sky-500/40 flex items-center justify-center text-sky-400 transition-colors shrink-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* 2. Save / Unsave (Mint Emerald) */}
                <button
                  type="button"
                  onClick={() => onToggleSave(job.id)}
                  title={isSaved ? 'Remove from Saved' : 'Save Job'}
                  aria-label={isSaved ? 'Remove from Saved' : 'Save Job'}
                  className={cn(
                    'w-10 h-10 rounded-lg border flex items-center justify-center transition-colors shrink-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3ecf8e]',
                    isSaved
                      ? 'bg-[#3ecf8e]/25 border-[#3ecf8e]/50 text-[#3ecf8e]'
                      : 'bg-[#3ecf8e]/10 hover:bg-[#3ecf8e]/20 border-[#3ecf8e]/25 hover:border-[#3ecf8e]/40 text-[#3ecf8e]'
                  )}
                >
                  {isSaved ? (
                    <BookmarkSolid className="w-4 h-4" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>

                {/* 3. Archive / Restore (Amber Orange) */}
                <button
                  type="button"
                  onClick={() => (isArchived && onUnarchive ? onUnarchive(job.id) : onArchive(job.id))}
                  title={isArchived ? 'Restore to Active' : 'Archive Job'}
                  aria-label={isArchived ? 'Restore to Active' : 'Archive Job'}
                  className={cn(
                    'w-10 h-10 rounded-lg border flex items-center justify-center transition-colors shrink-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500',
                    isArchived
                      ? 'bg-amber-500/25 border-amber-500/50 text-amber-300'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 hover:border-amber-500/40 text-amber-400'
                  )}
                >
                  {isArchived ? (
                    <Undo className="w-4 h-4" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                </button>

                {/* 4. Hide / Delete (Rose Red) */}
                <button
                  type="button"
                  onClick={() => onDelete(job.id)}
                  title="Hide / Delete Job"
                  aria-label="Hide / Delete Job"
                  className="w-10 h-10 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/40 flex items-center justify-center text-rose-400 hover:text-rose-300 transition-colors shrink-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-500"
                >
                  <Trash className="w-4 h-4" />
                </button>

                {/* 5. Apply (Solid Mint Emerald) */}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Apply / Open Application Link"
                  aria-label="Apply / Open Application Link"
                  className="w-10 h-10 rounded-lg bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 flex items-center justify-center text-[#131313] transition-all shrink-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#3ecf8e]"
                >
                  <OpenNewWindow className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompactJobRow;
