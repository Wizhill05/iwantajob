'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
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
  Linkedin,
  Database,
  Building,
  Globe,
  ClockRotateRight,
} from 'iconoir-react';
import { api } from '@/lib/api';
import type {
  CronJob,
  CreateCronJobPayload,
  CronRunRecord,
} from '@/lib/types';
import { useActivity } from '@/context/ActivityContext';
import { PageHero } from '@/components/layout/PageHero';
import { cn, formatRelativeTime } from '@/lib/utils';

/* ── constants ── */

const PROVIDERS = [
  { id: 'indeed' as const, label: 'Indeed', icon: Database, active: 'border-sky-500/50 bg-sky-500/10 text-sky-400' },
  { id: 'linkedin' as const, label: 'LinkedIn', icon: Linkedin, active: 'border-blue-500/50 bg-blue-500/10 text-blue-400' },
  { id: 'wellfound' as const, label: 'Wellfound', icon: Building, active: 'border-rose-500/50 bg-rose-500/10 text-rose-400' },
  { id: 'all' as const, label: 'All', icon: Globe, active: 'border-[#3ecf8e]/50 bg-[#3ecf8e]/10 text-[#3ecf8e]' },
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

const providerColor: Record<string, string> = {
  indeed: 'text-sky-400',
  linkedin: 'text-blue-400',
  wellfound: 'text-rose-400',
  all: 'text-[#3ecf8e]',
};

const RUNS_PAGE_SIZE = 25;

/* duration of a finished run, or elapsed time for one still running */
function runDuration(run: CronRunRecord): string {
  if (!run.started_at) return '';
  const start = new Date(run.started_at).getTime();
  if (isNaN(start)) return '';
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
  if (isNaN(end)) return '';
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* shared circular button style — same language as the jobs selection menu */
const circleBtn =
  'h-[42px] w-[42px] p-0 shrink-0 flex items-center justify-center rounded-full border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
const circleBtnSm =
  'h-9 w-9 p-0 shrink-0 flex items-center justify-center rounded-full border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';

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

  // cron run history (backend source of truth for "currently running")
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsOffset, setRunsOffset] = useState(0);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingMoreRuns, setIsLoadingMoreRuns] = useState(false);

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
      setJobs(await api.getCronJobs());
    } catch (e: any) {
      if (!silent) showToast('error', e.message || 'Failed to load schedules');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  /* ── run history loading ── */

  const loadRuns = useCallback(async (offset = 0, append = false) => {
    if (append) setIsLoadingMoreRuns(true);
    try {
      const page = await api.getCronRuns(RUNS_PAGE_SIZE, offset);
      setRunsTotal(page.total);
      setRuns((prev) => {
        if (!append) return page.runs;
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.runs.filter((r) => !seen.has(r.id))];
      });
      setRunsOffset(offset);
    } catch {
      // background polling — the run history is non-critical, ignore errors
    } finally {
      setIsLoadingRuns(false);
      setIsLoadingMoreRuns(false);
    }
  }, []);

  /* running state is derived from the backend so it survives navigation:
     a run row with status 'running' means the backend is still executing */
  const backendRunning = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of runs) {
      if (r.status === 'running' && r.cron_job_id) m[r.cron_job_id] = true;
    }
    return m;
  }, [runs]);
  const isJobRunning = useCallback(
    (id: string) => Boolean(runningIds[id] || backendRunning[id]),
    [backendRunning, runningIds]
  );
  const runningRunCount = useMemo(
    () => runs.filter((r) => r.status === 'running').length,
    [runs]
  );

  useEffect(() => {
    loadJobs();
    loadRuns();
    const iv = setInterval(() => { loadJobs(true); loadRuns(); }, 10000);
    const handler = () => { loadJobs(); loadRuns(); };
    window.addEventListener('platform:refresh', handler);
    return () => { clearInterval(iv); window.removeEventListener('platform:refresh', handler); };
  }, [loadJobs, loadRuns]);

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
      // refresh run history so the spinner/status comes from the backend
      loadRuns();
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
  const selectedProvider = PROVIDERS.find((p) => p.id === form.provider);

  return (
    <div className="relative max-w-7xl mx-auto pb-16">
      <PageHero title="Cron Jobs" />

      <div className="relative z-10 -mt-8 pt-4 bg-[#131313] min-h-[60vh]">
        {/* toast */}
        {toast && (
          <div
            className={cn(
              'fixed top-20 right-4 sm:right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-sans shadow-xl max-w-[calc(100vw-2rem)]',
              toast.type === 'success' && 'bg-[#18261e] border-[#3ecf8e]/40 text-[#3ecf8e]',
              toast.type === 'error' && 'bg-[#29171c] border-rose-500/40 text-rose-300',
              toast.type === 'info' && 'bg-[#182029] border-blue-500/40 text-blue-300'
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
            {toast.type === 'error' && <WarningTriangle className="w-3.5 h-3.5 shrink-0" />}
            {toast.type === 'info' && <Clock className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate">{toast.msg}</span>
            <button type="button" onClick={() => setToast(null)} className="p-0.5 hover:opacity-70 shrink-0">
              <Xmark className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* toolbar — wraps cleanly on mobile, circular icon actions */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#262626]">
          <p className="text-[11px] font-mono text-[#6b7280] whitespace-nowrap min-w-0 truncate">
            <span className="text-white font-bold">{activeCount}</span>
            {' / '}
            <span className="text-white font-bold">{jobs.length}</span>
            {' active'}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadJobs()}
              disabled={isRefreshing}
              title="Refresh schedules"
              aria-label="Refresh schedules"
              className={cn(circleBtn, 'bg-[#202020] border-[#333] text-white hover:text-[#3ecf8e]')}
            >
              <Refresh className={cn('w-5 h-5', isRefreshing && 'animate-spin text-[#3ecf8e]')} />
            </button>
            <button
              type="button"
              onClick={showForm ? cancelForm : openNew}
              title={showForm ? 'Cancel' : 'New schedule'}
              aria-label={showForm ? 'Cancel' : 'New schedule'}
              className={cn(
                circleBtn,
                showForm
                  ? 'bg-[#202020] border-[#333] text-[#9ca3af] hover:text-white'
                  : 'bg-[#3ecf8e] border-[#3ecf8e] text-[#131313] hover:bg-[#34b27b] shadow-md shadow-[#3ecf8e]/20'
              )}
            >
              {showForm ? <Xmark className="w-5 h-5" /> : <Plus className="w-5 h-5 stroke-[2.5]" />}
            </button>
          </div>
        </div>

        {/* ── INLINE ADD / EDIT FORM ── */}
        {showForm && (
          <form onSubmit={handleSubmit} className="border-b border-[#262626] py-5 space-y-4">
            {formError && <p className="text-xs text-rose-400 font-sans">{formError}</p>}

            {/* name */}
            <div className="min-w-0">
              <label className="text-[11px] font-sans text-[#6b7280] block mb-1.5">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Morning Indeed Scrape"
                className="w-full px-3 py-3 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-sans text-white placeholder-[#555] transition-colors"
              />
            </div>

            {/* provider — floating circles */}
            <div className="min-w-0">
              <p className="text-[11px] font-sans text-[#6b7280] mb-1.5">
                Provider <span className="text-[#9ca3af]">· {selectedProvider?.label}</span>
              </p>
              <div className="flex items-center gap-2.5">
                {PROVIDERS.map((p) => {
                  const Icon = p.icon;
                  const selected = form.provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, provider: p.id }))}
                      title={p.label}
                      aria-label={p.label}
                      aria-pressed={selected}
                      className={cn(
                        circleBtn,
                        selected ? p.active : 'bg-[#202020] border-[#333] text-[#6b7280] hover:text-white'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* time + days */}
            <div className="flex flex-wrap items-end gap-x-5 gap-y-4 min-w-0">
              <div className="min-w-0">
                <p className="text-[11px] font-sans text-[#6b7280] mb-1.5">Time</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.hour}
                    aria-label="Hour"
                    onChange={(e) => setForm((f) => ({ ...f, hour: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    className="w-16 px-2 py-2.5 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-mono text-white text-center"
                  />
                  <span className="text-[#6b7280] font-mono">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={form.minute}
                    aria-label="Minute"
                    onChange={(e) => setForm((f) => ({ ...f, minute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    className="w-16 px-2 py-2.5 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-mono text-white text-center"
                  />
                  <span className="text-[11px] font-mono text-[#3ecf8e] whitespace-nowrap">
                    {fmt12(form.hour, form.minute)}
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[11px] font-sans text-[#6b7280]">Days</p>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, days: [0, 1, 2, 3, 4] }))} className="text-[10px] font-sans text-[#6b7280] hover:text-[#3ecf8e] underline underline-offset-2">
                    Wkdays
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, days: [0, 1, 2, 3, 4, 5, 6] }))} className="text-[10px] font-sans text-[#6b7280] hover:text-[#3ecf8e] underline underline-offset-2">
                    All
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.i}
                      type="button"
                      onClick={() => toggleDay(d.i)}
                      aria-pressed={form.days.includes(d.i)}
                      className={cn(
                        'h-9 w-9 shrink-0 rounded-full text-[11px] font-mono font-bold flex items-center justify-center border transition-all active:scale-95',
                        form.days.includes(d.i)
                          ? 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/40'
                          : 'bg-[#181818] text-[#4b5563] border-[#262626] hover:text-[#9ca3af]'
                      )}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* search */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_96px] gap-3 min-w-0">
              <div className="min-w-0">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1.5">Keywords / Role</label>
                <input
                  type="text"
                  value={form.what}
                  onChange={(e) => setForm((f) => ({ ...f, what: e.target.value }))}
                  placeholder="software engineer"
                  className="w-full px-3 py-3 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-sans text-white placeholder-[#555] transition-colors"
                />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1.5">Location</label>
                <input
                  type="text"
                  value={form.where}
                  onChange={(e) => setForm((f) => ({ ...f, where: e.target.value }))}
                  placeholder="India"
                  className="w-full px-3 py-3 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-sans text-white placeholder-[#555] transition-colors"
                />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-sans text-[#6b7280] block mb-1.5">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.limit}
                  onChange={(e) => setForm((f) => ({ ...f, limit: parseInt(e.target.value) || 25 }))}
                  className="w-full px-3 py-3 rounded-lg bg-[#181818] border border-[#262626] focus:border-[#3ecf8e] focus:outline-none text-xs font-mono text-white"
                />
              </div>
            </div>

            {/* toggles + submit */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.autoParse}
                  aria-label="Auto-parse"
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

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.enabled}
                  aria-label="Enabled"
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

              <div className="flex-1" />

              <button
                type="submit"
                disabled={isSaving}
                className={cn(circleBtn, 'bg-[#3ecf8e] border-[#3ecf8e] text-[#131313] hover:bg-[#34b27b] shadow-md shadow-[#3ecf8e]/20')}
                title={editId ? 'Update schedule' : 'Create schedule'}
                aria-label={editId ? 'Update schedule' : 'Create schedule'}
              >
                {isSaving ? (
                  <Refresh className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
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
          <div className="py-16 flex flex-col items-center gap-3 text-center px-4">
            <Clock className="w-8 h-8 text-[#333]" />
            <p className="text-sm font-heading text-[#9ca3af]">No cron jobs configured</p>
            <p className="text-xs font-sans text-[#6b7280] max-w-xs">
              Tap the green + button above to set up automated scraping.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#262626]">
            {jobs.map((job) => {
              const pColor = providerColor[job.provider] || 'text-[#9ca3af]';
              const ProvIcon = PROVIDERS.find((p) => p.id === job.provider)?.icon || Globe;
              const isRunning = isJobRunning(job.id);
              const isDeleting = deletingId === job.id;

              return (
                <div
                  key={job.id}
                  className={cn('py-3 flex items-center gap-2.5', !job.is_enabled && 'opacity-50')}
                >
                  {/* enable toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={job.is_enabled}
                    aria-label={job.is_enabled ? 'Pause schedule' : 'Enable schedule'}
                    disabled={togglingIds[job.id]}
                    onClick={() => handleToggle(job.id)}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                      job.is_enabled ? 'bg-[#3ecf8e]' : 'bg-[#2e2e2e]'
                    )}
                  >
                    <span className={cn('inline-block h-3 w-3 rounded-full bg-white transition-transform', job.is_enabled ? 'translate-x-3' : 'translate-x-0')} />
                  </button>

                  {/* provider circle */}
                  <span className="h-9 w-9 shrink-0 rounded-full bg-[#1a1a1a] border border-[#262626] flex items-center justify-center">
                    <ProvIcon className={cn('w-4 h-4', pColor)} />
                  </span>

                  {/* info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-white truncate">{job.name}</span>
                      {job.auto_parse && (
                        <span className="text-[10px] font-mono text-[#3ecf8e] shrink-0">·parse</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] font-sans text-[#6b7280] truncate">
                      <span className="font-mono text-[#9ca3af]">{fmt12(job.hour, job.minute)}</span>
                      {' · '}
                      {daysSummary(job.days_of_week)}
                      {paramsSummary(job.search_params) && (
                        <span className="hidden sm:inline"> · {paramsSummary(job.search_params)}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] font-mono sm:hidden">
                      {job.last_status === 'success' ? (
                        <span className="text-[#3ecf8e]">{formatRelativeTime(job.last_run_at)}</span>
                      ) : job.last_status === 'failed' ? (
                        <span className="text-rose-400">failed</span>
                      ) : isRunning ? (
                        <span className="text-amber-400">running</span>
                      ) : (
                        <span className="text-[#4b5563]">never run</span>
                      )}
                    </p>
                  </div>

                  {/* status — desktop */}
                  <span className="hidden sm:block shrink-0 text-[11px] font-mono">
                    {job.last_status === 'success' ? (
                      <span className="text-[#3ecf8e]">{formatRelativeTime(job.last_run_at)}</span>
                    ) : job.last_status === 'failed' ? (
                      <span className="text-rose-400">failed</span>
                    ) : isRunning ? (
                      <span className="text-amber-400">running</span>
                    ) : (
                      <span className="text-[#4b5563]">never run</span>
                    )}
                  </span>

                  {/* circular actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRun(job.id)}
                      disabled={isRunning}
                      title="Run now"
                      aria-label="Run now"
                      className={cn(circleBtnSm, 'bg-[#202020] border-[#333] text-[#3ecf8e] hover:border-[#3ecf8e]/50 hover:bg-[#3ecf8e]/10')}
                    >
                      {isRunning ? <Refresh className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(job)}
                      title="Edit"
                      aria-label="Edit"
                      className={cn(circleBtnSm, 'bg-[#202020] border-[#333] text-[#9ca3af] hover:text-white')}
                    >
                      <EditPencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(job.id)}
                      disabled={isDeleting}
                      title="Delete"
                      aria-label="Delete"
                      className={cn(circleBtnSm, 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20')}
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── RUN HISTORY ── */}
        <div className="pt-10">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#262626]">
            <div className="flex items-center gap-2 min-w-0">
              <ClockRotateRight className="w-4 h-4 text-[#6b7280] shrink-0" />
              <p className="text-[11px] font-mono text-[#6b7280] whitespace-nowrap min-w-0">
                <span className="text-white font-bold">{runsTotal}</span>
                {' runs'}
                {runningRunCount > 0 && (
                  <span className="text-amber-400"> · {runningRunCount} running</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setRuns([]); loadRuns(); }}
              title="Refresh run history"
              aria-label="Refresh run history"
              className={cn(circleBtnSm, 'bg-[#202020] border-[#333] text-[#9ca3af] hover:text-[#3ecf8e]')}
            >
              <Refresh className={cn('w-4 h-4', isLoadingRuns && 'animate-spin text-[#3ecf8e]')} />
            </button>
          </div>

          {isLoadingRuns ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <Refresh className="w-4 h-4 text-[#3ecf8e] animate-spin" />
              <span className="text-xs font-mono text-[#6b7280]">Loading run history...</span>
            </div>
          ) : runs.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center px-4">
              <ClockRotateRight className="w-8 h-8 text-[#333]" />
              <p className="text-sm font-heading text-[#9ca3af]">No runs recorded yet</p>
              <p className="text-xs font-sans text-[#6b7280] max-w-xs">
                Every manual test run and scheduled scrape will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#262626]">
              {runs.map((run) => {
                const ProvIcon = PROVIDERS.find((p) => p.id === run.provider)?.icon || Globe;
                const pColor = providerColor[run.provider] || 'text-[#9ca3af]';
                const isRunRunning = run.status === 'running';
                const isError = run.status === 'failed';

                return (
                  <div key={run.id} className="py-3 flex items-center gap-2.5">
                    {/* provider circle */}
                    <span className="h-9 w-9 shrink-0 rounded-full bg-[#1a1a1a] border border-[#262626] flex items-center justify-center">
                      <ProvIcon className={cn('w-4 h-4', pColor)} />
                    </span>

                    {/* info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-white truncate">{run.job_name}</span>
                        <span
                          className={cn(
                            'text-[10px] font-mono shrink-0',
                            run.trigger === 'scheduler' ? 'text-blue-400' : 'text-[#3ecf8e]'
                          )}
                        >
                          ·{run.trigger === 'scheduler' ? 'scheduled' : 'test'}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 text-[11px] font-sans truncate',
                          isError ? 'text-rose-400' : 'text-[#6b7280]'
                        )}
                        title={isError ? run.error || '' : run.result_summary || ''}
                      >
                        {isError ? run.error || 'Unknown error' : run.result_summary || (isRunRunning ? 'Scraping in progress...' : 'No summary')}
                      </p>
                    </div>

                    {/* status + timing */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-sans px-1.5 py-0.5 rounded border',
                          isRunRunning && 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                          run.status === 'success' && 'bg-[#3ecf8e]/15 text-[#3ecf8e] border-[#3ecf8e]/30',
                          isError && 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        )}
                      >
                        {isRunRunning && <Refresh className="w-2.5 h-2.5 animate-spin" />}
                        {run.status}
                      </span>
                      <span className="text-[11px] font-mono text-[#6b7280] whitespace-nowrap">
                        {formatRelativeTime(run.started_at)}
                        {run.started_at && (
                          <span className="hidden sm:inline"> · {runDuration(run)}</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* load more */}
          {!isLoadingRuns && runs.length < runsTotal && (
            <div className="py-4 flex justify-center">
              <button
                type="button"
                onClick={() => loadRuns(runsOffset + RUNS_PAGE_SIZE, true)}
                disabled={isLoadingMoreRuns}
                className="px-4 py-2 rounded-lg bg-[#202020] border border-[#333] text-[11px] font-mono text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
              >
                {isLoadingMoreRuns ? 'Loading...' : `Load more (${runsTotal - runs.length} remaining)`}
              </button>
            </div>
          )}
        </div>
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
