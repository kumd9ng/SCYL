const EMAIL_KEY = 'scyl.last-email.v1';
const SETUP_KEY = 'scyl.password-setup.v1';
const SETUP_TTL = 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validEmail = value => typeof value === 'string' && value.length <= 254 && EMAIL.test(value) ? value : '';
const validId = value => typeof value === 'string' && UUID.test(value);

function browserStorage(name) {
  try { return globalThis.window?.[name] ?? null; } catch { return null; }
}

function selectedStorage(options, name, browserName = name) {
  return Object.hasOwn(options, name) ? options[name] : browserStorage(browserName);
}

function read(storage, key) {
  try { const value = storage?.getItem(key); return typeof value === 'string' ? value : null; }
  catch { return null; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, value); } catch {}
}

function removeUnchanged(storage, key, original) {
  try {
    if (!storage || storage.getItem(key) !== original) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch { return false; }
}

/** An input preference only. The caller must have verified this address. */
export function rememberVerifiedEmail(email, options = {}) {
  const address = validEmail(email);
  if (!address) return '';
  write(selectedStorage(options, 'localStorage'), EMAIL_KEY, address);
  write(selectedStorage(options, 'sessionStorage'), EMAIL_KEY, address);
  return address;
}

export function readRememberedEmail(options = {}) {
  return validEmail(read(selectedStorage(options, 'localStorage'), EMAIL_KEY))
    || validEmail(read(selectedStorage(options, 'sessionStorage'), EMAIL_KEY));
}

function currentTime(options) {
  try {
    const value = (options.now ?? Date.now)();
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch { return null; }
}

function attemptId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  // This identifies a UI attempt, never a credential or authorization token.
  const bytes = new Uint8Array(16);
  try { globalThis.crypto.getRandomValues(bytes); }
  catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseSetup(raw) {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 4 || !validId(value.id) || !validId(value.userId)
      || !validEmail(value.email) || !Number.isSafeInteger(value.startedAt) || value.startedAt < 0) return null;
    return { id: value.id, userId: value.userId, email: value.email, startedAt: value.startedAt };
  } catch { return null; }
}

/**
 * Preserve only the UI step across reloads. This record does not prove login:
 * the caller must restore and server-verify the same user before any action.
 * Failed storage still returns the attempt for the current page's flow.
 */
export function beginPasswordSetup(user, options = {}) {
  const startedAt = currentTime(options);
  if (!user || typeof user !== 'object' || user.is_anonymous === true
    || !validId(user.id) || !validEmail(user.email) || startedAt === null) return null;
  const record = { id: attemptId(), userId: user.id, email: user.email, startedAt };
  write(selectedStorage(options, 'storage', 'sessionStorage'), SETUP_KEY, JSON.stringify(record));
  return { ...record };
}

export function readPasswordSetup(options = {}) {
  const storage = selectedStorage(options, 'storage', 'sessionStorage');
  const raw = read(storage, SETUP_KEY);
  if (raw === null) return null;
  const record = parseSetup(raw), now = currentTime(options);
  if (!record || now === null || record.startedAt > now || now - record.startedAt >= SETUP_TTL) {
    removeUnchanged(storage, SETUP_KEY, raw);
    return null;
  }
  return { ...record };
}

/** Never let an old response clear a newer attempt, including for one user. */
export function finishPasswordSetup(userId, id, options = {}) {
  if (!validId(userId) || !validId(id)) return false;
  const storage = selectedStorage(options, 'storage', 'sessionStorage');
  const raw = read(storage, SETUP_KEY), record = parseSetup(raw);
  if (!record || record.userId !== userId || record.id !== id) return false;
  return removeUnchanged(storage, SETUP_KEY, raw);
}
