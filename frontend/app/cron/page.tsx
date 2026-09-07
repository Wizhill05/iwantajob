'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import {
  Clock,
  Plus,
  Refresh,
  Spark,
  CheckCircle,
  WarningTriangle,
  Xmark,
  Trash,
  Calendar,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type {
  CronJob,
  CreateCronJobPayload,
  UpdateCronJobPayload,
} from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { PageHero } from '@/components/layout/PageHero';
import { CronJobCard } from '@/components/cron/CronJobCard';
import { CronModal } from '@/components/cron/CronModal';
import { cn } from '@/lib/utils';

const DEFAULT_PRESETS: CreateCronJobPayload[] = [
  {
    name: 'Morning Indeed Ingest',
    provider: 'indeed',
    hour: 6,
    minute: 0,
    days_of_week: [0, 1, 2, 3, 4],
    search_params: { what: 'software engineer', where: 'India', limit: 25 },
    auto_parse: true,
    is_enabled: true,
  },
  {
    name: 'Morning LinkedIn Ingest',
    provider: 'linkedin',
    hour: 7,
    minute: 0,
    days_of_week: [0, 1, 2, 3, 4],
    search_params: { keywords: 'software engineer', location: 'India', limit: 25 },
    auto_parse: true,
    is_enabled: true,
  },
  {
    name: 'Morning Wellfound Ingest',
    provider: 'wellfound',
    hour: 8,
    minute: 0,
    days_of_week: [0, 1, 2, 3, 4],
    search_params: { role: 'ai-engineer', location: 'india', limit: 25 },
    auto_parse: true,
    is_enabled: true,
  },
];

interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

