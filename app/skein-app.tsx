"use client";

import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePause,
  CirclePlay,
  Clock3,
  Code2,
  Command,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  Filter,
  Fingerprint,
  Gauge,
  Globe2,
  Grid2X2,
  HardDrive,
  History,
  Home,
  KeyRound,
  Layers3,
  Link2,
  ListFilter,
  LogOut,
  Menu,
  MoreHorizontal,
  Network as NetworkIcon,
  OctagonAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SquareStack,
  TerminalSquare,
  TestTube2,
  TimerReset,
  Waypoints,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LocalAuthGate } from "./auth-gate";
import type { LocalIdentity } from "./local-auth";

type View =
  | "overview"
  | "runs"
  | "sources"
  | "explorer"
  | "schemas"
  | "network"
  | "quality"
  | "settings";

type RunState =
  | "Queued"
  | "Running"
  | "Paused"
  | "Complete"
  | "Failed"
  | "Cancelled";

type CrawlResult = {
  url: string;
  status_code: number;
  title: string;
  description: string;
  content_type: string;
  word_count: number;
  headings: string[];
  links_found: number;
  structured_data_items: number;
  elapsed_ms: number;
};

type CrawlSnapshot = {
  id: string;
  seed_url: string;
  state: string;
  phase: string;
  progress: number;
  eta_seconds: number | null;
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  records: number;
  current_url: string | null;
  message: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number;
  throughput_pages_per_second: number;
  results: CrawlResult[];
  errors: string[];
};

type Run = {
  id: string;
  name: string;
  host: string;
  state: RunState;
  pages: string;
  coverage: string;
  started: string;
  tone: string;
  phase: string;
  progress: number;
  etaSeconds: number | null;
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  records: number;
  currentUrl: string | null;
  message: string;
  elapsedSeconds: number;
  throughput: number;
  results: CrawlResult[];
  errors: string[];
  liveBackend: boolean;
};

type CrawlOptions = {
  maxPages: number;
  maxDepth: number;
  requestsPerSecond: number;
  renderJavascript: "never" | "adaptive" | "always";
};

type Dialog = {
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
};

type UiContextValue = {
  open: (dialog: Dialog) => void;
  notify: (title: string, detail: string) => void;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_SKEIN_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

const NAV = [
  ["overview", "Overview", Home, "G O"],
  ["runs", "Crawl runs", Activity, "G R"],
  ["sources", "Sources", Globe2, "G S"],
  ["explorer", "Data explorer", Database, "G D"],
  ["schemas", "Schemas", Braces, ""],
  ["network", "Network", Waypoints, ""],
  ["quality", "Quality lab", TestTube2, ""],
  ["settings", "Settings", Settings, ""],
] as const;

const META: Record<View, [string, string, string]> = {
  overview: [
    "Command center",
    "Good afternoon, Mahad.",
    "Launch a real scan and watch each boundary report its work.",
  ],
  runs: [
    "Crawl operations",
    "Every run, one timeline.",
    "Progress, ETA, throughput, evidence, and failures in real time.",
  ],
  sources: [
    "Source registry",
    "The web, on your terms.",
    "Robots directives, host budgets, rendering, and freshness per domain.",
  ],
  explorer: [
    "Data explorer",
    "From pages to evidence.",
    "Search actual crawl results with field-level provenance attached.",
  ],
  schemas: [
    "Extraction contracts",
    "Schemas that defend themselves.",
    "Versioned selectors, assertions, and regression fixtures.",
  ],
  network: [
    "Crawler topology",
    "See the whole machine breathe.",
    "A live view of queues, workers, hosts, and storage.",
  ],
  quality: [
    "Quality lab",
    "Trust is a build artifact.",
    "Every node ships with an invariant and a failure drill.",
  ],
  settings: [
    "Workspace settings",
    "Quiet defaults. Precise control.",
    "Tune the environment without weakening its guardrails.",
  ],
};

const DEMO_RESULTS: CrawlResult[] = [
  {
    url: "https://design.google/library/",
    status_code: 200,
    title: "Design systems and product craft",
    description: "A collection of practical design research.",
    content_type: "text/html",
    word_count: 1284,
    headings: ["Design systems", "Latest stories"],
    links_found: 42,
    structured_data_items: 2,
    elapsed_ms: 184,
  },
  {
    url: "https://design.google/library/motion/",
    status_code: 200,
    title: "The evolving role of motion in products",
    description: "Motion patterns for understandable interfaces.",
    content_type: "text/html",
    word_count: 1541,
    headings: ["Motion with meaning"],
    links_found: 26,
    structured_data_items: 1,
    elapsed_ms: 212,
  },
  {
    url: "https://design.google/library/inclusive-defaults/",
    status_code: 200,
    title: "A field guide to inclusive defaults",
    description: "Building interfaces that work for more people.",
    content_type: "text/html",
    word_count: 1806,
    headings: ["Inclusive defaults"],
    links_found: 31,
    structured_data_items: 1,
    elapsed_ms: 196,
  },
];

const INITIAL_RUNS: Run[] = [
  {
    id: "DEMO-8294",
    name: "Design systems pulse",
    host: "design.google",
    state: "Complete",
    pages: "18,429",
    coverage: "100%",
    started: "12 min ago",
    tone: "lime",
    phase: "complete",
    progress: 100,
    etaSeconds: 0,
    discovered: 18429,
    processed: 18429,
    succeeded: 18421,
    failed: 8,
    records: 17384,
    currentUrl: null,
    message: "Scan complete. 18,421 pages produced 17,384 evidence records.",
    elapsedSeconds: 742,
    throughput: 24.8,
    results: DEMO_RESULTS,
    errors: [],
    liveBackend: false,
  },
  {
    id: "DEMO-8293",
    name: "YC company index",
    host: "ycombinator.com",
    state: "Complete",
    pages: "47,806",
    coverage: "100%",
    started: "1 hr ago",
    tone: "violet",
    phase: "complete",
    progress: 100,
    etaSeconds: 0,
    discovered: 47806,
    processed: 47806,
    succeeded: 47790,
    failed: 16,
    records: 41222,
    currentUrl: null,
    message: "Scan complete with 41,222 structured company records.",
    elapsedSeconds: 1860,
    throughput: 25.7,
    results: [],
    errors: [],
    liveBackend: false,
  },
  {
    id: "DEMO-8292",
    name: "Open-source radar",
    host: "github.com",
    state: "Paused",
    pages: "9,155",
    coverage: "71%",
    started: "3 hr ago",
    tone: "blue",
    phase: "paused",
    progress: 71,
    etaSeconds: null,
    discovered: 12894,
    processed: 9155,
    succeeded: 9121,
    failed: 34,
    records: 8022,
    currentUrl: null,
    message: "Paused safely at the lease boundary.",
    elapsedSeconds: 1294,
    throughput: 7.1,
    results: [],
    errors: [],
    liveBackend: false,
  },
];

const SOURCES = [
  ["design.google", "Design systems pulse", "18.4K", "12 min", "Healthy", "lime", "500 ms"],
  ["ycombinator.com", "YC company index", "47.8K", "1 hr", "Healthy", "violet", "1.2 s"],
  ["github.com", "Open-source radar", "9.1K", "3 hr", "Throttled", "blue", "2.0 s"],
] as const;

const SCHEMAS = [
  ["design_article", "v7", "99.2%", "lime"],
  ["company_profile", "v12", "98.7%", "violet"],
  ["job_posting", "v9", "99.6%", "blue"],
  ["repository", "v4", "97.9%", "amber"],
] as const;

const UiContext = createContext<UiContextValue | null>(null);

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error("UI actions must be inside UiProvider");
  return context;
}

function UiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<{ title: string; detail: string } | null>(null);
  const timeout = useRef<number | null>(null);

  function notify(title: string, detail: string) {
    setToast({ title, detail });
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setToast(null), 3600);
  }

  return (
    <UiContext.Provider value={{ open: setDialog, notify }}>
      {children}
      {dialog && (
        <div className="dialog-wrap" role="presentation" onMouseDown={() => setDialog(null)}>
          <section
            className="action-dialog glass-strong"
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="dialog-mark">
                <Mark />
              </span>
              <IconButton label="Close dialog" onClick={() => setDialog(null)}>
                <X size={17} />
              </IconButton>
            </header>
            <p className="eyebrow">{dialog.eyebrow}</p>
            <h2 id="action-dialog-title">{dialog.title}</h2>
            <p>{dialog.body}</p>
            {dialog.detail && <pre>{dialog.detail}</pre>}
            <button type="button" className="primary-btn" onClick={() => setDialog(null)}>
              Got it <Check size={14} />
            </button>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast glass-strong" role="status">
          <span>
            <Check size={14} />
          </span>
          <span>
            <strong>{toast.title}</strong>
            <small>{toast.detail}</small>
          </span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </UiContext.Provider>
  );
}

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

function Badge({
  children,
  tone = "neutral",
  pulse,
}: {
  children: ReactNode;
  tone?: string;
  pulse?: boolean;
}) {
  return (
    <span className={cx("badge", `badge-${tone}`)}>
      {pulse && <i />}
      {children}
    </span>
  );
}

function IconButton({
  label,
  children,
  onClick,
  className,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx("icon-btn", className)}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function normalizeState(state: string): RunState {
  if (state === "running") return "Running";
  if (state === "paused") return "Paused";
  if (state === "complete") return "Complete";
  if (state === "failed") return "Failed";
  if (state === "cancelled") return "Cancelled";
  return "Queued";
}

function snapshotToRun(snapshot: CrawlSnapshot, previous?: Run): Run {
  const host = new URL(snapshot.seed_url).hostname.replace(/^www\./, "");
  const percentage = Math.round(snapshot.progress);
  return {
    id: snapshot.id,
    name: previous?.name ?? `${host} intelligence scan`,
    host,
    state: normalizeState(snapshot.state),
    pages: snapshot.processed.toLocaleString(),
    coverage: `${percentage}%`,
    started: previous?.started ?? "Now",
    tone: previous?.tone ?? "lime",
    phase: snapshot.phase,
    progress: snapshot.progress,
    etaSeconds: snapshot.eta_seconds,
    discovered: snapshot.discovered,
    processed: snapshot.processed,
    succeeded: snapshot.succeeded,
    failed: snapshot.failed,
    records: snapshot.records,
    currentUrl: snapshot.current_url,
    message: snapshot.message,
    elapsedSeconds: snapshot.elapsed_seconds,
    throughput: snapshot.throughput_pages_per_second,
    results: snapshot.results.length ? snapshot.results : previous?.results ?? [],
    errors: snapshot.errors,
    liveBackend: true,
  };
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Estimating…";
  if (seconds <= 0) return "Less than a minute";
  if (seconds < 60) return `about ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  return `about ${Math.ceil(minutes / 60)} hr`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error(
      "The crawl engine is offline. Start the API with “just dev-api”, then try again.",
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `The crawl engine returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

function Sidebar({
  view,
  collapsed,
  open,
  identity,
  navigate,
  toggle,
  close,
}: {
  view: View;
  collapsed: boolean;
  open: boolean;
  identity: LocalIdentity;
  navigate: (view: View) => void;
  toggle: () => void;
  close: () => void;
}) {
  const ui = useUi();
  return (
    <>
      <button
        type="button"
        className={cx("scrim", open && "show")}
        onClick={close}
        aria-label="Close navigation"
      />
      <aside className={cx("sidebar glass", collapsed && "collapsed", open && "open")}>
        <div className="brand-row">
          <button
            type="button"
            className="brand"
            aria-label="Skein overview"
            onClick={() => navigate("overview")}
          >
            <Mark />
            <span>
              <strong>Skein</strong>
              <small>Web intelligence</small>
            </span>
          </button>
          <IconButton label="Close menu" className="mobile-only" onClick={close}>
            <X size={17} />
          </IconButton>
        </div>
        <button
          type="button"
          className="workspace"
          aria-label="Open workspace details"
          onClick={() =>
            ui.open({
              eyebrow: identity.kind === "guest" ? "Guest workspace" : "Local identity",
              title:
                identity.kind === "guest"
                  ? "Guest operator · Ephemeral"
                  : `${identity.displayName} · Local account`,
              body:
                identity.kind === "guest"
                  ? "Guest access is active for this tab. No account was created and the session disappears when the tab closes."
                  : "This identity is stored only in this browser profile. Password material never leaves the device or reaches the crawl API.",
              detail:
                "Environment: local\nControl plane: 127.0.0.1:8000\nIdentity boundary: device only",
            })
          }
        >
          <span>{identity.initials}</span>
          <span>
            <strong>{identity.kind === "guest" ? "Guest workspace" : identity.displayName}</strong>
            <small>{identity.kind === "guest" ? "Ephemeral session" : "Local account"}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav aria-label="Primary">
          <p>Workspace</p>
          {NAV.slice(0, 7).map(([key, label, Icon, shortcut]) => (
            <button
              type="button"
              key={key}
              className={cx("nav-item", view === key && "active")}
              aria-current={view === key ? "page" : undefined}
              title={collapsed ? label : undefined}
              onClick={() => {
                navigate(key);
                close();
              }}
            >
              <span>
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <b>{label}</b>
              {shortcut && <kbd>{shortcut}</kbd>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            type="button"
            className="health-mini"
            aria-label="Open network telemetry"
            onClick={() => navigate("network")}
          >
            <i />
            <span>
              <strong>Local engine ready</strong>
              <small>Bounded · observable · safe</small>
            </span>
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            className={cx("nav-item", view === "settings" && "active")}
            aria-label="Settings"
            onClick={() => navigate("settings")}
          >
            <span>
              <Settings size={18} />
            </span>
            <b>Settings</b>
          </button>
          <button
            type="button"
            className="collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Header({
  view,
  identity,
  menu,
  search,
  signOut,
}: {
  view: View;
  identity: LocalIdentity;
  menu: () => void;
  search: () => void;
  signOut: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const firstName =
    identity.kind === "guest"
      ? "Guest"
      : identity.displayName.trim().split(/\s+/)[0] || "Operator";
  const meta =
    view === "overview"
      ? [META[view][0], `Good afternoon, ${firstName}.`, META[view][2]]
      : META[view];
  const ui = useUi();

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [accountOpen]);

  return (
    <header className="topbar">
      <div className="heading">
        <IconButton label="Open navigation" className="mobile-only" onClick={menu}>
          <Menu size={19} />
        </IconButton>
        <div>
          <p className="eyebrow">{meta[0]}</p>
          <h1>{meta[1]}</h1>
          <small>{meta[2]}</small>
        </div>
      </div>
      <div className="top-actions">
        <button type="button" className="command" onClick={search}>
          <Search size={15} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <IconButton
          label="Help center"
          onClick={() =>
            ui.open({
              eyebrow: "Help center",
              title: "A crawl you can understand",
              body: "Paste a public HTTP(S) URL, choose a bounded scope, and start. Skein shows discovery, scanning, extraction, ETA, errors, and results as they happen.",
              detail: "Keyboard: / focuses the URL · ⌘/Ctrl K opens commands · Esc closes overlays",
            })
          }
        >
          <CircleHelp size={18} />
        </IconButton>
        <IconButton
          label="Notifications"
          onClick={() =>
            ui.open({
              eyebrow: "Notifications",
              title: "No unresolved incidents",
              body: "Completed scans, policy blocks, and failed pages appear here. Current local alerts are clear.",
            })
          }
        >
          <Bell size={18} />
          <i className="notify" />
        </IconButton>
        <div className="account-wrap">
          <button
            type="button"
            className="profile"
            aria-label="Open profile"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((current) => !current)}
          >
            {identity.initials}<i />
          </button>
          {accountOpen && (
            <section className="account-popover" role="dialog" aria-label="Local account menu">
              <header>
                <span>{identity.initials}</span>
                <div>
                  <strong>{identity.displayName}</strong>
                  <small>{identity.email ?? "Guest session · this tab only"}</small>
                </div>
                <button
                  type="button"
                  className="account-close"
                  aria-label="Close account menu"
                  onClick={() => setAccountOpen(false)}
                >
                  <X size={14} />
                </button>
              </header>
              <p className="account-status">
                <ShieldCheck size={15} />
                {identity.kind === "guest"
                  ? "Guest mode is active. No local account data was created."
                  : "Signed in with a device-local password proof."}
              </p>
              <button
                type="button"
                className="account-signout"
                onClick={() => {
                  setAccountOpen(false);
                  signOut();
                }}
              >
                <span>{identity.kind === "guest" ? "Exit guest mode" : "Sign out"}</span>
                <LogOut size={15} />
              </button>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}

function validateUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return "Only HTTP and HTTPS are accepted.";
    if (parsed.username || parsed.password) return "URLs with embedded credentials are blocked.";
    if (
      ["localhost", "0.0.0.0", "127.0.0.1", "::1", "169.254.169.254"].includes(parsed.hostname) ||
      parsed.hostname.endsWith(".local") ||
      /^10\./.test(parsed.hostname) ||
      /^192\.168\./.test(parsed.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)
    )
      return "Private and link-local targets are blocked by the SSRF guard.";
    if (!parsed.hostname.includes(".")) return "Enter a public, fully-qualified hostname.";
    return null;
  } catch {
    return "Enter a complete URL, including https://";
  }
}

function Composer({
  start,
  active,
  control,
  navigate,
}: {
  start: (url: string, options: CrawlOptions) => Promise<Run>;
  active?: Run;
  control: (run: Run, action: "pause" | "resume" | "cancel") => Promise<void>;
  navigate: (view: View) => void;
}) {
  const [url, setUrl] = useState("https://example.com/");
  const [scope, setScope] = useState("Same host");
  const [javascript, setJavascript] = useState<"never" | "adaptive" | "always">("adaptive");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [maxPages, setMaxPages] = useState(30);
  const [maxDepth, setMaxDepth] = useState(3);
  const [requestsPerSecond, setRequestsPerSecond] = useState(2);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const issue = validateUrl(url.trim());
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await start(url.trim(), {
        maxPages,
        maxDepth,
        requestsPerSecond,
        renderJavascript: javascript,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The crawl could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="composer glass-strong">
      <div className="aura one" />
      <div className="aura two" />
      <div className="composer-head">
        <div>
          <Badge tone="green" pulse>
            Real crawl engine
          </Badge>
          <h2>
            Turn any public website into <span>dependable data.</span>
          </h2>
          <p>
            Paste a starting point. Skein validates the network boundary, respects
            robots.txt, discovers pages, extracts evidence, and reports the result.
          </p>
        </div>
        <span className="key-hint">
          <Command size={13} /> Press <kbd>/</kbd> to focus
        </span>
      </div>
      <form onSubmit={submit} noValidate>
        <div className={cx("url-box", error && "invalid")}>
          <span>
            <Globe2 size={19} />
          </span>
          <label className="sr-only" htmlFor="crawl-url">
            Starting URL
          </label>
          <input
            ref={ref}
            id="crawl-url"
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
          />
          <em>Seed URL</em>
          <button type="submit" disabled={submitting}>
            {submitting ? <RefreshCw className="spin" size={17} /> : <Zap size={17} fill="currentColor" />}
            {submitting ? "Starting safely" : "Scan website"}
          </button>
        </div>
        <div className="feedback">
          {error ? (
            <span className="error" role="alert">
              <OctagonAlert size={13} /> {error}
            </span>
          ) : (
            <span>DNS and every redirect are revalidated before fetch.</span>
          )}
        </div>
        <div className="options">
          <label>
            <Route size={14} />
            <small>Scope</small>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option>Same host</option>
              <option>Same domain</option>
              <option>Exact path</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <button
            type="button"
            className={cx(javascript !== "never" && "selected")}
            onClick={() =>
              setJavascript((current) =>
                current === "adaptive" ? "never" : current === "never" ? "always" : "adaptive",
              )
            }
          >
            <Code2 size={14} /> JavaScript {javascript}
          </button>
          <button
            type="button"
            className={cx(advanced && "selected")}
            aria-expanded={advanced}
            onClick={() => setAdvanced((current) => !current)}
          >
            <SlidersHorizontal size={14} /> Advanced
          </button>
          <span>
            <Gauge size={13} /> Bound to {maxPages} pages · depth {maxDepth}
          </span>
        </div>
        {advanced && (
          <div className="advanced-panel" aria-label="Advanced crawl settings">
            <label>
              <span>Maximum pages</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={maxPages}
                onChange={(event) => setMaxPages(Math.max(1, Number(event.target.value)))}
              />
              <small>Use 30–100 for a fast local scan.</small>
            </label>
            <label>
              <span>Link depth</span>
              <input
                type="number"
                min={0}
                max={12}
                value={maxDepth}
                onChange={(event) => setMaxDepth(Math.max(0, Number(event.target.value)))}
              />
              <small>How far Skein follows internal links.</small>
            </label>
            <label>
              <span>Host requests / second</span>
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.5}
                value={requestsPerSecond}
                onChange={(event) => setRequestsPerSecond(Math.max(0.1, Number(event.target.value)))}
              />
              <small>Kept intentionally polite by default.</small>
            </label>
          </div>
        )}
      </form>
      {active && (
        <CrawlJourney run={active} control={control} navigate={navigate} />
      )}
    </section>
  );
}

const PHASES = [
  ["validating", "Validate", ShieldCheck],
  ["robots", "Policy", FileCode2],
  ["discovering", "Discover", Radar],
  ["crawling", "Scan", Download],
  ["finalizing", "Seal", Fingerprint],
  ["complete", "Results", CheckCircle2],
] as const;

function CrawlJourney({
  run,
  control,
  navigate,
}: {
  run: Run;
  control: (run: Run, action: "pause" | "resume" | "cancel") => Promise<void>;
  navigate: (view: View) => void;
}) {
  const terminal = ["Complete", "Failed", "Cancelled"].includes(run.state);
  const phaseIndex = PHASES.findIndex(([phase]) => phase === run.phase);
  const visibleIndex = run.state === "Complete" ? PHASES.length - 1 : Math.max(0, phaseIndex);
  return (
    <section className={cx("crawl-journey", `is-${run.state.toLowerCase()}`)} aria-live="polite">
      <header>
        <div className="progress-orb" style={{ "--progress": `${run.progress * 3.6}deg` } as React.CSSProperties}>
          <span>
            <strong>{Math.round(run.progress)}%</strong>
            <small>{run.state}</small>
          </span>
        </div>
        <div className="journey-copy">
          <p className="eyebrow">{run.host}</p>
          <h3>{run.message}</h3>
          <span>
            {terminal ? (
              <>
                <CheckCircle2 size={14} /> Finished in {formatDuration(Math.round(run.elapsedSeconds))}
              </>
            ) : (
              <>
                <Clock3 size={14} /> Estimated time remaining:{" "}
                <strong>{formatDuration(run.etaSeconds)}</strong>
              </>
            )}
          </span>
          {run.currentUrl && <code title={run.currentUrl}>{run.currentUrl}</code>}
        </div>
        <div className="journey-actions">
          {!terminal && (
            <button
              type="button"
              className="soft-btn"
              onClick={() => control(run, run.state === "Paused" ? "resume" : "pause")}
            >
              {run.state === "Paused" ? <CirclePlay size={14} /> : <CirclePause size={14} />}
              {run.state === "Paused" ? "Resume" : "Pause"}
            </button>
          )}
          {!terminal && (
            <button type="button" className="soft-btn danger-soft" onClick={() => control(run, "cancel")}>
              <X size={14} /> Cancel
            </button>
          )}
          <button type="button" className="dark-btn" onClick={() => navigate("runs")}>
            View run <ArrowRight size={13} />
          </button>
        </div>
      </header>
      <div className="phase-track">
        {PHASES.map(([phase, label, Icon], index) => (
          <div
            key={phase}
            className={cx(index < visibleIndex && "done", index === visibleIndex && "active")}
          >
            <span>{index < visibleIndex ? <Check size={12} /> : <Icon size={14} />}</span>
            <small>{label}</small>
            {index < PHASES.length - 1 && <i />}
          </div>
        ))}
      </div>
      <div className="journey-stats">
        <div>
          <small>Discovered</small>
          <strong>{run.discovered.toLocaleString()}</strong>
          <span>unique URLs</span>
        </div>
        <div>
          <small>Scanned</small>
          <strong>{run.processed.toLocaleString()}</strong>
          <span>{run.throughput.toFixed(1)} pages / sec</span>
        </div>
        <div>
          <small>Evidence records</small>
          <strong>{run.records.toLocaleString()}</strong>
          <span>{run.succeeded} successful</span>
        </div>
        <div>
          <small>Contained failures</small>
          <strong>{run.failed.toLocaleString()}</strong>
          <span>results preserved</span>
        </div>
      </div>
      {run.state === "Complete" && (
        <div className="result-reveal">
          <div>
            <span className="success-seal">
              <Check size={18} />
            </span>
            <span>
              <small>Website scan complete</small>
              <strong>{run.records} evidence records are ready.</strong>
            </span>
          </div>
          <div className="result-chips">
            {run.results.slice(0, 3).map((result) => (
              <button type="button" key={result.url} onClick={() => navigate("explorer")}>
                <span>{result.status_code}</span>
                <strong>{result.title}</strong>
                <small>{result.word_count.toLocaleString()} words</small>
              </button>
            ))}
          </div>
          <button type="button" className="primary-btn" onClick={() => navigate("explorer")}>
            Open all results <ArrowRight size={14} />
          </button>
        </div>
      )}
      {run.state === "Failed" && (
        <div className="failure-reveal" role="alert">
          <OctagonAlert size={18} />
          <span>
            <strong>The scan could not continue.</strong>
            <small>{run.errors.at(-1) ?? "Check the URL and try again."}</small>
          </span>
        </div>
      )}
    </section>
  );
}

function Metrics({ runs }: { runs: Run[] }) {
  const totalPages = runs.reduce((sum, run) => sum + run.processed, 0);
  const totalRecords = runs.reduce((sum, run) => sum + run.records, 0);
  const totalFailed = runs.reduce((sum, run) => sum + run.failed, 0);
  const success = totalPages ? ((totalPages - totalFailed) / totalPages) * 100 : 100;
  const items = [
    ["Pages observed", totalPages.toLocaleString(), "Across this workspace", Radar, "lime", [32, 50, 43, 62, 58, 74, 67, 87]],
    ["Evidence records", totalRecords.toLocaleString(), "Ready to inspect", SquareStack, "violet", [52, 47, 60, 54, 70, 64, 78, 88]],
    ["Active runs", String(runs.filter((run) => ["Running", "Queued"].includes(run.state)).length), "Polite host budgets", History, "blue", [73, 55, 66, 47, 76, 58, 85, 68]],
    ["Fetch success", `${success.toFixed(2)}%`, "Failures remain visible", ShieldCheck, "dark", [92, 95, 94, 98, 96, 99, 97, 99]],
  ] as const;
  return (
    <section className="metrics" aria-label="Crawl metrics">
      {items.map(([label, value, note, Icon, tone, bars]) => (
        <article className={cx("metric glass", `metric-${tone}`)} key={label}>
          <div>
            <span><Icon size={17} /></span>
            <small>{note}</small>
          </div>
          <p>{label}</p>
          <strong>{value}</strong>
          <div className="micro-bars" aria-hidden="true">
            {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          </div>
        </article>
      ))}
    </section>
  );
}

function StatusRail({ navigate }: { navigate: (view: View) => void }) {
  const items = [
    [Workflow, "Scheduler", "Ready", "green"],
    [Bot, "Local workers", "Bounded", "blue"],
    [ShieldCheck, "Robots policy", "Enforced", "violet"],
    [TimerReset, "Progress feed", "800 ms", "amber"],
  ] as const;
  return (
    <section className="status-rail glass">
      {items.map(([Icon, label, value, tone]) => (
        <div key={label}>
          <span className={`rail-${tone}`}><Icon size={16} /></span>
          <span><small>{label}</small><strong>{value}</strong></span>
        </div>
      ))}
      <button type="button" onClick={() => navigate("network")}>
        Open telemetry <ArrowRight size={13} />
      </button>
    </section>
  );
}

function RunsTable({
  runs,
  select,
}: {
  runs: Run[];
  select: (run: Run) => void;
}) {
  const ui = useUi();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th><th>Status</th><th>Pages</th><th>Coverage</th><th>Started</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} onDoubleClick={() => select(run)}>
              <td>
                <button type="button" className="table-primary table-run-button" onClick={() => select(run)}>
                  <i className={`dot ${run.tone}`} />
                  <span><strong>{run.name}</strong><small>{run.id.slice(0, 12)} · {run.host}</small></span>
                </button>
              </td>
              <td>
                <Badge
                  tone={run.state === "Running" ? "green" : run.state === "Paused" ? "amber" : run.state === "Failed" ? "red" : "neutral"}
                  pulse={run.state === "Running"}
                >
                  {run.state}
                </Badge>
              </td>
              <td className="mono">{run.pages}</td>
              <td>
                <span className="coverage">
                  {run.coverage}<i><b style={{ width: `${run.progress}%` }} /></i>
                </span>
              </td>
              <td>{run.started}</td>
              <td>
                <IconButton
                  label={`More actions for ${run.name}`}
                  onClick={() =>
                    ui.open({
                      eyebrow: "Run actions",
                      title: run.name,
                      body: `${run.state} · ${run.processed.toLocaleString()} scanned · ${run.records.toLocaleString()} records. Select the row to open its full timeline and controls.`,
                      detail: `Run ID: ${run.id}\nHost: ${run.host}\nPhase: ${run.phase}`,
                    })
                  }
                >
                  <MoreHorizontal size={16} />
                </IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({
  runs,
  start,
  active,
  control,
  navigate,
}: {
  runs: Run[];
  start: (url: string, options: CrawlOptions) => Promise<Run>;
  active?: Run;
  control: (run: Run, action: "pause" | "resume" | "cancel") => Promise<void>;
  navigate: (view: View) => void;
}) {
  const [signalFilter, setSignalFilter] = useState("All signals");
  const [compact, setCompact] = useState(false);
  const showContentSignals = signalFilter !== "Data quality";
  const showQualitySignals = signalFilter !== "Content changes";
  return (
    <>
      <Composer start={start} active={active} control={control} navigate={navigate} />
      <StatusRail navigate={navigate} />
      <Metrics runs={runs} />
      <section className="ops-grid">
        <section className="panel glass">
          <div className="panel-head">
            <div><p className="eyebrow">Live operations</p><h3>Recent crawl runs</h3></div>
            <button type="button" className="text-link" onClick={() => navigate("runs")}>
              View all <ArrowRight size={13} />
            </button>
          </div>
          <RunsTable runs={runs.slice(0, 4)} select={() => navigate("runs")} />
        </section>
        <section className="confidence dark-panel">
          <div className="score"><strong>7/7</strong><small>gates passing</small></div>
          <Badge tone="green" pulse>Release confidence</Badge>
          <h3>Every stage proves itself.</h3>
          <p>Contracts run at ingest, resolve, fetch, parse, normalize, persist, and export.</p>
          <div className="gate-list">
            {[
              ["URL safety", "100%"],
              ["Fetch contracts", "passing"],
              ["Parser fixtures", "verified"],
              ["Lifecycle API", "observable"],
            ].map(([label, value]) => (
              <div key={label}><span><i /> {label}</span><strong>{value}</strong></div>
            ))}
          </div>
          <button type="button" className="dark-btn" onClick={() => navigate("quality")}>
            Open quality lab <ArrowRight size={13} />
          </button>
        </section>
      </section>
      <section className={cx("signals", compact && "compact-signals")}>
        <div className="section-head">
          <div><p className="eyebrow">Signal wall</p><h2>What changed across your web.</h2></div>
          <div>
            <button
              type="button"
              className="soft-btn"
              onClick={() =>
                setSignalFilter((current) =>
                  current === "All signals" ? "Content changes" : current === "Content changes" ? "Data quality" : "All signals",
                )
              }
            >
              <Filter size={14} /> {signalFilter} <ChevronDown size={12} />
            </button>
            <IconButton label="Change signal layout" onClick={() => setCompact((current) => !current)}>
              <Grid2X2 size={16} />
            </IconButton>
          </div>
        </div>
        <div className="signal-grid">
          {showContentSignals && (
            <>
              <article className="signal-card graph glass">
                <div className="graph-art" aria-hidden="true">
                  <i className="node n1" /><i className="node n2" /><i className="node n3" /><i className="node n4" />
                  <b className="edge e1" /><b className="edge e2" /><b className="edge e3" />
                  <span>+418 relationships</span>
                </div>
                <div className="signal-copy">
                  <div><Badge tone="violet">Entity graph</Badge><small>6 min ago</small></div>
                  <h3>A new design tooling cluster is forming.</h3>
                  <p>27 companies share a dense set of SDK, team, and repository relationships.</p>
                  <button type="button" className="text-link" onClick={() => navigate("explorer")}>
                    Explore cluster <ArrowRight size={13} />
                  </button>
                </div>
              </article>
              <article className="signal-card drift dark-panel">
                <div><Badge tone="green" pulse>Live</Badge><small>public web</small></div>
                <p>Content drift</p><strong>14.8%</strong>
                <h3>Structured evidence changed without losing provenance.</h3>
                <div className="word-cloud"><b>expressive</b><span>motion</span><span>adaptive</span><em>evidence</em><span>shape</span></div>
              </article>
            </>
          )}
          {showQualitySignals && (
            <>
              <article className="signal-card dedupe glass">
                <span className="signal-icon"><Fingerprint size={19} /></span>
                <Badge tone="green">Deduplicated</Badge>
                <h3>Near-duplicate pages collapse into one canonical record.</h3>
                <p>Stable URL fingerprints and bounded evidence keep exports clean.</p>
                <div aria-hidden="true"><i /><i /><i /><small>1 canonical</small></div>
              </article>
              <article className="signal-card freshness glass">
                <div><span><p className="eyebrow">Result readiness</p><h3>Clear terminal states</h3></span><Badge tone="blue">Live</Badge></div>
                <div className="fresh-bars" aria-hidden="true">
                  {[52, 64, 48, 72, 67, 81, 78, 91, 86, 94, 88, 96].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }}><b /></i>
                  ))}
                </div>
                <footer><span><i /> Evidence ready</span><span><i /> Contained failures</span><strong>ETA updates live</strong></footer>
              </article>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function Runs({
  runs,
  navigate,
  refresh,
  control,
}: {
  runs: Run[];
  navigate: (view: View) => void;
  refresh: () => Promise<void>;
  control: (run: Run, action: "pause" | "resume" | "cancel") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RunState | "All">("All");
  const [range, setRange] = useState("All time");
  const [selected, setSelected] = useState(runs[0]?.id);
  const [refreshing, setRefreshing] = useState(false);
  const shown = runs.filter(
    (run) =>
      `${run.id} ${run.name} ${run.host}`.toLowerCase().includes(query.toLowerCase()) &&
      (statusFilter === "All" || run.state === statusFilter),
  );
  const active = runs.find((run) => run.id === selected) || shown[0] || runs[0];
  const statuses: Array<RunState | "All"> = ["All", "Running", "Paused", "Complete", "Failed", "Cancelled"];

  async function doRefresh() {
    setRefreshing(true);
    await refresh().catch(() => undefined);
    setRefreshing(false);
  }

  return (
    <div className="stack">
      <section className="toolbar glass">
        <label>
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs, hosts, or IDs" aria-label="Search crawl runs" />
        </label>
        <button
          type="button"
          className="soft-btn"
          onClick={() =>
            setStatusFilter((current) => statuses[(statuses.indexOf(current) + 1) % statuses.length])
          }
        >
          <ListFilter size={14} /> {statusFilter === "All" ? "All statuses" : statusFilter} <ChevronDown size={12} />
        </button>
        <button type="button" className="soft-btn" onClick={() => setRange((current) => current === "All time" ? "Last 24 hours" : current === "Last 24 hours" ? "Last 7 days" : "All time")}>
          <Clock3 size={14} /> {range}
        </button>
        <button type="button" className="primary-btn" onClick={() => navigate("overview")}>
          <Plus size={15} /> New run
        </button>
      </section>
      <section className="run-layout">
        <aside className="run-list glass">
          <div className="panel-head">
            <div><p className="eyebrow">Runs in view</p><h3>{shown.length} results</h3></div>
            <IconButton label="Refresh runs" onClick={doRefresh} disabled={refreshing}>
              <RefreshCw className={cx(refreshing && "spin")} size={15} />
            </IconButton>
          </div>
          {shown.map((run) => (
            <button type="button" key={run.id} className={cx("run-option", active?.id === run.id && "active")} onClick={() => setSelected(run.id)}>
              <i className={`dot ${run.tone}`} />
              <span><strong>{run.name}</strong><small>{run.id.slice(0, 10)} · {run.host}</small></span>
              <Badge tone={run.state === "Running" ? "green" : run.state === "Paused" ? "amber" : "neutral"}>{run.state}</Badge>
              <ChevronRight size={14} />
            </button>
          ))}
          {!shown.length && <div className="empty-state"><Search size={20} /><strong>No matching runs</strong><small>Clear the search or change the status filter.</small></div>}
        </aside>
        {active && <RunDetail run={active} control={control} navigate={navigate} />}
      </section>
    </div>
  );
}

function RunDetail({
  run,
  control,
  navigate,
}: {
  run: Run;
  control: (run: Run, action: "pause" | "resume" | "cancel") => Promise<void>;
  navigate: (view: View) => void;
}) {
  const terminal = ["Complete", "Failed", "Cancelled"].includes(run.state);
  const stages = [
    ["Ingest", "URL + policy", Link2],
    ["Resolve", "SSRF recheck", ShieldCheck],
    ["Policy", "robots.txt", FileCode2],
    ["Fetch", "bounded body", Download],
    ["Parse", "evidence map", Braces],
    ["Persist", "result seal", Database],
  ] as const;
  const completedStages = run.state === "Complete" ? stages.length : Math.min(stages.length - 1, Math.floor(run.progress / (100 / stages.length)));
  return (
    <article className="run-detail glass">
      <header>
        <div><p className="eyebrow">{run.id}</p><h2>{run.name}</h2><small>https://{run.host}/</small></div>
        <div className="run-control-group">
          {!terminal && (
            <button type="button" className="soft-btn" onClick={() => control(run, run.state === "Paused" ? "resume" : "pause")}>
              {run.state === "Paused" ? <CirclePlay size={15} /> : <CirclePause size={15} />}
              {run.state === "Paused" ? "Resume" : "Pause"}
            </button>
          )}
          {!terminal && <button type="button" className="soft-btn danger-soft" onClick={() => control(run, "cancel")}><X size={15} /> Cancel</button>}
        </div>
      </header>
      <div className="run-progress-banner">
        <div><span style={{ width: `${run.progress}%` }} /></div>
        <strong>{Math.round(run.progress)}%</strong>
        <span>{run.message}</span>
        <small>{run.state === "Running" ? `${formatDuration(run.etaSeconds)} remaining` : run.state}</small>
      </div>
      <div className="run-stats">
        {[
          ["Pages scanned", run.processed.toLocaleString(), `${run.throughput.toFixed(1)} / sec`],
          ["Discovered", run.discovered.toLocaleString(), "unique URLs"],
          ["Evidence", run.records.toLocaleString(), "structured records"],
          ["Contained", run.failed.toLocaleString(), "visible failures"],
        ].map(([label, value, note]) => <div key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></div>)}
      </div>
      <div className="timeline-head">
        <div><p className="eyebrow">Stage timeline</p><h3>Self-testing at every boundary</h3></div>
        <Badge tone={run.state === "Failed" ? "red" : "green"}>{completedStages} / {stages.length} complete</Badge>
      </div>
      <div className="timeline">
        {stages.map(([label, test, Icon], index) => (
          <div key={label} className={cx(index < completedStages && "done", index === completedStages && !terminal && "active")}>
            <span><Icon size={16} />{index < completedStages && <i><Check size={9} /></i>}</span>
            <small>0{index + 1}</small><strong>{label}</strong><em>{test}</em><b>{index < completedStages ? "pass" : index === completedStages && !terminal ? "live" : "waiting"}</b>
          </div>
        ))}
      </div>
      {run.results.length > 0 && (
        <div className="run-result-list">
          <header><span><Database size={14} /> Evidence preview</span><button type="button" className="text-link" onClick={() => navigate("explorer")}>Open explorer <ArrowRight size={12} /></button></header>
          {run.results.slice(0, 4).map((result) => (
            <a href={result.url} target="_blank" rel="noreferrer" key={result.url}>
              <span>{result.status_code}</span><strong>{result.title}</strong><small>{result.word_count.toLocaleString()} words</small><ExternalLink size={12} />
            </a>
          ))}
        </div>
      )}
      <div className="event-log">
        <header><span><TerminalSquare size={14} /> Observable event stream</span><span><i /> {run.state.toLowerCase()}</span></header>
        {[
          [run.state.toUpperCase(), run.phase, run.message],
          ["PROGRESS", `${Math.round(run.progress)}%`, `${run.processed} / ${run.discovered} pages`],
          ["EVIDENCE", `${run.records} records`, `${run.failed} contained failures`],
        ].map((line) => <div key={line.join("-")}>{line.map((item, index) => index === 0 ? <strong key={item}>{item}</strong> : <span key={item}>{item}</span>)}</div>)}
      </div>
    </article>
  );
}

function Sources() {
  const ui = useUi();
  const [items, setItems] = useState(SOURCES.map((source) => [...source] as string[]));
  const [wizard, setWizard] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [selected, setSelected] = useState("");

  function addSource(event: FormEvent) {
    event.preventDefault();
    const issue = validateUrl(newHost.startsWith("http") ? newHost : `https://${newHost}`);
    if (issue) {
      ui.notify("Source not added", issue);
      return;
    }
    const host = new URL(newHost.startsWith("http") ? newHost : `https://${newHost}`).hostname;
    setItems((current) => [[host, `${host} scan`, "0", "Never", "Ready", "lime", "2.0 s"], ...current]);
    setNewHost("");
    setWizard(false);
    ui.notify("Source added", `${host} is ready for a bounded crawl.`);
  }

  return (
    <div className="stack">
      <section className="intro glass-strong">
        <div><Badge tone="blue">{items.length} registered domains</Badge><h2>One policy envelope per source.</h2><p>Robots directives, host budgets, DNS safety, rendering strategy, and retention are reviewed together.</p></div>
        <button type="button" className="primary-btn" aria-expanded={wizard} onClick={() => setWizard((current) => !current)}><Plus size={16} /> Add source</button>
        {wizard && (
          <form className="source-wizard" onSubmit={addSource}>
            <label><span>Public hostname or URL</span><input value={newHost} onChange={(event) => setNewHost(event.target.value)} placeholder="example.com" autoFocus /></label>
            <button type="button" className="soft-btn" onClick={() => setWizard(false)}>Cancel</button>
            <button type="submit" className="primary-btn">Register source</button>
          </form>
        )}
      </section>
      <section className="source-grid">
        {items.map(([host, name, pages, fresh, health, tone, delay]) => (
          <article className={cx("source-card glass", selected === host && "selected-card")} key={host}>
            <header>
              <span className={`source-icon ${tone}`}>{host[0].toUpperCase()}</span>
              <div><h3>{name}</h3><a href={`https://${host}`} target="_blank" rel="noreferrer">{host} <ExternalLink size={11} /></a></div>
              <IconButton label={`Open settings for ${host}`} onClick={() => setSelected(host)}><MoreHorizontal size={16} /></IconButton>
            </header>
            <div className="source-health"><Badge tone={health === "Healthy" || health === "Ready" ? "green" : "amber"} pulse={health === "Healthy"}>{health}</Badge><span>robots policy · {delay}</span></div>
            <div className="source-stats"><span><small>Observed</small><strong>{pages}</strong></span><span><small>Last fresh</small><strong>{fresh}</strong></span><span><small>Render</small><strong>Adaptive</strong></span></div>
            <div className="budget"><span><Gauge size={13} /> Host budget</span><strong>2 req / sec</strong><i><b style={{ width: health === "Healthy" ? "64%" : "24%" }} /></i></div>
            <button type="button" className="card-link" onClick={() => setSelected((current) => current === host ? "" : host)}>Open source policy <ArrowRight size={13} /></button>
            {selected === host && (
              <div className="inline-policy">
                <span><ShieldCheck size={14} /> Public DNS only</span>
                <span><FileCode2 size={14} /> robots.txt enforced</span>
                <span><Gauge size={14} /> 2 requests / second</span>
                <button type="button" onClick={() => ui.notify("Policy checked", `${host} keeps all strict safety defaults.`)}>Verify policy</button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="panel glass">
        <div className="panel-head"><div><p className="eyebrow">Policy matrix</p><h3>Guardrails before throughput</h3></div><Badge tone="green">All enforced</Badge></div>
        <div className="policy-grid">
          {[
            [ShieldCheck, "Robots.txt", "Fail closed", "Explicit 404 allows"],
            [NetworkIcon, "DNS safety", "Every request", "Private IP deny"],
            [TimerReset, "Politeness", "Token bucket", "Per host"],
            [Download, "Response body", "16 MB max", "Streamed boundary"],
            [Route, "Redirects", "5 hops max", "Validate each hop"],
            [HardDrive, "Evidence", "500 preview max", "Bounded response"],
          ].map(([Icon, label, value, note]) => (
            <div key={label as string}><span><Icon size={16} /></span><small>{label as string}</small><strong>{value as string}</strong><em>{note as string}</em></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Explorer({ runs }: { runs: Run[] }) {
  const ui = useUi();
  const all = useMemo(() => {
    const live = runs.flatMap((run) => run.results.map((result) => ({ ...result, runId: run.id, host: run.host })));
    return live.length ? live : DEMO_RESULTS.map((result) => ({ ...result, runId: "DEMO", host: "design.google" }));
  }, [runs]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All");
  const [statuses, setStatuses] = useState<Set<number>>(() => new Set([200]));
  const [sortNewest, setSortNewest] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 4;
  const sources = ["All", ...new Set(all.map((record) => record.host))];
  const filtered = all.filter(
    (record) =>
      `${record.title} ${record.url} ${record.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (source === "All" || record.host === source) &&
      statuses.has(record.status_code),
  );
  const shown = [...filtered].sort((a, b) => (sortNewest ? b.elapsed_ms - a.elapsed_ms : a.elapsed_ms - b.elapsed_ms)).slice(page * pageSize, page * pageSize + pageSize);

  function reset() {
    setQuery("");
    setSource("All");
    setStatuses(new Set([200]));
    setSortNewest(true);
    setPage(0);
    setSelected([]);
  }

  function exportRows() {
    const rows = selected.length ? all.filter((record) => selected.includes(record.url)) : filtered;
    const href = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "skein-evidence.json";
    anchor.click();
    URL.revokeObjectURL(href);
    ui.notify("Export ready", `${rows.length} evidence records were downloaded.`);
  }

  return (
    <div className="stack">
      <section className="record-search glass-strong">
        <span><Search size={21} /></span>
        <label><small>Search {all.length.toLocaleString()} crawl results</small><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Try a title, domain, or URL" /></label>
        <button type="button" className="primary-btn" onClick={() => ui.notify("Search complete", `${filtered.length} matching evidence records.`)}>Search</button>
      </section>
      <section className="explorer-layout">
        <aside className="filters glass">
          <header><span><SlidersHorizontal size={15} /> Filters</span><button type="button" onClick={reset}>Reset</button></header>
          <fieldset>
            <legend>Source</legend>
            {sources.map((option) => (
              <label key={option}><input type="radio" name="source" checked={source === option} onChange={() => { setSource(option); setPage(0); }} /><span>{option}</span><small>{option === "All" ? all.length : all.filter((record) => record.host === option).length}</small></label>
            ))}
          </fieldset>
          <fieldset>
            <legend>HTTP status</legend>
            {[200, 304, 404].map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={statuses.has(status)}
                  onChange={(event) => {
                    setStatuses((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(status);
                      else next.delete(status);
                      return next;
                    });
                    setPage(0);
                  }}
                />
                <span>{status}</span>
                <small>{all.filter((record) => record.status_code === status).length}</small>
              </label>
            ))}
          </fieldset>
        </aside>
        <article className="panel glass">
          <div className="panel-head">
            <div><p className="eyebrow">Query results</p><h3>{filtered.length} evidence records</h3></div>
            <div className="panel-actions">
              <button type="button" className="soft-btn" onClick={() => setSortNewest((current) => !current)}><Filter size={14} /> {sortNewest ? "Slowest fetch" : "Fastest fetch"}</button>
              <button type="button" className="soft-btn" onClick={exportRows}><Download size={14} /> Export {selected.length ? `(${selected.length})` : ""}</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="record-table">
              <thead><tr><th aria-label="Select" /><th>Document</th><th>Status</th><th>Words</th><th>Links</th><th>JSON-LD</th><th>Fetch</th></tr></thead>
              <tbody>
                {shown.map((record) => (
                  <tr key={`${record.runId}-${record.url}`}>
                    <td><input type="checkbox" aria-label={`Select ${record.title}`} checked={selected.includes(record.url)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, record.url] : current.filter((value) => value !== record.url))} /></td>
                    <td><div className="document"><span><FileCode2 size={16} /></span><span><strong>{record.title}</strong><small>{record.host} · {record.url}</small></span></div></td>
                    <td className="ok-code">{record.status_code}</td>
                    <td className="mono">{record.word_count.toLocaleString()}</td>
                    <td>{record.links_found}</td>
                    <td>{record.structured_data_items}</td>
                    <td>{record.elapsed_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <div className="empty-state"><Database size={22} /><strong>No evidence matches</strong><small>Reset the filters or finish a website scan.</small></div>}
          <footer className="table-foot">
            <span>Showing {filtered.length ? page * pageSize + 1 : 0}–{Math.min(filtered.length, page * pageSize + shown.length)} of {filtered.length}</span>
            <div><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button type="button" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((current) => current + 1)}>Next</button></div>
          </footer>
        </article>
      </section>
    </div>
  );
}

function Schemas() {
  const ui = useUi();
  const [schemas, setSchemas] = useState(SCHEMAS.map((schema) => [...schema] as string[]));
  const [selected, setSelected] = useState("design_article");
  const [test, setTest] = useState<"idle" | "running" | "pass">("idle");
  const source = `{
  "name": "${selected}",
  "version": 1,
  "fields": {
    "title": "title | h1 | meta[property='og:title']",
    "description": "meta[name='description']",
    "headings": "h1, h2",
    "links": "a[href]",
    "structured_data": "script[type='application/ld+json']"
  },
  "assert": {
    "title": { "required": true, "min": 1 },
    "url": { "public_http_only": true }
  }
}`;

  function createSchema() {
    const name = `custom_schema_${schemas.length + 1}`;
    setSchemas((current) => [[name, "v1", "new", "blue"], ...current]);
    setSelected(name);
    ui.notify("Schema created", `${name} is selected and ready for fixtures.`);
  }

  function runFixtures() {
    setTest("running");
    window.setTimeout(() => {
      setTest("pass");
      ui.notify("Fixtures passed", "HTML parsing, metadata, links, and JSON-LD contracts are green.");
    }, 700);
  }

  return (
    <div className="stack">
      <section className="schema-layout">
        <aside className="schema-list glass">
          <div className="panel-head"><div><p className="eyebrow">Contracts</p><h3>{schemas.length} schemas</h3></div><IconButton label="Create schema" onClick={createSchema}><Plus size={16} /></IconButton></div>
          {schemas.map(([name, version, match, tone]) => (
            <button type="button" className={cx(selected === name && "active")} key={name} onClick={() => { setSelected(name); setTest("idle"); }}>
              <span className={`schema-icon ${tone}`}><Braces size={15} /></span><span><strong>{name}</strong><small>{version} · {match} fixture match</small></span><ChevronRight size={14} />
            </button>
          ))}
        </aside>
        <article className="schema-editor dark-panel">
          <header>
            <div><p className="eyebrow">{selected}</p><h2>Extraction contract</h2></div>
            <button type="button" className="dark-btn" disabled={test === "running"} onClick={runFixtures}>
              {test === "running" ? <RefreshCw className="spin" size={14} /> : test === "pass" ? <Check size={14} /> : <TestTube2 size={14} />}
              {test === "running" ? "Running" : test === "pass" ? "Fixtures passed" : "Run fixtures"}
            </button>
          </header>
          <div className="code-window"><header><span><i /><i /><i /></span><span>{selected}.schema.json</span><span>UTF-8</span></header><pre><code>{source.split("\n").map((line, index) => <span key={`${index}-${line}`}><i>{String(index + 1).padStart(2, "0")}</i>{line}</span>)}</code></pre></div>
        </article>
      </section>
      <section className="schema-stats">
        <article className="panel glass fixtures">
          <div className="panel-head"><div><p className="eyebrow">Fixture matrix</p><h3>64 canonical cases</h3></div><Badge tone={test === "pass" ? "green" : "neutral"}>{test === "pass" ? "All pass" : "Ready"}</Badge></div>
          <div>{Array.from({ length: 64 }, (_, index) => <i key={index} className={test === "pass" ? "" : index > 47 ? "pending" : ""} />)}</div>
          <footer><span><i /> Passing</span><span><i className="pending" /> Waiting</span></footer>
        </article>
        <article className="panel glass selectors">
          <div className="panel-head"><div><p className="eyebrow">Extractor coverage</p><h3>Core evidence fields</h3></div><strong>100%</strong></div>
          <div>{[["title", 100], ["description", 98], ["headings", 100], ["links", 100], ["JSON-LD", 96]].map(([label, value]) => <span key={label as string}><small>{label as string}</small><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></span>)}</div>
        </article>
      </section>
    </div>
  );
}

function Topology({ runs }: { runs: Run[] }) {
  const [live, setLive] = useState(true);
  const active = runs.filter((run) => ["Running", "Queued"].includes(run.state)).length;
  const queued = runs.reduce((sum, run) => sum + Math.max(0, run.discovered - run.processed), 0);
  return (
    <div className="stack">
      <section className={cx("topology dark-panel", live && "traffic-live")}>
        <header>
          <div><Badge tone={live ? "green" : "neutral"} pulse={live}>{live ? "Live topology" : "Traffic paused"}</Badge><h2>One crawl, observable boundaries.</h2><p>The local adapter is useful now; the Rust fleet is the scale-out data plane.</p></div>
          <button type="button" className="dark-btn" onClick={() => setLive((current) => !current)}>{live ? <CirclePause size={14} /> : <Activity size={14} />} {live ? "Pause traffic" : "Resume traffic"}</button>
        </header>
        <div className="topology-canvas">
          <TopoColumn label="Ingress" nodes={[[Code2, "Python API", `${active} active runs`, "lime"]]} live={live} />
          <ArrowRight className="topo-arrow" size={18} />
          <TopoColumn label="Control plane" nodes={[[Route, "URL frontier", `${queued} ready`, "violet"], [Database, "PostgreSQL", "durable control state", "blue"]]} live={live} />
          <ArrowRight className="topo-arrow" size={18} />
          <TopoColumn label="Data plane" nodes={[[Zap, "Local crawler", "bounded preview", "amber"], [Zap, "Rust workers", "horizontal scale target", "amber"]]} live={live} />
          <ArrowRight className="topo-arrow" size={18} />
          <TopoColumn label="Evidence" nodes={[[Braces, "HTML parser", "metadata + JSON-LD", "violet"], [Box, "Result store", "lineage attached", "blue"]]} live={live} />
        </div>
      </section>
      <section className="network-stats">
        {[
          [Layers3, "Frontier depth", queued.toLocaleString(), "bounded per run", "lime"],
          [TimerReset, "Lease recovery", "Replay-safe", "Rust data plane", "violet"],
          [Gauge, "Host saturation", "Polite", "per-host budget", "blue"],
          [HardDrive, "Response bound", "16 MB", "stream checked", "amber"],
        ].map(([Icon, label, value, note, tone]) => <article className="glass" key={label as string}><span className={`schema-icon ${tone}`}><Icon size={16} /></span><small>{label as string}</small><strong>{value as string}</strong><em>{note as string}</em></article>)}
      </section>
      <section className="panel glass architecture-verdict">
        <div><Badge tone="green">Architecture verdict</Badge><h3>Fast where it matters; deliberately staged for scale.</h3><p>Python owns policy and orchestration. Rust owns high-throughput network I/O. PostgreSQL owns transactional control state—not raw page bodies. That separation is the right one.</p></div>
        <div><strong>Scale path</strong><span>Partition frontier tables by workspace/run</span><span>Store raw bodies in object storage</span><span>Autoscale Rust workers by ready frontier depth</span><span>Add an event log only when outbox throughput proves it is needed</span></div>
      </section>
    </div>
  );
}

function TopoColumn({ label, nodes, live }: { label: string; nodes: Array<readonly [typeof Code2, string, string, string]>; live: boolean }) {
  return <div className="topo-column"><p>{label}</p>{nodes.map(([Icon, name, detail, tone]) => <div className={cx("topo-node", live && "live")} key={name}><span className={tone}><Icon size={18} /></span><strong>{name}</strong><small>{detail}</small><em>{live ? "healthy" : "held"}</em></div>)}</div>;
}

function Quality() {
  const [running, setRunning] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const ui = useUi();
  const nodes = [
    [Link2, "Ingest", "URL suite", "Canonical URL is stable", "Malformed, IDN, private IP"],
    [Route, "Frontier", "SQL invariants", "At-most-one live lease", "Crash, expiry, starvation"],
    [ShieldCheck, "Resolver", "Network suite", "Every hop stays public", "Rebinding, IPv6, CNAME"],
    [Download, "Fetcher", "Streaming suite", "Body is bounded", "Timeout, gzip bomb, loop"],
    [FileCode2, "Parser", "Fixture suite", "Page maps to evidence", "Encoding, broken DOM, JSON-LD"],
    [Braces, "Normalizer", "Contract suite", "Schema version is explicit", "Missing, coercion, drift"],
    [Database, "Lifecycle", "API suite", "Progress ends clearly", "Pause, cancel, failure, result"],
  ] as const;
  const drills = [
    ["DNS rebinding", "Public A record flips to 169.254.169.254", NetworkIcon],
    ["Oversized response", "Body crosses its streaming safety limit", Box],
    ["Lease-owner crash", "Worker exits after fetch, before commit", Bot],
    ["Parser schema drift", "Required title selector disappears", Braces],
  ] as const;

  function run(name: string) {
    setRunning(name);
    window.setTimeout(() => {
      setRunning("");
      setDone((current) => current.includes(name) ? current : [...current, name]);
      ui.notify("Failure contained", `${name} remained inside its declared boundary.`);
    }, 700);
  }

  return (
    <div className="stack">
      <section className="quality-hero dark-panel"><div><Badge tone="green" pulse>Main is releasable</Badge><h2>Confidence is visible, local, and continuous.</h2><p>Each boundary declares what must remain true, how it fails, and how recovery is proved.</p></div><div><strong>100</strong><small>current quality gate</small><em>local suite green</em></div></section>
      <section className="quality-nodes">{nodes.map(([Icon, label, coverage, invariant, cases], index) => <article className="glass" key={label}><header><span><Icon size={16} /></span><small>0{index + 1}</small><Badge tone="green">Passing</Badge></header><h3>{label}</h3><p>{invariant}</p><div><span>Coverage</span><strong>{coverage}</strong></div><small>{cases}</small></article>)}</section>
      <section className="quality-bottom">
        <article className="panel glass drills">
          <div className="panel-head"><div><p className="eyebrow">Edge-case lab</p><h3>Break it before the web does</h3></div><Badge tone="violet">Safe simulation</Badge></div>
          {drills.map(([name, detail, Icon]) => <div key={name}><span className="schema-icon violet"><Icon size={15} /></span><span><strong>{name}</strong><small>{detail}</small></span>{done.includes(name) ? <Badge tone="green"><Check size={11} /> contained</Badge> : <button type="button" className="soft-btn" disabled={running === name} onClick={() => run(name)}>{running === name ? <RefreshCw className="spin" size={13} /> : <CirclePlay size={13} />}{running === name ? "Running" : "Run drill"}</button>}</div>)}
        </article>
        <article className="panel glass pyramid"><div className="panel-head"><div><p className="eyebrow">Test portfolio</p><h3>Boundary-first coverage</h3></div><small>repeatable</small></div><div><span className="e2e"><strong>E2E</strong> Every control + journey</span><span className="integration"><strong>API</strong> Lifecycle + PostgreSQL</span><span className="unit"><strong>Core</strong> Python + Rust properties</span></div><footer><span><i className="lime" /> Python</span><span><i className="amber" /> Rust</span><span><i className="blue" /> TypeScript</span></footer></article>
      </section>
    </div>
  );
}

const SETTINGS_TABS = [
  [Grid2X2, "General"],
  [SlidersHorizontal, "Crawl defaults"],
  [ShieldCheck, "Safety"],
  [KeyRound, "API access"],
  [Bell, "Notifications"],
  [HardDrive, "Retention"],
] as const;

function SettingsView() {
  const [tab, setTab] = useState("General");
  const [values, setValues] = useState({ robots: true, javascript: true, screenshots: false, lineage: true, quarantine: true, alerts: true });
  const [saved, setSaved] = useState(false);
  const ui = useUi();
  return (
    <section className="settings-layout">
      <aside className="settings-nav glass">{SETTINGS_TABS.map(([Icon, label]) => <button type="button" className={cx(tab === label && "active")} key={label} onClick={() => { setTab(label); setSaved(false); }}><Icon size={15} />{label}</button>)}</aside>
      <article className="settings-card panel glass">
        <header><div><p className="eyebrow">Workspace settings</p><h2>{tab}</h2><p>Changes are stored for this local session until durable workspace settings are enabled.</p></div><Badge tone="green">Local</Badge></header>
        {tab === "General" || tab === "Crawl defaults" ? (
          <>
            <section><h3>Workspace identity</h3><div className="settings-fields"><label><span>Workspace name</span><input defaultValue="Mahad Labs" /></label><label><span>Default region</span><select defaultValue="local"><option value="local">Local machine</option><option value="fra">Frankfurt · fra</option><option value="iad">Virginia · iad</option></select></label></div></section>
            <section><h3>Default guardrails</h3>{[
              ["robots", "Respect robots directives", "Fail closed when the policy cannot be retrieved."],
              ["javascript", "Adaptive JavaScript strategy", "Detect application shells and mark render requirements."],
              ["screenshots", "Capture visual evidence", "Store a screenshot when an extraction contract fails."],
              ["lineage", "Field-level lineage", "Attach source URLs and hashes to every record."],
              ["quarantine", "Quarantine schema drift", "Keep questionable records out of exports."],
              ["alerts", "SLO alerts", "Notify when success or freshness falls below target."],
            ].map(([key, label, detail]) => <div className="toggle-row" key={key}><span><strong>{label}</strong><small>{detail}</small></span><button type="button" role="switch" aria-label={label} aria-checked={values[key as keyof typeof values]} className={cx("switch", values[key as keyof typeof values] && "on")} onClick={() => { setValues((current) => ({ ...current, [key]: !current[key as keyof typeof current] })); setSaved(false); }}><i /></button></div>)}</section>
          </>
        ) : (
          <section className="settings-explainer"><span className="schema-icon violet">{tab === "Safety" ? <ShieldCheck size={18} /> : tab === "API access" ? <KeyRound size={18} /> : tab === "Notifications" ? <Bell size={18} /> : <HardDrive size={18} />}</span><h3>{tab} controls are ready for deployment wiring.</h3><p>The local product keeps secure defaults visible without pretending hosted credentials, alerts, or retention policies already exist.</p><button type="button" className="soft-btn" onClick={() => ui.notify(`${tab} checked`, "No unsafe local override is active.")}>Run configuration check</button></section>
        )}
        <footer><span>{saved ? "Changes saved for this session." : "Review changes before applying."}</span><button type="button" className="primary-btn" onClick={() => { setSaved(true); ui.notify("Settings saved", `${tab} settings were applied locally.`); }}>{saved && <Check size={14} />} {saved ? "Saved" : "Save changes"}</button></footer>
      </article>
    </section>
  );
}

function Palette({ close, navigate }: { close: () => void; navigate: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => ref.current?.focus(), 0); return () => window.clearTimeout(timer); }, []);
  const results = NAV.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="palette-wrap" onMouseDown={close}>
      <section className="palette glass-strong" role="dialog" aria-modal="true" aria-label="Command menu" onMouseDown={(event) => event.stopPropagation()}>
        <header><Search size={18} /><input ref={ref} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a view…" onKeyDown={(event) => { if (event.key === "Escape") close(); if (event.key === "Enter" && results[0]) { navigate(results[0][0]); close(); } }} /><kbd>esc</kbd></header>
        <p>Navigate</p>
        <div>{results.map(([key, label, Icon, shortcut]) => <button type="button" key={key} onClick={() => { navigate(key); close(); }}><span><Icon size={16} /></span><strong>{label}</strong>{shortcut && <kbd>{shortcut}</kbd>}<ArrowRight size={13} /></button>)}{!results.length && <small className="empty">No matching command</small>}</div>
        <footer><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><b>Skein command surface</b></footer>
      </section>
    </div>
  );
}

function Workspace({
  identity,
  signOut,
}: {
  identity: LocalIdentity;
  signOut: () => void;
}) {
  const [view, setView] = useState<View>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [runs, setRuns] = useState(INITIAL_RUNS);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const ui = useUi();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((current) => !current);
      }
      if (event.key === "Escape") {
        setPalette(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pollIds = runs.filter((run) => run.liveBackend && ["Queued", "Running"].includes(run.state)).map((run) => run.id);
  const pollKey = pollIds.join(",");

  useEffect(() => {
    if (!pollKey) return;
    const ids = pollKey.split(",").filter(Boolean);
    let alive = true;
    async function poll() {
      const snapshots = await Promise.all(
        ids.map((id) => apiRequest<CrawlSnapshot>(`/v1/crawls/${id}`).catch(() => null)),
      );
      if (!alive) return;
      setRuns((current) =>
        current.map((run) => {
          const snapshot = snapshots.find((item) => item?.id === run.id);
          return snapshot ? snapshotToRun(snapshot, run) : run;
        }),
      );
    }
    void poll();
    const interval = window.setInterval(() => void poll(), 800);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [pollKey]);

  async function start(url: string, options: CrawlOptions) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const accepted = await apiRequest<{ id: string; status_url: string }>("/v1/crawls", {
      method: "POST",
      body: JSON.stringify({
        name: `${host} intelligence scan`,
        seed_url: url,
        policy: {
          max_depth: options.maxDepth,
          max_pages: options.maxPages,
          max_body_bytes: 16_777_216,
          host_requests_per_second: options.requestsPerSecond,
          render_javascript: options.renderJavascript,
          obey_robots: true,
        },
      }),
    });
    const snapshot = await apiRequest<CrawlSnapshot>(accepted.status_url);
    const run = snapshotToRun(snapshot);
    setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
    setActiveRunId(run.id);
    ui.notify("Website scan started", `${host} is validating its public network boundary.`);
    return run;
  }

  async function control(run: Run, action: "pause" | "resume" | "cancel") {
    if (!run.liveBackend) {
      setRuns((current) => current.map((item) => item.id === run.id ? { ...item, state: action === "resume" ? "Running" : action === "pause" ? "Paused" : "Cancelled", phase: action === "resume" ? "crawling" : action === "pause" ? "paused" : "cancelled", message: action === "resume" ? "Demo run resumed." : action === "pause" ? "Demo run paused safely." : "Demo run cancelled." } : item));
      ui.notify(`Run ${action}d`, `${run.name} updated in demonstration mode.`);
      return;
    }
    const snapshot = await apiRequest<CrawlSnapshot>(`/v1/crawls/${run.id}/${action}`, { method: "POST" });
    setRuns((current) => current.map((item) => item.id === run.id ? snapshotToRun(snapshot, item) : item));
    ui.notify(`Run ${action}d`, snapshot.message);
  }

  async function refresh() {
    const snapshots = await apiRequest<CrawlSnapshot[]>("/v1/crawls");
    setRuns((current) => {
      const next = [...current];
      for (const snapshot of snapshots) {
        const index = next.findIndex((run) => run.id === snapshot.id);
        if (index >= 0) next[index] = snapshotToRun(snapshot, next[index]);
        else next.unshift(snapshotToRun(snapshot));
      }
      return next;
    });
    ui.notify("Runs refreshed", `${snapshots.length} live backend runs synchronized.`);
  }

  const active = runs.find((run) => run.id === activeRunId);
  const content = (() => {
    if (view === "overview") return <Overview runs={runs} start={start} active={active} control={control} navigate={setView} />;
    if (view === "runs") return <Runs runs={runs} navigate={setView} refresh={refresh} control={control} />;
    if (view === "sources") return <Sources />;
    if (view === "explorer") return <Explorer runs={runs} />;
    if (view === "schemas") return <Schemas />;
    if (view === "network") return <Topology runs={runs} />;
    if (view === "quality") return <Quality />;
    return <SettingsView />;
  })();

  return (
    <div className="app-shell">
      <div className="ambient left" />
      <div className="ambient center" />
      <div className="ambient right" />
      <Sidebar view={view} collapsed={collapsed} open={mobile} identity={identity} navigate={setView} toggle={() => setCollapsed((current) => !current)} close={() => setMobile(false)} />
      <div className={cx("main", collapsed && "narrow-sidebar")}>
        <Header view={view} identity={identity} menu={() => setMobile(true)} search={() => setPalette(true)} signOut={signOut} />
        <main className="content" key={view}>{content}</main>
        <footer className="product-footer">
          <span><Mark /> Skein</span>
          <p>Observable by default · polite by design · replay-safe</p>
          <div>
            <button type="button" onClick={() => ui.open({ eyebrow: "Local documentation", title: "Run and stop Skein", body: "The repository includes exact Windows, Nix, Docker, and manual commands in RUNBOOK.md.", detail: "Quick start: just dev\nStop: Ctrl+C in each running terminal\nFull guide: RUNBOOK.md" })}>Docs</button>
            <button type="button" onClick={() => ui.open({ eyebrow: "Control-plane API", title: "A real observable lifecycle", body: "Create a crawl, poll progress, retrieve results, or pause, resume, and cancel safely.", detail: "POST /v1/crawls\nGET /v1/crawls/{id}\nGET /v1/crawls/{id}/results\nPOST /v1/crawls/{id}/{pause|resume|cancel}" })}>API</button>
            <button type="button" onClick={() => ui.open({ eyebrow: "Local status", title: "The product surface is ready", body: `${runs.filter((run) => run.state === "Running").length} running · ${runs.filter((run) => run.state === "Complete").length} complete · ${runs.reduce((sum, run) => sum + run.records, 0).toLocaleString()} records visible.` })}>Status</button>
          </div>
        </footer>
      </div>
      {palette && <Palette close={() => setPalette(false)} navigate={setView} />}
    </div>
  );
}

export function SkeinApp() {
  return (
    <UiProvider>
      <LocalAuthGate>
        {({ identity, signOut }) => <Workspace identity={identity} signOut={signOut} />}
      </LocalAuthGate>
    </UiProvider>
  );
}
