'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Prohibition, Trash, Refresh } from 'iconoir-react';
import { api } from '@/lib/api';
import type { BlockedCompanyItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export function BlockedCompaniesManager() {
  const [items, setItems] = useState<BlockedCompanyItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getBlockedCompanies();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load blocked companies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Counters tick up whenever a parse run finishes elsewhere on the page.
    const handlePlatformRefresh = () => {
      load();
    };
    window.addEventListener('platform:refresh', handlePlatformRefresh);
    return () => {
      window.removeEventListener('platform:refresh', handlePlatformRefresh);
    };
  }, [load]);

  const handleBlock = async () => {
    const name = input.trim();
    if (!name) return;
    setError(null);
    try {
      await api.blockCompany(name);
      setInput('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to block company');
    }
  };

  const handleUnblock = async (name: string) => {
    setError(null);
    try {
      await api.unblockCompany(name);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unblock company');
    }
  };

  return (
    <section aria-label="Blocked companies" className="border-t border-[#262626] pt-6">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Prohibition className="w-4 h-4 text-[#3ecf8e]" />
          <h2 className="text-xs font-heading font-semibold text-white tracking-wide uppercase text-[11px]">
            Blocked Companies
          </h2>
          <span className="text-[11px] font-mono text-[#6b7280]">
            {items.length} blocked
          </span>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg border border-[#262626] bg-[#181818] hover:bg-[#222222] text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
          title="Refresh blocked list"
        >
          <Refresh className={cn('w-3.5 h-3.5', loading && 'animate-spin text-[#3ecf8e]')} />
        </button>
      </div>

      <p className="text-[11px] font-sans text-[#6b7280] pb-3">
        Blocked companies stay in bronze but are never promoted to silver — via UI, MCP, or direct API.
        Existing silver rows stay visible. Matching is normalized-exact (lowercase, trimmed).
      </p>

      <div className="flex items-center gap-2 pb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleBlock();
          }}
          placeholder="Type company name, e.g. Acme Corp"
          aria-label="Company name to block"
          className="flex-1 px-3 py-2 rounded-lg border border-[#262626] bg-[#181818] text-xs font-sans text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#3ecf8e]/50"
        />
        <button
          type="button"
          onClick={handleBlock}
          disabled={!input.trim()}
          className="px-4 py-2 rounded-lg bg-[#3ecf8e] text-[#131313] text-xs font-sans font-semibold hover:bg-[#34bd80] transition-colors disabled:opacity-40"
        >
          Block
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[11px] font-mono text-red-400 pb-3">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-[11px] font-sans text-[#6b7280]">No blocked companies.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.company_name_normalized}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#262626] bg-[#181818]"
            >
              <div className="min-w-0 flex items-center gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-sans text-white truncate">{item.company_name_raw}</p>
                  <p className="text-[10px] font-mono text-[#6b7280] truncate">
                    {item.company_name_normalized}
                  </p>
                </div>
                {item.blocked_attempts > 0 && (
                  <span
                    className="shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-red-400/40 bg-red-400/10 text-red-400"
                    title={`${item.blocked_attempts} bronze jobs skipped during parsing`}
                  >
                    {item.blocked_attempts} skipped
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleUnblock(item.company_name_raw)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#262626] text-[11px] font-sans text-[#9ca3af] hover:text-white hover:border-red-400/40 transition-colors"
                title={`Unblock ${item.company_name_raw}`}
              >
                <Trash className="w-3.5 h-3.5" />
                <span>Unblock</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BlockedCompaniesManager;
