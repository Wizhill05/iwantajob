'use client';

import React, { useEffect } from 'react';
import { WarningTriangle, Refresh } from 'iconoir-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#181818] border border-[#262626] rounded-2xl p-6 text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <WarningTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold font-heading text-white">
            Something went wrong
          </h2>
          <p className="text-xs text-[#9ca3af]">
            {error?.message || 'An unexpected error occurred while loading this view.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk')) {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3ecf8e] text-[#131313] text-xs font-semibold hover:bg-[#3ecf8e]/90 transition-all active:scale-95"
        >
          <Refresh className="w-3.5 h-3.5" />
          <span>Reload View</span>
        </button>
      </div>
    </div>
  );
}
