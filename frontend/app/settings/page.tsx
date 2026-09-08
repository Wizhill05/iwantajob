'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { UserPreferences, AutoTriageResult } from '@/lib/types';
import { PageHero } from '@/components/layout/PageHero';

function toCommaList(values: string[]): string {
  return values.join(', ');
}

function fromCommaList(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [allowInternational, setAllowInternational] = useState(false);
  const [maxExp, setMaxExp] = useState(2);
  const [requireFresher, setRequireFresher] = useState(false);
  const [preferredKeywords, setPreferredKeywords] = useState('');
  const [blockedKeywords, setBlockedKeywords] = useState('');
  const [preferredCities, setPreferredCities] = useState('');
  const [minSalaryLpa, setMinSalaryLpa] = useState(0);

  const [preview, setPreview] = useState<AutoTriageResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    api
      .getPreferences()
      .then((p) => {
        setPrefs(p);
        setAllowInternational(p.allow_international);
        setMaxExp(p.max_experience_years);
        setRequireFresher(p.require_fresher_friendly);
        setPreferredKeywords(toCommaList(p.preferred_title_keywords));
        setBlockedKeywords(toCommaList(p.blocked_title_keywords));
        setPreferredCities(toCommaList(p.preferred_cities));
        setMinSalaryLpa(p.min_salary_inr_year ? Math.round(p.min_salary_inr_year / 100000) : 0);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      const updated = await api.updatePreferences({
        allow_international: allowInternational,
        max_experience_years: maxExp,
        require_fresher_friendly: requireFresher,
        preferred_title_keywords: fromCommaList(preferredKeywords),
        blocked_title_keywords: fromCommaList(blockedKeywords),
        preferred_cities: fromCommaList(preferredCities),
        min_salary_inr_year: minSalaryLpa > 0 ? minSalaryLpa * 100000 : null,
      });
      setPrefs(updated);
      setSavedNote('Preferences saved. Auto-sort will use these next run.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);
    try {
      const result = await api.autoTriage({ dry_run: true, limit: 200 });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry-run failed.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 rounded-lg bg-[#181818] border border-[#2a2a2a] text-sm font-sans text-white placeholder:text-[#5b5b5b] focus:outline-none focus:border-[#3ecf8e]/50';

  return (
    <div className="relative max-w-3xl mx-auto pb-16">
      <PageHero title="Settings" />

      <div className="relative z-10 -mt-8 pt-4 space-y-4 bg-[#131313] min-h-[60vh]">
        <p className="text-xs font-sans text-[#9ca3af] leading-relaxed">
          Your job taste. The backend auto-sort reads only these settings when
          classifying scraped jobs as saved or archived.
        </p>

        {isLoading && (
          <div className="text-xs font-mono text-[#9ca3af]">Loading preferences…</div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-3 text-xs font-sans text-rose-300">
            {error}
          </div>
        )}

        {!isLoading && prefs && (
          <>
            <section className="rounded-xl border border-[#262626] bg-[#181818] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white font-heading">Location</h2>
              <label className="flex items-center gap-2 text-xs font-sans text-[#d1d5db]">
                <input
                  type="checkbox"
                  checked={allowInternational}
                  onChange={(e) => setAllowInternational(e.target.checked)}
                  className="accent-[#3ecf8e]"
                />
                Allow international (non-India) roles
              </label>
              <div>
                <label className="block text-xs font-sans text-[#9ca3af] mb-1">
                  Preferred cities (comma-separated, empty = all India)
                </label>
                <input
                  value={preferredCities}
                  onChange={(e) => setPreferredCities(e.target.value)}
                  placeholder="bengaluru, pune"
                  className={inputCls}
                />
              </div>
            </section>

            <section className="rounded-xl border border-[#262626] bg-[#181818] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white font-heading">Experience</h2>
              <div>
                <label className="block text-xs font-sans text-[#9ca3af] mb-1">
                  Max experience (years)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxExp}
                  onChange={(e) => setMaxExp(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-sans text-[#d1d5db]">
                <input
                  type="checkbox"
                  checked={requireFresher}
                  onChange={(e) => setRequireFresher(e.target.checked)}
                  className="accent-[#3ecf8e]"
                />
                Only save fresher-friendly roles
              </label>
            </section>

            <section className="rounded-xl border border-[#262626] bg-[#181818] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white font-heading">Roles</h2>
              <div>
                <label className="block text-xs font-sans text-[#9ca3af] mb-1">
                  Save when title contains (comma-separated)
                </label>
                <input
                  value={preferredKeywords}
                  onChange={(e) => setPreferredKeywords(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-[#9ca3af] mb-1">
                  Archive when title contains (comma-separated)
                </label>
                <input
                  value={blockedKeywords}
                  onChange={(e) => setBlockedKeywords(e.target.value)}
                  className={inputCls}
                />
              </div>
            </section>

            <section className="rounded-xl border border-[#262626] bg-[#181818] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white font-heading">Salary</h2>
              <div>
                <label className="block text-xs font-sans text-[#9ca3af] mb-1">
                  Minimum salary (LPA, 0 = no floor)
                </label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={minSalaryLpa}
                  onChange={(e) => setMinSalaryLpa(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className={inputCls}
                />
              </div>
            </section>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-[#3ecf8e]/15 hover:bg-[#3ecf8e]/25 border border-[#3ecf8e]/30 text-xs font-sans font-medium text-[#3ecf8e] transition-colors disabled:opacity-40"
              >
                {isSaving ? 'Saving…' : 'Save preferences'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing}
                className="px-4 py-2 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-white transition-colors disabled:opacity-40"
              >
                {isPreviewing ? 'Previewing…' : 'Dry-run preview'}
              </button>
            </div>

            {savedNote && (
              <div className="text-xs font-sans text-[#3ecf8e]">{savedNote}</div>
            )}

            {preview && (
              <div className="rounded-xl border border-[#262626] bg-[#181818] p-4 text-xs font-sans text-[#d1d5db] space-y-1">
                <div>
                  Evaluated <strong className="font-mono text-white">{preview.evaluated}</strong> ·
                  would save <strong className="font-mono text-[#3ecf8e]">{preview.saved}</strong> ·
                  archive <strong className="font-mono text-amber-400">{preview.archived}</strong> ·
                  leave <strong className="font-mono text-white">{preview.left_active}</strong>
                </div>
                <div className="text-[#9ca3af]">Dry-run only — nothing was written.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
