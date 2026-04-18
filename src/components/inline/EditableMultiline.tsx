'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  className?: string;
  emptyClassName?: string;
  ariaLabel?: string;
  /** Allow committing an empty value (clearing the field). Default true. */
  allowEmpty?: boolean;
}

/**
 * Click-to-edit multi-line field (auto-growing textarea).
 * - Click → textarea focused
 * - Cmd/Ctrl+Enter or blur → commit
 * - Esc → cancel
 */
export default function EditableMultiline({
  value,
  onSave,
  placeholder = 'Click to add…',
  className = '',
  emptyClassName = '',
  ariaLabel,
  allowEmpty = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      // place caret at end
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
      autoresize(ref.current);
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (!allowEmpty && !next) {
      setEditing(false);
      setDraft(value);
      return;
    }
    if (next !== value) onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          autoresize(e.currentTarget);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        rows={1}
        aria-label={ariaLabel}
        className={`block w-full resize-none bg-white/[0.04] border border-edge-active/40 rounded-sm px-2.5 py-2 outline-none focus:border-info/60 leading-relaxed ${className}`}
      />
    );
  }

  const isEmpty = !value;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      aria-label={ariaLabel}
      className={`cursor-text rounded-sm px-2.5 py-2 hover:bg-white/[0.03] transition-colors whitespace-pre-wrap leading-relaxed ${
        isEmpty ? `text-dim italic border border-dashed border-white/[0.08] ${emptyClassName}` : 'border border-transparent'
      } ${className}`}
    >
      {isEmpty ? placeholder : value}
    </div>
  );
}

function autoresize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
