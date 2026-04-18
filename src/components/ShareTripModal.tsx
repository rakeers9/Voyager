'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, Share2, Globe } from 'lucide-react';

interface ShareTripModalProps {
  tripTitle: string;
  shareUrl: string;
  onClose: () => void;
}

export default function ShareTripModal({ tripTitle, shareUrl, onClose }: ShareTripModalProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select the input; user can ⌘/Ctrl+C
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-[92vw] bg-surface border border-white/[0.06] rounded-md shadow-2xl shadow-black/60 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
              <Share2 size={13} className="text-info" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-heading leading-none">Share Trip</p>
              <p className="text-[11px] text-dim mt-1 truncate max-w-[320px]">{tripTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 text-[11px] text-dim leading-relaxed">
            <Globe size={13} className="text-info shrink-0 mt-0.5" />
            <p>
              Anyone with this link can view this trip — no sign-in required.
              They can explore the map and timeline but cannot make edits.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 min-w-0 px-2.5 py-2 bg-elevated/50 border border-white/[0.06] rounded-sm text-[12px] font-mono text-primary outline-none focus:border-info/40 selection:bg-info/30"
            />
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-sm text-[12px] font-medium transition-colors ${
                copied
                  ? 'bg-info/20 text-info'
                  : 'bg-info text-white hover:bg-info/90'
              }`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-white/[0.04] bg-elevated/20">
          <button
            onClick={onClose}
            className="text-[12px] px-3 py-1.5 rounded-sm text-muted hover:text-primary hover:bg-elevated/50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
