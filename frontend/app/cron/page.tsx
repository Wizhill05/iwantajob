'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import {
  Clock,
  Plus,
  Refresh,
  CheckCircle,
  WarningTriangle,
  Xmark,
  Trash,
  Play,
  EditPencil,
  NavArrowDown,
  Linkedin,
  Database,
  Building,
  Globe,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type {
  CronJob,
  CreateCronJobPayload,
  UpdateCronJobPayload,
} from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { PageHero } from '@/components/layout/PageHero';
import { cn, formatRelativeTime } from '@/lib/utils';

/* ── constants ── */

const PROVIDERS = [
  { id: 'indeed' as const, label: 'Indeed', icon: Database },
  { id: 'linkedin' as const, label: 'LinkedIn', icon: Linkedin },
  { id: 'wellfound' as const, label: 'Wellfound', icon: Building },
  { id: 'all' as const, label: 'All', icon: Globe },
];

const WEEKDAYS = [
  { i: 0, l: 'M' },
  { i: 1, l: 'T' },
  { i: 2, l: 'W' },
  { i: 3, l: 'T' },
  { i: 4, l: 'F' },
  { i: 5, l: 'S' },
  { i: 6, l: 'S' },
];

function fmt12(h: number, m: number) {
  const p = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh < 10 ? '0' + hh : hh}:${m < 10 ? '0' + m : m} ${p}`;
}

function daysSummary(days: number[]): string {
  if (!days?.length) return 'No days';
  if (days.length === 7) return 'Every day';
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 5 && s.every((d, i) => d === i)) return 'Weekdays';
  if (s.length === 2 && s[0] === 5 && s[1] === 6) return 'Weekends';
  return s.map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ');
}

function paramsSummary(p: Record<string, any>): string {
  if (!p || !Object.keys(p).length) return '';
  const parts: string[] = [];
  if (p.what || p.keywords || p.role) parts.push(p.what || p.keywords || p.role);
  if (p.where || p.location) parts.push(p.where || p.location);
  if (p.limit) parts.push(`limit ${p.limit}`);
  return parts.join(' · ');
}

const providerStyle: Record<string, string> = {
  indeed: 'text-sky-400',
  linkedin: 'text-blue-400',
  wellfound: 'text-rose-400',
  all: 'text-[#3ecf8e]',
};

/* ── inline form defaults ── */

function emptyForm() {
  return {
    name: '',
    provider: 'indeed' as 'indeed' | 'linkedin' | 'wellfound' | 'all',
    hour: 6,
    minute: 0,
    days: [0, 1, 2, 3, 4] as number[],
    what: 'software engineer',
    where: 'India',
    limit: 25,
    autoParse: true,
    enabled: true,
  };
}

/* ── main component ── */

function CronContent() {
  const { addLog } = useActivity();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // inline form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // per-job action states
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast((p) => (p?.msg === msg ? null : p)), 4000);
  }, []);

  /* ── data loading ── */

  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const data = await api.getCronJobs();
      setJobs(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (!silent) showToast('error', e.message || 'Failed to load schedules');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadJobs();
    const iv = setInterval(() => loadJobs(true), 10000);
    const handler = () => loadJobs();
    window.addEventListener('platform:refresh', handler);
    return () => { clearInterval(iv); window.removeEventListener('platform:refresh', handler); };
  }, [loadJobs]);

  /* ── form helpers ── */

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (j: CronJob) => {
    const p = j.search_params || {};
    setEditId(j.id);
    setForm({
      name: j.name,
      provider: j.provider,
      hour: j.hour,
      minute: j.minute,
      days: j.days_of_week || [0, 1, 2, 3, 4],
      what: p.what || p.keywords || p.role || '',
      where: p.where || p.location || '',
      limit: p.limit || 25,
      autoParse: j.auto_parse,
      enabled: j.is_enabled,
    });
    setFormError(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
  };

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const n = form.name.trim();
    if (!n) { setFormError('Name is required'); return; }
    if (!form.days.length) { setFormError('Select at least one day'); return; }

    const searchParams: Record<string, any> = { limit: form.limit > 0 ? form.limit : 25 };
    if (form.provider === 'indeed' || form.provider === 'all') {
      searchParams.what = form.what.trim() || 'software engineer';
      searchParams.where = form.where.trim() || 'India';
    } else if (form.provider === 'linkedin') {
      searchParams.keywords = form.what.trim() || 'software engineer';
      searchParams.location = form.where.trim() || 'India';
    } else if (form.provider === 'wellfound') {
      searchParams.role = form.what.trim().toLowerCase().replace(/\s+/g, '-') || 'ai-engineer';
      searchParams.location = form.where.trim().toLowerCase() || 'india';
    }

    const payload: CreateCronJobPayload = {
      name: n,
      provider: form.provider,
      hour: form.hour,
      minute: form.minute,
      days_of_week: form.days,
      search_params: searchParams,
      auto_parse: form.autoParse,
      is_enabled: form.enabled,
    };

    setIsSaving(true);
    try {
      if (editId) {
        await api.updateCronJob(editId, payload);
        addLog('INFO', 'cron', `Updated schedule "${n}"`);
        showToast('success', `"${n}" updated`);
      } else {
        await api.createCronJob(payload);
        addLog('INFO', 'cron', `Created schedule "${n}"`);
        showToast('success', `"${n}" created`);
      }
      cancelForm();
      await loadJobs(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── job actions ── */

  const handleToggle = async (id: string) => {
    setTogglingIds((p) => ({ ...p, [id]: true }));
    try {
      const u = await api.toggleCronJob(id);
      setJobs((p) => p.map((j) => (j.id === id ? u : j)));
      showToast('info', `"${u.name}" ${u.is_enabled ? 'enabled' : 'paused'}`);
    } catch (e: any) {
      showToast('error', e.message || 'Toggle failed');
    } finally {
      setTogglingIds((p) => ({ ...p, [id]: false }));
    }
  };

  const handleRun = async (id: string) => {
    const job = jobs.find((j) => j.id === id);
    setRunningIds((p) => ({ ...p, [id]: true }));
    try {
      const r = await api.runCronJob(id);
      if (r.status === 'success') showToast('success', `"${job?.name}" executed`);
      else showToast('error', `"${job?.name}" failed: ${r.error || r.details}`);
      await loadJobs(true);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setRunningIds((p) => ({ ...p, [id]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (!confirm(`Delete "${job?.name || 'this schedule'}"?`)) return;
    setDeletingId(id);
    try {
      await api.deleteCronJob(id);
      showToast('success', `"${job?.name}" deleted`);
      await loadJobs(true);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const activeCount = jobs.filter((j) => j.is_enabled).length;

  return (
    <div className="relative max-w-7xl mx-auto pb-16">
      <PageHero title="Cron Jobs" />

      <div className="relative z-10 -mt-8 pt-4 space-y-0 bg-[#131313] min-h-[60vh]">
        {/* toast */}
        {toast && (
          <div
            className={cn(
              'fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-sans shadow-xl',
              toast.type === 'success' && 'bg-[#18261e] border-[#3ecf8e]/40 text-[#3ecf8e]',
              toast.type === 'error' && 'bg-[#29171c] border-rose-500/40 text-rose-300',
              toast.type === 'info' && 'bg-[#182029] border-blue-500/40 text-blue-300'
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
            {toast.type === 'error' && <WarningTriangle className="w-3.5 h-3.5" />}
            {toast.type === 'info' && <Clock className="w-3.5 h-3.5" />}
            <span>{toast.msg}</span>
            <button type="button" onClick={() => setToast(null)} className="p-0.5 hover:opacity-70">
              <Xmark className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* toolbar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-heading font-semibold text-white tracking-wide uppercase text-[11px]">
              Scheduled Scrapers
            </span>
            <span className="h-3 w-px bg-[#262626]" />
            <span className="text-[11px] font-mono text-[#6b7280]">
              <span className="text-white font-bold">{activeCount}</span> active of{' '}
              <span className="text-white font-bold">{jobs.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[11px] font-mono text-[#6b7280] hidden sm:inline">
                {lastUpdated.toLocaleTimeString([], { hour12: false })}
              </span>
            )}
            <button
              type="button"
              onClick={() => loadJobs()}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#222] text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
            >
              <Refresh className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin text-[#3ecf8e]')} />
            </button>
            <button
              type="button"
              onClick={showForm ? cancelForm : openNew}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all active:scale-95',
                showForm
                  ? 'bg-[#222] border border-[#333] text-[#9ca3af] hover:text-white'
                  : 'bg-[#3ecf8e] hover:bg-[#34b27b] text-[#131313] shadow-md shadow-[#3ecf8e]/20'
              )}
            >
              {showForm ? (
                <>
                  <Xmark className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>New Schedule</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── INLINE ADD / EDIT FORM ── */}
        {showForm && (
          <form onSubmit={handleSubmit} className="border-b border-[#262626] py-5 space-y-4">
            {formError && (
              <p className="text-xs text-rose-400 font-sans">{formError}</p>
            )}

            {/* row 1: name + provider */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Morning Indeed Scrape"
                  className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555]"
                />
              </div>
              <div className="w-full sm:w-48">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Provider</label>
                <div className="flex gap-1">
                  {PROVIDERS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, provider: p.id }))}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-[11px] font-sans transition-all',
                          form.provider === p.id
                            ? 'border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]'
                            : 'border-[#262626] bg-[#181818] text-[#6b7280] hover:text-white hover:border-[#333]'
                        )}
                      >
                        <Icon className="w-3 h-3" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* row 2: time + days */}
            <div className="flex flex-col sm:flex-row gap-3 items-start">
              <div className="flex items-center gap-2">
                <div>
                  <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Hour</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.hour}
                    onChange={(e) => setForm((f) => ({ ...f, hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    className="w-16 px-2 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white text-center"
                  />
                </div>
                <span className="text-[#6b7280] font-mono text-sm mt-5">:</span>
                <div>
                  <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Min</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={form.minute}
                    onChange={(e) => setForm((f) => ({ ...f, minute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    className="w-16 px-2 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white text-center"
                  />
                </div>
                <span className="text-[11px] font-mono text-[#3ecf8e] mt-5 ml-1">
                  {fmt12(form.hour, form.minute)}
                </span>
              </div>

              <div className="flex-1">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Active Days</label>
                <div className="flex items-center gap-1">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.i}
                      type="button"
                      onClick={() => toggleDay(d.i)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center border transition-all',
                        form.days.includes(d.i)
                          ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/40'
                          : 'bg-[#181818] text-[#4b5563] border-[#262626] hover:text-[#9ca3af]'
                      )}
                    >
                      {d.l}
                    </button>
                  ))}
                  <span className="h-5 w-px bg-[#262626] mx-1" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, days: [0, 1, 2, 3, 4] }))} className="text-[10px] font-sans text-[#6b7280] hover:text-[#3ecf8e] underline underline-offset-2">
                    Wkdays
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, days: [0, 1, 2, 3, 4, 5, 6] }))} className="text-[10px] font-sans text-[#6b7280] hover:text-[#3ecf8e] underline underline-offset-2">
                    All
                  </button>
                </div>
              </div>
            </div>

            {/* row 3: search params */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Keywords / Role</label>
                <input
                  type="text"
                  value={form.what}
                  onChange={(e) => setForm((f) => ({ ...f, what: e.target.value }))}
                  placeholder="software engineer"
                  className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Location</label>
                <input
                  type="text"
                  value={form.where}
                  onChange={(e) => setForm((f) => ({ ...f, where: e.target.value }))}
                  placeholder="India"
                  className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-sans text-white placeholder-[#555]"
                />
              </div>
              <div className="w-24">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.limit}
                  onChange={(e) => setForm((f) => ({ ...f, limit: parseInt(e.target.value) || 25 }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e]/60 focus:outline-none text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* row 4: toggles + submit */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-5">
                {/* auto parse toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.autoParse}
                    onClick={() => setForm((f) => ({ ...f, autoParse: !f.autoParse }))}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors',
                      form.autoParse ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                    )}
                  >
                    <span className={cn('inline-block h-3 w-3 rounded-full bg-white transition-transform', form.autoParse ? 'translate-x-3' : 'translate-x-0')} />
                  </button>
                  <span className="text-[11px] font-sans text-[#9ca3af]">Auto-parse</span>
                </label>

                {/* enabled toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.enabled}
                    onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors',
                      form.enabled ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                    )}
                  >
                    <span className={cn('inline-block h-3 w-3 rounded-full bg-white transition-transform', form.enabled ? 'translate-x-3' : 'translate-x-0')} />
                  </button>
                  <span className="text-[11px] font-sans text-[#9ca3af]">Enabled</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#34b27b] text-[#131313] text-xs font-bold font-sans shadow-md shadow-[#3ecf8e]/20 transition-all disabled:opacity-50 active:scale-95"
              >
                {isSaving ? (
                  <Refresh className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                <span>{editId ? 'Update' : 'Create'}</span>
              </button>
            </div>
          </form>
        )}

        {/* ── JOBS LIST ── */}
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2">
            <Refresh className="w-5 h-5 text-[#3ecf8e] animate-spin" />
            <span className="text-xs font-mono text-[#6b7280]">Loading schedules...</span>
          </div>
        ) : jobs.length === 0 && !showForm ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <Clock className="w-8 h-8 text-[#333]" />
            <p className="text-sm font-heading text-[#9ca3af]">No cron jobs configured</p>
            <p className="text-xs font-sans text-[#6b7280] max-w-xs">
              Click &ldquo;New Schedule&rdquo; to set up automated scraping at specific times and days.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#262626]">
            {jobs.map((job) => {
              const pColor = providerStyle[job.provider] || 'text-[#9ca3af]';
              const ProvIcon = PROVIDERS.find((p) => p.id === job.provider)?.icon || Globe;
              const isRunning = runningIds[job.id] || false;
              const isDeleting = deletingId === job.id;

              return (
                <div
                  key={job.id}
                  className={cn(
                    'py-3 flex items-center gap-3 group transition-colors',
                    !job.is_enabled && 'opacity-50'
                  )}
                >
                  {/* toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={job.is_enabled}
                    disabled={togglingIds[job.id]}
                    onClick={() => handleToggle(job.id)}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                      job.is_enabled ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                    )}
                  >
                    <span className={cn('inline-block h-3 w-3 rounded-full bg-white transition-transform', job.is_enabled ? 'translate-x-3' : 'translate-x-0')} />
                  </button>

                  {/* provider icon */}
                  <ProvIcon className={cn('w-4 h-4 shrink-0', pColor)} />

                  {/* info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">{job.name}</span>
                      {job.auto_parse && (
                        <span className="text-[10px] font-mono text-[#3ecf8e] bg-[#3ecf8e]/10 px-1.5 py-px rounded">
                          parse
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#6b7280] font-sans">
                      <span className="font-mono text-[#9ca3af]">{fmt12(job.hour, job.minute)}</span>
                      <span className="text-[#4b5563]">·</span>
                      <span>{daysSummary(job.days_of_week)}</span>
                      {paramsSummary(job.search_params) && (
                        <>
                          <span className="text-[#4b5563] hidden sm:inline">·</span>
                          <span className="hidden sm:inline truncate max-w-[200px]">{paramsSummary(job.search_params)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* status */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0 text-[11px] font-mono">
                    {job.last_status === 'success' ? (
                      <span className="text-[#3ecf8e]">
                        <CheckCircle className="w-3 h-3 inline mr-0.5" />
                        {formatRelativeTime(job.last_run_at)}
                      </span>
                    ) : job.last_status === 'failed' ? (
                      <span className="text-rose-400">
                        <WarningTriangle className="w-3 h-3 inline mr-0.5" />
                        failed
                      </span>
                    ) : job.last_status === 'running' || isRunning ? (
                      <span className="text-amber-400">
                        <Refresh className="w-3 h-3 inline animate-spin mr-0.5" />
                        running
                      </span>
                    ) : (
                      <span className="text-[#4b5563]">never run</span>
                    )}
                  </div>

                  {/* actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRun(job.id)}
                      disabled={isRunning}
                      title="Run now"
                      className="p-1.5 rounded-lg text-[#6b7280] hover:text-[#3ecf8e] hover:bg-[#3ecf8e]/10 transition-colors disabled:opacity-50"
                    >
                      {isRunning ? <Refresh className="w-3.5 h-3.5 animate-spin text-[#3ecf8e]" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(job)}
                      title="Edit"
                      className="p-1.5 rounded-lg text-[#6b7280] hover:text-white hover:bg-[#222] transition-colors"
                    >
                      <EditPencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(job.id)}
                      disabled={isDeleting}
                      title="Delete"
                      className="p-1.5 rounded-lg text-[#6b7280] hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
