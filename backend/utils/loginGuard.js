/**
 * Brute-force protection for every login.
 *
 * - Account key: 5 failures in 15 minutes locks that account/identifier for 15 minutes.
 *   The lock applies whether or not the account exists, so the response never reveals which
 *   emails are real.
 * - IP key: a much higher ceiling per IP, to slow down someone spraying many accounts.
 * State lives in MongoDB (LoginThrottle, TTL-expired), so a restart does not reset a lockout.
 */
const MAX_ACCOUNT = 5;
const MAX_IP = 50;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const recentCount = (attempts, now) => (attempts || []).filter((t) => now - new Date(t).getTime() < WINDOW_MS).length;
const lockMs = (doc, now) => {
  if (!doc || !doc.lockedUntil) return 0;
  const left = new Date(doc.lockedUntil).getTime() - now;
  return left > 0 ? left : 0;
};

function mongoStore() {
  const T = () => require('../models/LoginThrottle'); // lazy: unit tests inject their own store
  return {
    get: (key) => T().findOne({ key }).lean(),
    push: (key, now, expireAt) => T().findOneAndUpdate(
      { key },
      { $push: { attempts: { $each: [new Date(now)], $slice: -100 } }, $set: { expireAt } },
      { upsert: true, new: true }
    ).lean(),
    lock: (key, until) => T().updateOne({ key }, { $set: { lockedUntil: until, attempts: [] } }),
    clear: (key) => T().deleteOne({ key }),
  };
}

let store = mongoStore();
const setStore = (s) => { store = s; };

const accountKey = (scope, identifier) => ({ key: `acct:${scope}:${String(identifier).trim().toLowerCase().slice(0, 120)}`, max: MAX_ACCOUNT });
const ipKey = (ip) => ({ key: `ip:${ip || 'unknown'}`, max: MAX_IP });

/** Milliseconds the caller must wait, or 0 when allowed. */
async function retryAfterMs(keys, now = Date.now()) {
  let worst = 0;
  for (const { key } of keys) worst = Math.max(worst, lockMs(await store.get(key), now));
  return worst;
}

async function recordFailure(keys, now = Date.now()) {
  for (const { key, max } of keys) {
    const doc = await store.push(key, now, new Date(now + WINDOW_MS + LOCK_MS));
    if (recentCount(doc.attempts, now) >= max && lockMs(doc, now) === 0) {
      await store.lock(key, new Date(now + LOCK_MS));
    }
  }
}

const clear = (key) => store.clear(key);
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));

module.exports = { retryAfterMs, recordFailure, clear, accountKey, ipKey, setStore, minutes, MAX_ACCOUNT, MAX_IP, WINDOW_MS, LOCK_MS };
