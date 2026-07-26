"use client";

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  assessPassword,
  clearLocalSession,
  createLocalAccount,
  type LocalIdentity,
  restoreLocalSession,
  signInLocalAccount,
  startGuestSession,
} from "./local-auth";

type AuthMode = "sign-in" | "sign-up";

function BrandMark() {
  return (
    <span className="auth-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  );
}

function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-grid" />
      <div className="auth-orbit auth-orbit-one"><i /></div>
      <div className="auth-orbit auth-orbit-two"><i /></div>
      <div className="auth-aurora auth-aurora-one" />
      <div className="auth-aurora auth-aurora-two" />
    </div>
  );
}

function AuthStory() {
  return (
    <section className="auth-story">
      <div className="auth-brand">
        <BrandMark />
        <span>
          <strong>Skein</strong>
          <small>Private web intelligence</small>
        </span>
      </div>
      <div className="auth-story-copy">
        <span className="auth-kicker"><Radar size={14} /> Local identity lattice</span>
        <h1>Your web intelligence<br /><em>stays yours.</em></h1>
        <p>
          Sign in to a workspace secured entirely on this device. Nothing leaves
          your browser—not your password, not your account proof, not your session.
        </p>
      </div>
      <div className="auth-proof-grid">
        <article>
          <span><Fingerprint size={17} /></span>
          <div><strong>600k</strong><small>PBKDF2 rounds</small></div>
        </article>
        <article>
          <span><LockKeyhole size={17} /></span>
          <div><strong>Zero</strong><small>plaintext secrets</small></div>
        </article>
        <article>
          <span><ShieldCheck size={17} /></span>
          <div><strong>Local</strong><small>browser vault</small></div>
        </article>
      </div>
      <div className="auth-telemetry">
        <span><i /> Identity boundary nominal</span>
        <code>LOCAL // AESAFE // SESSION-01</code>
      </div>
    </section>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <div>
        <KeyRound size={17} />
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function AuthPanel({
  mode,
  setMode,
  onAuthenticated,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onAuthenticated: (identity: LocalIdentity) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const assessment = useMemo(
    () => assessPassword(password, { displayName, email }),
    [displayName, email, password],
  );
  const passwordsMatch = confirmation.length > 0 && password === confirmation;

  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

  function switchMode(nextMode: AuthMode) {
    setError("");
    setPassword("");
    setConfirmation("");
    setMode(nextMode);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const identity =
        mode === "sign-up"
          ? await createLocalAccount({ displayName, email, password })
          : await signInLocalAccount(email, password);
      onAuthenticated(identity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Local authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  const signupReady =
    displayName.trim().length >= 2 &&
    email.includes("@") &&
    assessment.valid &&
    passwordsMatch;

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-panel-head">
        <span className="auth-mobile-brand"><BrandMark /> Skein</span>
        <span className="auth-security-chip"><ShieldCheck size={14} /> Device secured</span>
        <h2 id="auth-title">
          {mode === "sign-in" ? "Welcome back." : "Create your local identity."}
        </h2>
        <p>
          {mode === "sign-in"
            ? "Unlock the account stored in this browser."
            : "Your account proof is created and stored only on this machine."}
        </p>
      </div>

      <div className="auth-mode" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          className={mode === "sign-in" ? "active" : undefined}
          onClick={() => switchMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sign-up"}
          className={mode === "sign-up" ? "active" : undefined}
          onClick={() => switchMode("sign-up")}
        >
          Create account
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {mode === "sign-up" && (
          <label className="auth-field" htmlFor="auth-name">
            <span>Display name</span>
            <div>
              <UserRound size={17} />
              <input
                ref={firstField}
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                placeholder="Ada Lovelace"
                minLength={2}
                required
              />
            </div>
          </label>
        )}

        <label className="auth-field" htmlFor="auth-email">
          <span>Email</span>
          <div>
            <Fingerprint size={17} />
            <input
              ref={mode === "sign-in" ? firstField : undefined}
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="you@example.com"
              required
            />
          </div>
        </label>

        <PasswordField
          id="auth-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          describedBy={mode === "sign-up" ? "password-strength" : undefined}
        />

        {mode === "sign-up" && (
          <>
            <PasswordField
              id="auth-confirm-password"
              label="Confirm password"
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
              describedBy="password-match"
            />
            <div className="password-strength" id="password-strength" aria-live="polite">
              <div>
                <span>Password strength</span>
                <strong data-score={assessment.score}>{assessment.label}</strong>
              </div>
              <div className="strength-track" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <i key={index} className={index < assessment.score ? "active" : undefined} />
                ))}
              </div>
              <ul>
                {assessment.requirements.map((requirement) => (
                  <li key={requirement.id} className={requirement.met ? "met" : undefined}>
                    <span>{requirement.met ? <Check size={11} /> : null}</span>
                    {requirement.label}
                  </li>
                ))}
              </ul>
              <p id="password-match" className={passwordsMatch ? "match" : undefined}>
                {confirmation
                  ? passwordsMatch
                    ? "Passwords match."
                    : "Passwords do not match."
                  : "Repeat your password exactly."}
              </p>
            </div>
          </>
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <button
          type="submit"
          className="auth-primary"
          disabled={busy || (mode === "sign-up" && !signupReady)}
        >
          <span>{busy ? "Securing local identity…" : mode === "sign-in" ? "Sign in securely" : "Create local account"}</span>
          {busy ? <i className="auth-spinner" /> : <ArrowRight size={17} />}
        </button>
      </form>

      <div className="auth-divider"><span>or enter without an account</span></div>
      <button
        type="button"
        className="auth-guest"
        onClick={() => onAuthenticated(startGuestSession())}
      >
        <Sparkles size={17} />
        <span><strong>Continue as guest</strong><small>Session clears when this tab closes</small></span>
        <ArrowRight size={16} />
      </button>

      <p className="auth-local-note">
        <LockKeyhole size={13} />
        Skein never sends account credentials to its API or a third party.
      </p>
    </section>
  );
}

export function LocalAuthGate({
  children,
}: {
  children: (session: { identity: LocalIdentity; signOut: () => void }) => ReactNode;
}) {
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIdentity(restoreLocalSession());
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function signOut() {
    clearLocalSession();
    setIdentity(null);
    setMode("sign-in");
  }

  if (restored && identity) return children({ identity, signOut });

  return (
    <main className="auth-shell">
      <AuthBackdrop />
      <div className="auth-layout">
        <AuthStory />
        <AuthPanel mode={mode} setMode={setMode} onAuthenticated={setIdentity} />
      </div>
      {!restored && (
        <div className="auth-restoring" role="status">
          <i className="auth-spinner" /> Restoring local session…
        </div>
      )}
    </main>
  );
}
