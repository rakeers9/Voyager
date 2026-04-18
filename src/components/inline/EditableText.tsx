'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  emptyClassName?: string;
  ariaLabel?: string;
}

/**
 * Click-to-edit single-line field.
 * - Click → input focused with text selected
 * - Enter or blur → commit (only if changed and non-empty unless allowEmpty)
 * - Esc → cancel
 */
export default function EditableText({
  value,
  onSave,
  placeholder = 'Click to edit',
  className = '',
  inputClassName = '',
  emptyClassName = '',
  ariaLabel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label={ariaLabel}
        className={`bg-white/[0.04] border border-edge-active/40 rounded-sm px-1.5 py-0.5 -mx-1.5 -my-0.5 outline-none focus:border-info/60 ${inputClassName || className}`}
      />
    );
  }

  const isEmpty = !value;
  return (
    <span
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
      className={`cursor-text rounded-sm px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-white/[0.04] transition-colors ${
        isEmpty ? `text-dim italic ${emptyClassName}` : ''
      } ${className}`}
    >
      {isEmpty ? placeholder : value}
    </span>
  );
}
