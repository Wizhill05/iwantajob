'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  Timer,
  CheckCircle,
  WarningTriangle,
  RefreshDouble,
  Database,
  Building,
} from 'iconoir-react';
import { useActivity } from '@/context/ActivityContext';
import { api } from '@/lib/api';
import type { JobItem, WellfoundSlugItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface WellfoundTesterProps {
  onResults: (items: JobItem[], rawPayload: any, latencyMs: number) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

const DEFAULT_ROLES: WellfoundSlugItem[] = [
  { slug: 'ai-engineer', name: 'AI Engineer' },
  { slug: 'machine-learning-engineer', name: 'Machine Learning Engineer' },
  { slug: 'backend-engineer', name: 'Backend Engineer' },
  { slug: 'frontend-engineer', name: 'Frontend Engineer' },
  { slug: 'full-stack-engineer', name: 'Full Stack Engineer' },
  { slug: 'data-scientist', name: 'Data Scientist' },
  { slug: 'data-engineer', name: 'Data Engineer' },
  { slug: 'devops-engineer', name: 'DevOps Engineer' },
  { slug: 'software-engineer', name: 'Software Engineer' },
  { slug: 'product-manager', name: 'Product Manager' },
];

const DEFAULT_LOCATIONS: WellfoundSlugItem[] = [
  { slug: 'india', name: 'India' },
  { slug: 'bengaluru', name: 'Bengaluru' },
  { slug: 'pune', name: 'Pune' },
  { slug: 'delhi', name: 'Delhi NCR' },
  { slug: 'mumbai', name: 'Mumbai' },
  { slug: 'hyderabad', name: 'Hyderabad' },
  { slug: 'remote', name: 'Remote' },
  { slug: 'united-states', name: 'United States' },
];

export function WellfoundTester({
  onResults,
  onError,
  onLoadingChange,
}: WellfoundTesterProps) {
  const { startProcess, finishProcess } = useActivity();

  // Canonical options fetched dynamically
  const [roles, setRoles] = useState<WellfoundSlugItem[]>(DEFAULT_ROLES);
  const [locations, setLocations] = useState<WellfoundSlugItem[]>(DEFAULT_LOCATIONS);
  const [rolesLoading, setRolesLoading] = useState(true);

  // Parameter states
  const [roleSlug, setRoleSlug] = useState('ai-engineer');
  const [locationSlug, setLocationSlug] = useState('india');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [maxAgeDays, setMaxAgeDays] = useState<string>('');
  const [includeAllCompanyJobs, setIncludeAllCompanyJobs] = useState<boolean>(false);
  const [persist, setPersist] = useState<boolean>(false);

  // Status & benchmark states
  const [loading, setLoading] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');

  // Load canonical slugs from backend on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchSlugs() {
      try {
        const data = await api.getWellfoundRoles();
        if (isMounted) {
          if (Array.isArray(data.roles) && data.roles.length > 0) {
            setRoles(data.roles);
          }
          if (Array.isArray(data.locations) && data.locations.length > 0) {
            setLocations(data.locations);
          }
        }
      } catch {
        // Retain default lists on error
      } finally {
        if (isMounted) {
          setRolesLoading(false);
        }
      }
    }
    fetchSlugs();
    return () => {
      isMounted = false;
    };
  }, []);

  const isPageExceeded = page > 20;

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const clampedPage = Math.min(Math.max(1, page), 20);
    const clampedLimit = Math.min(Math.max(1, limit), 100);

    const queryParams: Record<string, any> = {
      role: roleSlug.trim(),
      location: locationSlug.trim(),
      page: clampedPage,
      limit: clampedLimit,
      include_all_company_jobs: includeAllCompanyJobs,
      persist,
    };

    const parsedAge = parseInt(maxAgeDays, 10);
    if (!isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 180) {
      queryParams.max_age_days = parsedAge;
    }

    setLoading(true);
    onLoadingChange(true);
    setStatus('running');

    const procId = startProcess('scrape', 'wellfound', queryParams);
    const startTime = performance.now();

    try {
      const items = await api.scrapeWellfound(queryParams);
      const elapsed = Math.round(performance.now() - startTime);

      setLatencyMs(elapsed);
      setItemCount(items.length);
      setStatus('success');

      finishProcess(
        procId,
        'completed',
        `Fetched ${items.length} Wellfound jobs in ${elapsed}ms${persist ? ' (saved to Bronze DB)' : ''}`
      );

      onResults(items, items, elapsed);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setStatus('error');
      const errMessage = err?.message || 'Failed to scrape Wellfound';
      finishProcess(procId, 'failed', errMessage);
      onError(errMessage);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="rounded-xl bg-[#181818] border border-[#262626] p-5 space-y-5">
      {/* Top Banner / Engine Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold font-heading text-white">
              Wellfound Apollo SSR Engine
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
              __NEXT_DATA__ Graph
            </span>
          </div>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            Direct SSR state extraction bypassing Cloudflare Turnstile bot challenges.
          </p>
        </div>

        {/* Execution Metrics Badge */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {latencyMs !== null && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-[#9ca3af]">
              <Timer className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>{latencyMs}ms</span>
            </span>
          )}

          {itemCount !== null && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#202020] border border-[#262626] text-white">
              <CheckCircle className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span>{itemCount} jobs</span>
            </span>
          )}

          {status === 'running' && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-pulse">
              <RefreshDouble className="w-3.5 h-3.5 animate-spin" />
              <span>Querying...</span>
            </span>
          )}
        </div>
      </div>

      {/* Parameter Form */}
      <form onSubmit={handleRun} className="space-y-4">
        {/* Row 1: Canonical Role and Location Slugs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-[#9ca3af]">
                Canonical Role Slug
              </label>
              {rolesLoading && (
                <span className="text-[10px] font-mono text-[#6b7280]">
                  Loading slugs...
                </span>
              )}
            </div>
            <select
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none transition-colors"
            >
              {roles.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name} ({r.slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-[#9ca3af]">
                Canonical Location Slug
              </label>
              {rolesLoading && (
                <span className="text-[10px] font-mono text-[#6b7280]">
                  Loading locations...
                </span>
              )}
            </div>
            <select
              value={locationSlug}
              onChange={(e) => setLocationSlug(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none transition-colors"
            >
              {locations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>
                  {loc.name} ({loc.slug})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Page (with ceiling notice), Limit, and Max Age Days */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-[#9ca3af]">
                Page (1 – 20)
              </label>
              {isPageExceeded && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">
                  <WarningTriangle className="w-3 h-3" />
                  Max 20
                </span>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
              className={cn(
                'w-full px-3 py-2 rounded-lg bg-[#131313] border text-xs font-mono text-white outline-none transition-colors',
                isPageExceeded
                  ? 'border-amber-500/50 focus:border-amber-500'
                  : 'border-[#262626] focus:border-[#3ecf8e]'
              )}
            />
            <p className="text-[10px] font-mono text-[#6b7280] mt-1">
              Ceiling guardrail: Page &gt; 20 triggers Cloudflare Turnstile blocks.
            </p>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#9ca3af] mb-1.5">
              Limit (1 – 100)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#9ca3af] mb-1.5">
              Max Age (Days, 1 – 180)
            </label>
            <input
              type="number"
              min={1}
              max={180}
              value={maxAgeDays}
              onChange={(e) => setMaxAgeDays(e.target.value)}
              placeholder="e.g. 14 (Optional)"
              className="w-full px-3 py-2 rounded-lg bg-[#131313] border border-[#262626] focus:border-[#3ecf8e] text-xs font-mono text-white placeholder-[#6b7280] outline-none transition-colors"
            />
          </div>
        </div>

        {/* Row 3: Toggles (Include all company jobs & Persist) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#262626]">
          {/* Include All Company Jobs */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-[#131313] border border-[#262626] cursor-pointer hover:border-[#383838] transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-white">
                <Building className="w-3.5 h-3.5 text-[#9ca3af]" />
                <span>Traverse All Company Jobs</span>
              </div>
              <div className="text-[11px] font-mono text-[#9ca3af]">
                Traverse entire Apollo company graph instead of highlighted only
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeAllCompanyJobs}
              onChange={(e) => setIncludeAllCompanyJobs(e.target.checked)}
              className="w-4 h-4 rounded border-[#262626] bg-[#202020] text-[#3ecf8e] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#3ecf8e]"
            />
          </label>

          {/* Persist to Bronze DB Toggle */}
          <label className="flex items-center justify-between p-3 rounded-lg bg-[#131313] border border-[#262626] cursor-pointer hover:border-[#383838] transition-all">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-white">
                <Database className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>Persist to Bronze DB</span>
              </div>
              <div className="text-[11px] font-mono text-[#9ca3af]">
                Save raw Apollo nodes to raw_wellfound_jobs table
              </div>
            </div>
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
              className="w-4 h-4 rounded border-[#262626] bg-[#202020] text-[#3ecf8e] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#3ecf8e]"
            />
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-mono font-semibold transition-all',
              loading
                ? 'bg-[#202020] border border-[#262626] text-[#6b7280] cursor-not-allowed'
                : 'bg-[#3ecf8e] hover:bg-[#3ecf8e]/90 text-[#131313] shadow-[0_0_15px_rgba(62,207,142,0.2)]'
            )}
          >
            {loading ? (
              <>
                <RefreshDouble className="w-4 h-4 animate-spin text-[#3ecf8e]" />
                <span>Scraping Wellfound...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Wellfound Scraper</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WellfoundTester;
