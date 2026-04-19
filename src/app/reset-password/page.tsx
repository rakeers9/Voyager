'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Fair', 'Strong', 'Excellent'];
  const s = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: labels[s] };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  // Release the global body overflow lock so this page can scroll on mobile.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Verify the recovery session is active. If the user navigated here without
  // a valid session (e.g. the link expired), bounce them back to login.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/login?error=auth');
      } else {
        setSessionReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  const pwStrength = useMemo(() => scorePassword(password), [password]);

  const errors = useMemo(() => {
    const e: { password?: string; confirm?: string } = {};
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Use at least 8 characters.';
    if (confirm !== password) e.confirm = 'Passwords do not match.';
    return e;
  }, [password, confirm]);

  const showErr = (key: 'password' | 'confirm') => touched[key] && errors[key];
  const formValid = Object.keys(errors).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!formValid) return;

    setLoading(true);
    setBanner(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setBanner({
        kind: 'success',
        text: 'Password updated. Redirecting…',
      });
      // Brief pause so the user sees the confirmation, then go to dashboard.
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password.';
      setBanner({ kind: 'error', text: message });
      setLoading(false);
    }
  };

  if (sessionReady === null) {
    return (
      <div className="flex min-h-[100dvh] w-screen items-center justify-center bg-base">
        <Loader2 size={20} className="animate-spin text-dim" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] w-screen items-center justify-center bg-base text-primary px-6 py-10">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
            <Compass size={16} className="text-heading" />
          </div>
          <span className="font-bold text-[14px] tracking-[0.18em] text-heading">TRIP SITTER</span>
        </div>

        <div className="mb-6">
          <h1 className="text-heading text-[22px] font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="mt-1 text-[13px] text-dim">
            Choose a strong password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <Field
            icon={<Lock size={14} />}
            label="New password"
            error={showErr('password') ? errors.password : undefined}
          >
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="At least 8 characters"
                disabled={loading}
                autoFocus
                className="auth-input pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dim hover:text-primary transition-colors"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {password && <StrengthMeter score={pwStrength.score} label={pwStrength.label} />}
          </Field>

          <Field
            icon={<Lock size={14} />}
            label="Confirm new password"
            error={showErr('confirm') ? errors.confirm : undefined}
            success={
              !!confirm && confirm === password && !errors.confirm ? 'Matches' : undefined
            }
          >
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              placeholder="Re-enter password"
              disabled={loading}
              className="auth-input"
            />
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-heading text-base text-[13px] font-semibold hover:bg-heading/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Updating…
              </>
            ) : (
              <>
                Update password
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {banner && (
          <div
            className={`mt-4 flex items-start gap-2 px-3 py-2.5 rounded-sm border text-[12px] ${
              banner.kind === 'error'
                ? 'border-danger/30 bg-danger/[0.06] text-danger'
                : 'border-success/30 bg-success/[0.06] text-success'
            }`}
          >
            {banner.kind === 'error' ? (
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
            )}
            <span className="leading-relaxed">{banner.text}</span>
          </div>
        )}
      </div>

      <style jsx global>{`
        .auth-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 2px;
          border: 1px solid var(--color-edge);
          background: rgba(255, 255, 255, 0.02);
          color: var(--color-primary);
          font-size: 13px;
          outline: none;
          transition: border-color 120ms ease, background-color 120ms ease;
        }
        .auth-input::placeholder { color: var(--color-dim); }
        .auth-input:hover:not(:disabled) { border-color: rgba(161, 161, 170, 0.35); }
        .auth-input:focus {
          border-color: var(--color-edge-active);
          background: rgba(255, 255, 255, 0.035);
        }
        .auth-input:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Field({
  icon,
  label,
  error,
  success,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  error?: string;
  success?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-dim font-mono mb-1.5">
        <span className="text-muted">{icon}</span>
        {label}
      </label>
      {children}
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-danger">
          <AlertCircle size={11} /> {error}
        </div>
      )}
      {!error && success && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-success">
          <CheckCircle2 size={11} /> {success}
        </div>
      )}
    </div>
  );
}

function StrengthMeter({ score, label }: { score: 0 | 1 | 2 | 3 | 4; label: string }) {
  const colors = ['bg-edge', 'bg-danger', 'bg-warning', 'bg-drive', 'bg-success'];
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? colors[score] : 'bg-edge'
            }`}
          />
        ))}
      </div>
      {label && (
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em]">
          <span className="text-dim">Strength</span>
          <span className="text-muted">{label}</span>
        </div>
      )}
    </div>
  );
}
