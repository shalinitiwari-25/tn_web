/**
 * End-to-end test of the admin security layers over real HTTP.
 * Database models are replaced by tiny in-memory fakes, so no MongoDB is needed.
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.ADMIN_2FA_REQUIRED = 'true';
process.env.ADMIN_SESSION_HOURS = '1';

// ───────── in-memory model fakes ─────────
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = getPath(doc, k);
    if (cond && typeof cond === 'object' && '$lt' in cond) return typeof v === 'number' && v < cond.$lt;
    if (Array.isArray(v)) return v.includes(cond);
    return v === cond;
  });
}
function query(value) {
  const p = Promise.resolve(value);
  p.select = (spec) => {
    if (!value) return Promise.resolve(null);
    const c = { ...value };
    spec.split(/\s+/).forEach((f) => delete c[f.replace('-', '')]);
    return Promise.resolve(c);
  };
  p.lean = () => p;
  return p;
}
function makeModel() {
  let seq = 1;
  const M = {
    docs: [],
    add(d) { const doc = { _id: 'id' + seq++, ...d }; doc.save = async () => doc; M.docs.push(doc); return doc; },
    findOne: (f) => query(M.docs.find((d) => matches(d, f)) || null),
    findById: (id) => query(M.docs.find((d) => d._id === String(id)) || null),
    create: async (d) => M.add(d),
    countDocuments: async () => M.docs.length,
    find() {
      let rows = [...M.docs];
      const c = { sort: () => { rows.reverse(); return c; }, skip: (n) => { rows = rows.slice(n); return c; }, limit: (n) => { rows = rows.slice(0, n); return c; }, lean: () => Promise.resolve(rows) };
      return c;
    },
    async updateOne(filter, u) {
      const doc = M.docs.find((d) => matches(d, filter));
      if (!doc) return { modifiedCount: 0 };
      Object.entries(u.$set || {}).forEach(([k, v]) => setPath(doc, k, v));
      Object.entries(u.$inc || {}).forEach(([k, v]) => setPath(doc, k, (getPath(doc, k) || 0) + v));
      Object.entries(u.$pull || {}).forEach(([k, v]) => setPath(doc, k, getPath(doc, k).filter((x) => x !== v)));
      return { modifiedCount: 1 };
    },
  };
  return M;
}
const Admin = makeModel(); const Mentor = makeModel(); const Mentee = makeModel(); const AuditLog = makeModel();
[['Admin', Admin], ['Mentor', Mentor], ['Mentee', Mentee], ['AuditLog', AuditLog]].forEach(([n, m]) => {
  const f = require.resolve(`../models/${n}`);
  require.cache[f] = { id: f, filename: f, loaded: true, exports: m };
});

// in-memory lockout store
function memStore() {
  const m = new Map();
  return {
    get: async (k) => m.get(k) || null,
    push: async (k, now, expireAt) => { const d = m.get(k) || { attempts: [] }; d.attempts.push(new Date(now)); d.expireAt = expireAt; m.set(k, d); return d; },
    lock: async (k, until) => { const d = m.get(k); d.lockedUntil = until; d.attempts = []; },
    clear: async (k) => { m.delete(k); },
  };
}
const guard = require('../utils/loginGuard');
const totp = require('../utils/totp');
const box = require('../utils/secretBox');
const { enroll } = require('../utils/adminTwoFactor');

const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/authRoutes'));
app.use('/api/admin', require('../routes/adminRoutes'));

let base;
const call = async (method, url, body, token) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
};
const codeAt = (secret, offset = 0) => totp.totp(secret, Date.now() + offset * 30000);
const wrong = (c) => String((parseInt(c, 10) + 1) % 1e6).padStart(6, '0');

(async () => {
  const server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const PASSWORD = 'CorrectHorse-Battery9';
  const admin = Admin.add({ name: 'Root', email: 'admin@t.in', password: await bcrypt.hash(PASSWORD, 4), role: 'admin', tokenVersion: 0, twoFactor: { enabled: false, recoveryHashes: [] } });
  Mentee.add({ name: 'Aarav', email: 'a@t.in', enrollmentNumber: 'TN26-0001', password: await bcrypt.hash('Pass@1234', 4) });
  const reset = () => guard.setStore(memStore());
  reset();

  // 1. the public login no longer knows about admins
  let r = await call('POST', '/api/auth/login', { email: 'admin@t.in', password: PASSWORD, role: 'admin' });
  assert.strictEqual(r.status, 400); assert.ok(!r.body.token);

  // 2. password right but 2FA not set up -> refused, no session
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  assert.strictEqual(r.status, 403); assert.ok(!r.body.token);

  // 3. enrol (server-side), then step 1 only returns a challenge
  let en = await enroll(Admin, admin);
  assert.strictEqual(en.codes.length, 8);
  assert.ok(!JSON.stringify(Admin.docs[0].twoFactor).includes(en.secret), 'secret must be stored encrypted');
  assert.strictEqual(box.decrypt(Admin.docs[0].twoFactor.secret), en.secret);
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.step, 'otp'); assert.ok(!r.body.token);
  const challenge = r.body.challenge;

  // 4. the challenge is not a session
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, challenge)).status, 401);

  // 5. wrong code, right code, replay
  const good = codeAt(en.secret, -1);
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge, code: wrong(good) })).status, 401);
  r = await call('POST', '/api/auth/admin/verify-2fa', { challenge, code: good });
  assert.strictEqual(r.status, 200); assert.ok(r.body.token);
  const session = r.body.token;
  const claims = jwt.decode(session);
  assert.strictEqual(claims.exp - claims.iat, 3600, 'admin session is 1 hour');
  assert.strictEqual(claims.mfa, true);
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge, code: good })).status, 401, 'same code cannot be replayed');
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge: 'junk', code: good })).status, 401);
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge: jwt.sign({ purpose: 'other', sub: admin._id }, process.env.JWT_SECRET), code: codeAt(en.secret) })).status, 401);

  // 6. session works; audit log has entries and no secrets
  r = await call('GET', '/api/admin/audit-log', null, session);
  assert.strictEqual(r.status, 200);
  const actions = r.body.entries.map((e) => e.action);
  assert.ok(actions.includes('admin.login.success') && actions.includes('admin.2fa.failed'));
  const dump = JSON.stringify(AuditLog.docs);
  [PASSWORD, en.secret, good].forEach((s) => assert.ok(!dump.includes(s), 'audit log must not contain secrets'));

  // 7. recovery code works exactly once
  reset();
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  r = await call('POST', '/api/auth/admin/verify-2fa', { challenge: r.body.challenge, code: en.codes[0].toUpperCase() });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.recoveryCodesLeft, 7);
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge: r.body.challenge, code: en.codes[0] })).status, 401);

  // 8. sign out everywhere kills sessions
  en = await enroll(Admin, admin);
  let s = (await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD }));
  s = (await call('POST', '/api/auth/admin/verify-2fa', { challenge: s.body.challenge, code: codeAt(en.secret) })).body.token;
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, s)).status, 200);
  assert.strictEqual((await call('POST', '/api/admin/logout-all', null, s)).status, 200);
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, s)).status, 401);

  // 9. old 7-day style / no-mfa / alg:none tokens are refused while 2FA is on
  const legacy = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, legacy)).status, 401);
  const nomfa = jwt.sign({ id: admin._id, role: 'admin', tv: admin.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, nomfa)).status, 401);
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ id: admin._id, role: 'admin', tv: admin.tokenVersion, mfa: true })).toString('base64url') + '.';
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, none)).status, 401);

  // 10. lockout: 5 wrong passwords lock the account, even for the right password; unknown emails behave the same
  reset();
  for (let i = 0; i < 5; i++) assert.strictEqual((await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: 'wrong-' + i })).status, 401);
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  assert.strictEqual(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 800); assert.ok(!r.body.step);
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/admin/login', { email: 'ghost@t.in', password: 'x' + i });
  assert.strictEqual((await call('POST', '/api/auth/admin/login', { email: 'ghost@t.in', password: 'x' })).status, 429, 'unknown accounts lock too, so nothing leaks');
  assert.strictEqual(r.body.error, (await call('POST', '/api/auth/admin/login', { email: 'ghost@t.in', password: 'x' })).body.error);
  assert.ok(Admin.docs[0] && AuditLog.docs.some((e) => e.action === 'admin.login.locked'));

  // 11. guessing the 6-digit code counts toward the same lockout
  reset();
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/admin/verify-2fa', { challenge: r.body.challenge, code: String(100000 + i) });
  assert.strictEqual((await call('POST', '/api/auth/admin/verify-2fa', { challenge: r.body.challenge, code: codeAt(en.secret) })).status, 429);

  // 12. mentees get the same protection, and a good login clears the counter
  reset();
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/login', { email: 'TN26-0001', password: 'bad' + i, role: 'mentee' });
  assert.strictEqual((await call('POST', '/api/auth/login', { email: 'TN26-0001', password: 'Pass@1234', role: 'mentee' })).status, 200);
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { email: 'TN26-0001', password: 'bad' + i, role: 'mentee' });
  assert.strictEqual((await call('POST', '/api/auth/login', { email: 'TN26-0001', password: 'Pass@1234', role: 'mentee' })).status, 429);

  // 13. changing the admin password: min length, ends other sessions, returns a fresh token
  reset();
  en = await enroll(Admin, admin);
  s = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: PASSWORD });
  s = (await call('POST', '/api/auth/admin/verify-2fa', { challenge: s.body.challenge, code: codeAt(en.secret) })).body.token;
  assert.strictEqual((await call('POST', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' }, s)).status, 400);
  assert.strictEqual((await call('POST', '/api/auth/change-password', { currentPassword: 'nope-nope-nope', newPassword: 'A-brand-new-passphrase-1' }, s)).status, 400);
  r = await call('POST', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'A-brand-new-passphrase-1' }, s);
  assert.strictEqual(r.status, 200); assert.ok(r.body.token);
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, s)).status, 401, 'old session ended');
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, r.body.token)).status, 200, 'fresh token works');

  // 14. 2FA switched off (demo mode): password alone gives a session, flagged mfa:false, and it stops working if 2FA is turned back on
  process.env.ADMIN_2FA_REQUIRED = 'false';
  reset();
  r = await call('POST', '/api/auth/admin/login', { email: 'admin@t.in', password: 'A-brand-new-passphrase-1' });
  assert.strictEqual(r.status, 200); assert.strictEqual(jwt.decode(r.body.token).mfa, false);
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, r.body.token)).status, 200);
  process.env.ADMIN_2FA_REQUIRED = 'true';
  assert.strictEqual((await call('GET', '/api/admin/audit-log', null, r.body.token)).status, 401);

  server.close();
  console.log('ADMIN SECURITY TESTS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
