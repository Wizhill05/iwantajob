'use client';

import React, { useEffect } from 'react';
import { WarningTriangle, Trash, Xmark, Refresh } from 'iconoir-react';
import { cn } from '@/lib/utils';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  count: number;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  count,
  isDeleting = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-lg shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
            <WarningTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-semibold font-heading text-white">
              Are you sure about this?
            </h3>
            <p className="text-xs text-[#9ca3af] leading-relaxed font-sans">
              This will permanently delete{' '}
              <strong className="text-rose-300 font-mono">
                {count} {count === 1 ? 'job' : 'jobs'}
              </strong>{' '}
              from the database. This action cannot be undone.
            </p>
          </div>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="p-1 rounded-md text-[#9ca3af] hover:text-white hover:bg-[#252525] transition-colors"
          >
            <Xmark className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-md bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-sans text-[#d1d5db] hover:text-white transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-sans font-semibold shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
            )}
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
  );
}

export default DeleteConfirmModal;
