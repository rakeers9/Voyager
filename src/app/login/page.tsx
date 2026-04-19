'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-base" />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);

  useEffect(() => {
    if (searchParams.get('error') === 'auth') {
      setBanner({ kind: 'error', text: 'Authentication failed. Please try again.' });
    }
  }, [searchParams]);

  const pwStrength = useMemo(() => scorePassword(password), [password]);

  const errors: FieldErrors = useMemo(() => {
    const e: FieldErrors = {};
    if (mode === 'signup' && !name.trim()) e.name = 'Enter your name.';
    if (!email) e.email = 'Email is required.';
    else if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email.';
    if (!password) e.password = 'Password is required.';
    else if (mode === 'signup' && password.length < 8)
      e.password = 'Use at least 8 characters.';
    else if (mode === 'signin' && password.length < 6)
      e.password = 'Password must be at least 6 characters.';
    if (mode === 'signup' && confirm !== password) e.confirm = 'Passwords do not match.';
    return e;
  }, [mode, name, email, password, confirm]);

  const showErr = (key: keyof FieldErrors) => touched[key] && errors[key];
  const formValid = Object.keys(errors).length === 0;

  const detectCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsOn(e.getModifierState('CapsLock'));
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setBanner(null);
    setTouched({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (!formValid) return;

    setLoading(true);
    setBanner(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        setBanner({
          kind: 'success',
          text: `We sent a confirmation link to ${email}. Open it to activate your account.`,
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setBanner({ kind: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(forgotEmail)) return;
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    });
    setForgotSending(false);
    if (error) {
      setBanner({ kind: 'error', text: error.message });
    } else {
      setBanner({
        kind: 'success',
        text: `Password reset link sent to ${forgotEmail}.`,
      });
      setForgotOpen(false);
      setForgotEmail('');
    }
  };

  return (
    <div className="flex min-h-screen w-screen bg-base text-primary overflow-y-auto">
      {/* LEFT — Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between w-[44%] xl:w-[40%] border-r border-edge/60 bg-surface/40 overflow-hidden">
        {/* grid backdrop */}
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage:
              'radial-gradient(ellipse at top left, rgba(0,0,0,0.9), transparent 70%)',
          }}
        />
        {/* accent glow */}
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-20 pointer-events-none bg-accent" />
        <div className="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full blur-3xl opacity-[0.08] pointer-events-none bg-drive" />

        <div className="relative z-10 p-10 xl:p-14">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
              <Compass size={18} className="text-heading" />
            </div>
            <span className="font-bold text-[15px] tracking-[0.18em] text-heading">
              TRIP SITTER
            </span>
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-dim font-mono">
            Trip Operations · v0.1
          </div>
        </div>

        <div className="relative z-10 px-10 xl:px-14 -mt-8">
          <h1 className="text-heading text-[34px] xl:text-[40px] leading-[1.08] font-bold tracking-tight">
            Mission control
            <br />
            for family travel.
          </h1>
          <p className="mt-4 text-[14px] text-muted max-w-md leading-relaxed">
            Plan, visualize, and run every trip from a single command surface.
            Timeline, map, and live intel, always in sync.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 max-w-md">
            <Stat label="Trips Staged" value="12" />
            <Stat label="Segments Mapped" value="284" />
            <Stat label="Avg Drive Time" value="3h 12m" mono />
            <Stat label="Uptime" value="99.98%" mono />
          </div>
        </div>

        <div className="relative z-10 p-10 xl:p-14 flex items-center gap-6 text-[11px] uppercase tracking-[0.18em] text-dim font-mono">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Systems Nominal
          </div>
          <div className="flex items-center gap-2">
            <Shield size={12} /> Encrypted
          </div>
          <div className="flex items-center gap-2">
            <Globe size={12} /> Global Routing
          </div>
        </div>
      </aside>

      {/* RIGHT — Form */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-sm bg-info/10 border border-info/20 flex items-center justify-center">
              <Compass size={16} className="text-heading" />
            </div>
            <span className="font-bold text-[14px] tracking-[0.18em] text-heading">
              TRIP SITTER
            </span>
          </div>

          {/* Tab switcher */}
          <div className="relative grid grid-cols-2 p-1 rounded-sm border border-edge bg-surface/60 mb-6">
            <TabButton active={mode === 'signin'} onClick={() => switchMode('signin')}>
              Sign in
            </TabButton>
            <TabButton active={mode === 'signup'} onClick={() => switchMode('signup')}>
              Create account
            </TabButton>
            <motion.div
              layout
              layoutId="auth-tab"
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[2px] bg-elevated border border-edge pointer-events-none"
              style={{ left: mode === 'signin' ? 4 : 'calc(50% + 0px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          </div>

          <div className="mb-6">
            <h2 className="text-heading text-[22px] font-semibold tracking-tight">
              {mode === 'signin' ? 'Welcome back, Commander.' : 'Deploy a new operator.'}
            </h2>
            <p className="mt-1 text-[13px] text-dim">
              {mode === 'signin'
                ? 'Authenticate to resume your trip dashboard.'
                : 'Set up credentials to start staging trips.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <AnimatePresence initial={false} mode="popLayout">
              {mode === 'signup' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Field
                    icon={<UserIcon size={14} />}
                    label="Full name"
                    error={showErr('name') ? errors.name : undefined}
                  >
                    <input
                      type="text"
                      value={name}
                      autoComplete="name"
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      placeholder="Ada Lovelace"
                      disabled={loading}
                      className="auth-input"
                    />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <Field
              icon={<Mail size={14} />}
              label="Email"
              error={showErr('email') ? errors.email : undefined}
            >
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@domain.com"
                disabled={loading}
                className="auth-input"
              />
            </Field>

            <Field
              icon={<Lock size={14} />}
              label="Password"
              error={showErr('password') ? errors.password : undefined}
              rightAction={
                mode === 'signin' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(true);
                      setForgotEmail(email);
                    }}
                    className="text-[11px] text-dim hover:text-primary transition-colors"
                  >
                    Forgot?
                  </button>
                ) : null
              }
            >
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={detectCaps}
                  onKeyDown={detectCaps}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, password: true }));
                    setCapsOn(false);
                  }}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  disabled={loading}
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
              {capsOn && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-warning">
                  <AlertCircle size={11} /> Caps Lock is on
                </div>
              )}
              {mode === 'signup' && password && (
                <StrengthMeter score={pwStrength.score} label={pwStrength.label} />
              )}
            </Field>

            <AnimatePresence initial={false} mode="popLayout">
              {mode === 'signup' && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <Field
                    icon={<Lock size={14} />}
                    label="Confirm password"
                    error={showErr('confirm') ? errors.confirm : undefined}
                    success={
                      !!confirm && confirm === password && !errors.confirm
                        ? 'Matches'
                        : undefined
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
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-heading text-base text-[13px] font-semibold hover:bg-heading/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {mode === 'signin' ? 'Authenticating…' : 'Creating account…'}
                </>
              ) : (
                <>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <AnimatePresence>
            {banner && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
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
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-[11px] text-dim leading-relaxed">
            By continuing you agree to the{' '}
            <span className="text-muted">Terms</span> and{' '}
            <span className="text-muted">Privacy Policy</span>.
          </p>
        </div>
      </main>

      {/* Forgot password modal */}
      <AnimatePresence>
        {forgotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm px-6"
            onClick={() => setForgotOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-sm border border-edge bg-surface p-6"
            >
              <div className="flex items-center gap-2 mb-1">
                <Lock size={14} className="text-dim" />
                <h3 className="text-heading text-[15px] font-semibold">Reset password</h3>
              </div>
              <p className="text-[12px] text-dim mb-4">
                Enter your email and we&apos;ll send a secure reset link.
              </p>
              <form onSubmit={handleForgot} className="space-y-3">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@domain.com"
                  autoFocus
                  required
                  className="auth-input"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="px-3 py-2 rounded-sm text-[12px] text-dim hover:text-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSending || !EMAIL_RE.test(forgotEmail)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-sm bg-heading text-base text-[12px] font-semibold hover:bg-heading/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {forgotSending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ArrowRight size={12} />
                    )}
                    Send link
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* shared input styles */}
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
        .auth-input::placeholder {
          color: var(--color-dim);
        }
        .auth-input:hover:not(:disabled) {
          border-color: rgba(161, 161, 170, 0.35);
        }
        .auth-input:focus {
          border-color: var(--color-edge-active);
          background: rgba(255, 255, 255, 0.035);
        }
        .auth-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 py-2 text-[12px] font-semibold tracking-wide transition-colors ${
        active ? 'text-heading' : 'text-dim hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  icon,
  label,
  error,
  success,
  rightAction,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  error?: string;
  success?: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-dim font-mono">
          <span className="text-muted">{icon}</span>
          {label}
        </label>
        {rightAction}
      </div>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-danger"
          >
            <AlertCircle size={11} /> {error}
          </motion.div>
        ) : success ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-success"
          >
            <CheckCircle2 size={11} /> {success}
          </motion.div>
        ) : null}
      </AnimatePresence>
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

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-4 py-3 rounded-sm border border-edge/80 bg-surface/60 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-[0.18em] text-dim font-mono">
        {label}
      </div>
      <div
        className={`mt-1 text-heading text-[18px] font-semibold ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

