export type LocalIdentity = {
  kind: "account" | "guest";
  displayName: string;
  email: string | null;
  initials: string;
};

export type PasswordRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export type PasswordAssessment = {
  score: number;
  label: "Too weak" | "Developing" | "Strong" | "Excellent";
  requirements: PasswordRequirement[];
  valid: boolean;
};

type LocalAccount = {
  email: string;
  displayName: string;
  initials: string;
  salt: string;
  passwordProof: string;
  iterations: number;
  createdAt: string;
  lastSignedInAt: string;
  schemaVersion: 1;
};

type StoredSession = LocalIdentity & {
  version: 1;
};

const DATABASE_NAME = "skein-local-identity";
const DATABASE_VERSION = 1;
const ACCOUNT_STORE = "accounts";
const SESSION_KEY = "skein.auth.session.v1";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const PROOF_BITS = 256;
const BLOCKED_PASSWORD_FRAGMENTS = [
  "password",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "123456",
  "skein",
];

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

function initialsFor(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "LO";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACCOUNT_STORE)) {
        database.createObjectStore(ACCOUNT_STORE, { keyPath: "email" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Local identity storage is unavailable in this browser."));
    request.onblocked = () =>
      reject(new Error("Local identity storage is busy. Close other Skein tabs and retry."));
  });
}

async function readAccount(email: string) {
  const database = await openDatabase();
  try {
    return await new Promise<LocalAccount | undefined>((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readonly");
      const request = transaction.objectStore(ACCOUNT_STORE).get(email);
      request.onsuccess = () => resolve(request.result as LocalAccount | undefined);
      request.onerror = () => reject(new Error("The local account could not be read."));
      transaction.onabort = () => reject(new Error("The local account read was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function writeAccount(account: LocalAccount) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readwrite");
      transaction.objectStore(ACCOUNT_STORE).put(account);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("The local account could not be saved."));
      transaction.onabort = () => reject(new Error("The local account save was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function derivePasswordProof(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const proof = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    PROOF_BITS,
  );
  return new Uint8Array(proof);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function persistSession(identity: LocalIdentity) {
  const session: StoredSession = { version: 1, ...identity };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function sessionIsValid(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredSession>;
  return (
    session.version === 1 &&
    (session.kind === "account" || session.kind === "guest") &&
    typeof session.displayName === "string" &&
    session.displayName.length > 0 &&
    typeof session.initials === "string" &&
    (typeof session.email === "string" || session.email === null)
  );
}

export function assessPassword(
  password: string,
  context: { displayName?: string; email?: string } = {},
): PasswordAssessment {
  const normalized = password.toLocaleLowerCase("en-US");
  const nameParts = (context.displayName ?? "")
    .toLocaleLowerCase("en-US")
    .split(/\s+/)
    .filter((part) => part.length >= 3);
  const emailName = normalizeEmail(context.email ?? "").split("@")[0] ?? "";
  const containsPersonalDetail = [...nameParts, emailName]
    .filter((part) => part.length >= 3)
    .some((part) => normalized.includes(part));
  const containsBlockedFragment = BLOCKED_PASSWORD_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
  const containsTripleRepeat = /(.)\1\1/i.test(password);

  const requirements: PasswordRequirement[] = [
    { id: "length", label: "12 or more characters", met: password.length >= 12 },
    {
      id: "case",
      label: "Uppercase and lowercase letters",
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { id: "number", label: "At least one number", met: /\d/.test(password) },
    {
      id: "symbol",
      label: "At least one symbol",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
    {
      id: "personal",
      label: "Does not contain your name or email",
      met: password.length > 0 && !containsPersonalDetail,
    },
    {
      id: "common",
      label: "Avoids common words and repeated characters",
      met: password.length > 0 && !containsBlockedFragment && !containsTripleRepeat,
    },
  ];

  const metCount = requirements.filter((requirement) => requirement.met).length;
  const lengthBonus = password.length >= 16 ? 1 : 0;
  const varietyBonus =
    new Set(password.replace(/\s/g, "").split("")).size >= 10 ? 1 : 0;
  const score = Math.min(5, Math.max(0, metCount - 2 + lengthBonus + varietyBonus));
  const valid = requirements.every((requirement) => requirement.met);
  const label =
    score <= 1
      ? "Too weak"
      : score <= 2
        ? "Developing"
        : score <= 4
          ? "Strong"
          : "Excellent";

  return { score, label, requirements, valid };
}

export async function createLocalAccount(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(input.email);
  const assessment = assessPassword(input.password, { displayName, email });

  if (displayName.length < 2) throw new Error("Enter your full display name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!assessment.valid) {
    throw new Error("Choose a password that meets every strength requirement.");
  }
  if (await readAccount(email)) {
    throw new Error("A local account already exists for this email. Sign in instead.");
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordProof = await derivePasswordProof(
    input.password,
    salt,
    PBKDF2_ITERATIONS,
  );
  const now = new Date().toISOString();
  const account: LocalAccount = {
    email,
    displayName,
    initials: initialsFor(displayName),
    salt: bytesToBase64(salt),
    passwordProof: bytesToBase64(passwordProof),
    iterations: PBKDF2_ITERATIONS,
    createdAt: now,
    lastSignedInAt: now,
    schemaVersion: 1,
  };
  await writeAccount(account);

  const identity: LocalIdentity = {
    kind: "account",
    displayName: account.displayName,
    email: account.email,
    initials: account.initials,
  };
  persistSession(identity);
  return identity;
}

export async function signInLocalAccount(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const account = await readAccount(email);
  if (!account) {
    throw new Error("Email or password is incorrect.");
  }

  const candidate = await derivePasswordProof(
    password,
    base64ToBytes(account.salt),
    account.iterations,
  );
  if (!constantTimeEqual(candidate, base64ToBytes(account.passwordProof))) {
    throw new Error("Email or password is incorrect.");
  }

  const updated = { ...account, lastSignedInAt: new Date().toISOString() };
  await writeAccount(updated);
  const identity: LocalIdentity = {
    kind: "account",
    displayName: account.displayName,
    email: account.email,
    initials: account.initials,
  };
  persistSession(identity);
  return identity;
}

export function startGuestSession() {
  const identity: LocalIdentity = {
    kind: "guest",
    displayName: "Guest operator",
    email: null,
    initials: "GO",
  };
  persistSession(identity);
  return identity;
}

export function restoreLocalSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as unknown;
    if (!sessionIsValid(session)) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      kind: session.kind,
      displayName: session.displayName,
      email: session.email,
      initials: session.initials,
    } satisfies LocalIdentity;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearLocalSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

export const LOCAL_AUTH_SECURITY = {
  databaseName: DATABASE_NAME,
  sessionKey: SESSION_KEY,
  proofAlgorithm: "PBKDF2-SHA-256",
  iterations: PBKDF2_ITERATIONS,
} as const;