function CronContent() {
  const { addLog } = useActivity();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Modal & Edit State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete Confirmation State
  const [jobToDelete, setJobToDelete] = useState<CronJob | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Per-job running states
  const [runningJobIds, setRunningJobIds] = useState<Record<string, boolean>>({});
  const [togglingJobIds, setTogglingJobIds] = useState<Record<string, boolean>>({});

  // 1-Click Presets Loading
  const [isApplyingPresets, setIsApplyingPresets] = useState<boolean>(false);

  // Toast feedback
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4500);
  }, []);

  const loadJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const data = await api.getCronJobs();
      setJobs(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (!isSilent) {
        showToast('error', err.message || 'Failed to load cron schedules.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadJobs();

    // Auto-poll schedules every 10 seconds for real-time status
    const interval = setInterval(() => {
      loadJobs(true);
    }, 10000);

    const handlePlatformRefresh = () => {
      loadJobs();
    };
    window.addEventListener('platform:refresh', handlePlatformRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('platform:refresh', handlePlatformRefresh);
    };
  }, [loadJobs]);

  // Handle Save (Create or Update)
  const handleSaveJob = async (
    payload: CreateCronJobPayload | UpdateCronJobPayload,
    id?: string
  ) => {
    setIsSaving(true);
    try {
      if (id) {
        await api.updateCronJob(id, payload);
        addLog('INFO', 'cron', `Updated cron job schedule ${payload.name || id}`);
        showToast('success', `Schedule "${payload.name || 'Job'}" updated successfully.`);
      } else {
        await api.createCronJob(payload as CreateCronJobPayload);
        addLog('INFO', 'cron', `Created cron job schedule "${payload.name}"`);
        showToast('success', `Schedule "${payload.name}" created successfully.`);
      }
      setIsModalOpen(false);
      setEditingJob(null);
      await loadJobs(true);
    } catch (err: any) {
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Toggle
  const handleToggle = async (id: string) => {
    setTogglingJobIds((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await api.toggleCronJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      addLog(
        'INFO',
        'cron',
        `Cron schedule "${updated.name}" is now ${updated.is_enabled ? 'enabled' : 'paused'}`
      );
      showToast(
        'info',
        `Schedule "${updated.name}" ${updated.is_enabled ? 'activated' : 'paused'}.`
      );
    } catch (err: any) {
      showToast('error', err.message || 'Failed to toggle schedule.');
    } finally {
      setTogglingJobIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Handle Run Now
  const handleRunNow = async (id: string) => {
    const job = jobs.find((j) => j.id === id);
    const jobName = job?.name || 'Cron Job';

    setRunningJobIds((prev) => ({ ...prev, [id]: true }));
    addLog('INFO', 'cron', `Triggered immediate run for "${jobName}"`);
    showToast('info', `Running "${jobName}" now...`);

    try {
      const result = await api.runCronJob(id);
      addLog(
        result.status === 'success' ? 'INFO' : 'ERROR',
        'cron',
        `Immediate run for "${jobName}" ${result.status}: ${result.details || result.error || 'Done'}`
      );

      if (result.status === 'success') {
        showToast('success', `"${jobName}" executed successfully: ${result.details || 'Completed'}`);
      } else {
        showToast('error', `"${jobName}" run failed: ${result.error || result.details || 'Error'}`);
      }
      await loadJobs(true);
    } catch (err: any) {
      addLog('ERROR', 'cron', `Immediate run failed for "${jobName}": ${err.message}`);
      showToast('error', `Failed to execute "${jobName}": ${err.message}`);
    } finally {
      setRunningJobIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Handle Delete
  const handleDeleteConfirm = async () => {
    if (!jobToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteCronJob(jobToDelete.id);
      addLog('INFO', 'cron', `Deleted cron schedule "${jobToDelete.name}"`);
      showToast('success', `Schedule "${jobToDelete.name}" deleted.`);
      setJobToDelete(null);
      await loadJobs(true);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete cron schedule.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle 1-Click Presets
  const handleApplyPresets = async () => {
    setIsApplyingPresets(true);
    try {
      addLog('INFO', 'cron', 'Applying 1-Click default cron presets (Indeed, LinkedIn, Wellfound)...');
      for (const preset of DEFAULT_PRESETS) {
        await api.createCronJob(preset);
      }
      addLog('INFO', 'cron', 'Created default cron schedules for Indeed, LinkedIn, and Wellfound.');
      showToast('success', 'Applied 3 default scraper presets (Indeed @ 6 AM, LinkedIn @ 7 AM, Wellfound @ 8 AM).');
      await loadJobs(true);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to apply preset schedules.');
    } finally {
      setIsApplyingPresets(false);
    }
  };

  const totalCount = jobs.length;
  const activeCount = jobs.filter((j) => j.is_enabled).length;

  return (
    <div className="relative max-w-7xl mx-auto pb-16 px-4 sm:px-6">
      {/* Dynamic Page Hero */}
      <PageHero title="Cron Jobs" />

      {/* Main Content Area */}
      <div className="relative z-10 -mt-8 pt-4 space-y-6 min-h-[60vh]">
        {/* Toast / Notification Banner */}
        {toast && (
          <div
            className={cn(
              'fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl animate-in slide-in-from-top-2 duration-200 text-xs font-sans',
              toast.type === 'success' && 'bg-[#18261e] border-[#3ecf8e]/40 text-[#3ecf8e]',
              toast.type === 'error' && 'bg-[#29171c] border-rose-500/40 text-rose-300',
              toast.type === 'info' && 'bg-[#182029] border-blue-500/40 text-blue-300'
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-[#3ecf8e]" />}
            {toast.type === 'error' && <WarningTriangle className="w-4 h-4 text-rose-400" />}
            {toast.type === 'info' && <Clock className="w-4 h-4 text-blue-400" />}
            <span className="font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 hover:opacity-75 transition-opacity"
            >
              <Xmark className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top Mini Toolbar: Direct Refresh & Last Synced */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#262626] gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-heading font-semibold text-white tracking-wide uppercase text-[11px]">
              Autonomous Scraping Engine
            </span>
            <span className="h-3 w-px bg-[#262626]" />
            <div className="flex items-center gap-2 text-xs font-mono text-[#9ca3af]">
              <span className="text-white font-bold">{activeCount}</span>
              <span className="text-[#6b7280]">active of</span>
              <span className="text-white font-bold">{totalCount}</span>
              <span className="text-[#6b7280]">configured</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[11px] font-mono text-[#6b7280] mr-1 hidden sm:inline">
                Synced {lastUpdated.toLocaleTimeString([], { hour12: false })}
              </span>
            )}

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={() => loadJobs()}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#222222] text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
              title="Refresh Cron Schedules"
            >
              <Refresh
                className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')}
              />
            </button>

            {/* 1-Click Presets Button */}
            <button
              type="button"
              onClick={handleApplyPresets}
              disabled={isApplyingPresets}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2a2a] bg-[#181818] hover:bg-[#222] hover:border-[#3ecf8e]/50 text-xs font-medium text-white transition-all disabled:opacity-50"
              title="Seed 3 default schedules: Indeed 6 AM, LinkedIn 7 AM, Wellfound 8 AM"
            >
              {isApplyingPresets ? (
                <Refresh className="w-3.5 h-3.5 animate-spin text-[#3ecf8e]" />
              ) : (
                <Spark className="w-3.5 h-3.5 text-[#3ecf8e]" />
              )}
              <span>1-Click Presets</span>
            </button>

            {/* New Cron Job Button */}
            <button
              type="button"
              onClick={() => {
                setEditingJob(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#34b27b] text-[#131313] text-xs font-bold font-sans shadow-md shadow-[#3ecf8e]/20 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Cron Job</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Refresh className="w-6 h-6 text-[#3ecf8e] animate-spin" />
            <p className="text-xs font-mono text-[#9ca3af]">
              Loading configured schedules...
            </p>
          </div>
        ) : jobs.length === 0 ? (
          /* Empty State */
          <div className="p-8 sm:p-12 rounded-2xl bg-[#141414] border border-[#262626] flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1f1f1f] border border-[#2d2d2d] flex items-center justify-center text-[#3ecf8e]">
              <Calendar className="w-7 h-7" />
            </div>

            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-bold font-heading text-white">
                No Automated Cron Jobs Configured
              </h3>
              <p className="text-xs font-sans text-[#888] leading-relaxed">
                Automate your scraping workflow so you never have to manually hit scrape.
                Set schedules to run daily or on select weekdays with optional auto-parsing.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleApplyPresets}
                disabled={isApplyingPresets}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#222] border border-[#3ecf8e]/40 hover:border-[#3ecf8e] text-xs font-medium text-[#3ecf8e] transition-all"
              >
                {isApplyingPresets ? (
                  <Refresh className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Spark className="w-3.5 h-3.5" />
                )}
                <span>Load 1-Click Presets</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingJob(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#3ecf8e] hover:bg-[#34b27b] text-[#131313] text-xs font-bold transition-all shadow-lg shadow-[#3ecf8e]/20"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Create Custom Schedule</span>
              </button>
            </div>
          </div>
        ) : (
          /* Cron Schedules Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {jobs.map((job) => (
              <CronJobCard
                key={job.id}
                job={job}
                onToggle={handleToggle}
                onRun={handleRunNow}
                onEdit={(j) => {
                  setEditingJob(j);
                  setIsModalOpen(true);
                }}
                onDelete={(id) => {
                  const target = jobs.find((j) => j.id === id) || null;
                  setJobToDelete(target);
                }}
                isRunning={runningJobIds[job.id] || false}
                isToggling={togglingJobIds[job.id] || false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Cron Modal */}
      <CronModal
        isOpen={isModalOpen}
        job={editingJob}
        onClose={() => {
          setIsModalOpen(false);
          setEditingJob(null);
        }}
        onSave={handleSaveJob}
        isSaving={isSaving}
      />

      {/* Delete Confirmation Modal */}
      {jobToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
                <WarningTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold font-heading text-white">
                  Delete Scheduled Job?
                </h3>
                <p className="text-xs text-[#9ca3af] leading-relaxed font-sans">
                  This will permanently remove{' '}
                  <strong className="text-white font-mono">{jobToDelete.name}</strong>.
                  Future scheduled scraping triggers for this job will cease immediately.
                </p>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setJobToDelete(null)}
                className="p-1 rounded text-[#9ca3af] hover:text-white hover:bg-[#252525] transition-colors"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setJobToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-[#d1d5db] hover:text-white transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-sans font-semibold transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Refresh className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CronPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-mono text-[#3ecf8e]">
            <Refresh className="w-4 h-4 animate-spin" />
            <span>Loading Cron Jobs...</span>
          </div>
        </div>
      }
    >
      <CronContent />
    </Suspense>
  );
}
