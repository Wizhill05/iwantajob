'use client';

import React, { useState, useMemo } from 'react';
import { Copy, Check } from 'iconoir-react';

interface RawJsonViewerProps {
  data: any;
  title?: string;
  maxHeightClass?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function syntaxHighlight(json: string): string {
  const escaped = escapeHtml(json);

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-400 font-mono'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-[#3ecf8e] font-mono font-medium'; // key
        } else {
          cls = 'text-sky-300 font-mono'; // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400 font-mono font-semibold'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-[#9ca3af] font-mono italic'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function RawJsonViewer({
  data,
  title = 'Raw JSON Payload',
  maxHeightClass = 'max-h-[600px]',
}: RawJsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = useMemo(() => {
    if (data === undefined || data === null) {
      return JSON.stringify(data, null, 2);
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const highlightedHtml = useMemo(() => {
    return syntaxHighlight(jsonString);
  }, [jsonString]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const lineCount = useMemo(() => {
    return jsonString.split('\n').length;
  }, [jsonString]);

  return (
    <div className="rounded-xl border border-[#262626] bg-[#181818] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#3ecf8e]" />
          <span className="text-xs font-mono font-medium text-white">{title}</span>
          <span className="text-[11px] font-mono text-[#9ca3af]">
            {lineCount} lines
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#262626] hover:border-[#383838] text-xs font-mono text-[#f3f4f6] transition-all"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#3ecf8e]" />
              <span className="text-[#3ecf8e]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-[#9ca3af]" />
              <span>Copy JSON</span>
            </>
          )}
        </button>
      </div>

      {/* Monospace display */}
      <div
        className={`p-4 bg-[#0d0d0d] font-mono text-xs overflow-x-auto overflow-y-auto ${maxHeightClass}`}
      >
        <pre
          className="font-mono text-xs leading-relaxed text-[#d1d5db]"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </div>
    </div>
  );
}

export default RawJsonViewer;
