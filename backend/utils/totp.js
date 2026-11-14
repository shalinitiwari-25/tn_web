/**
 * TOTP (RFC 6238) with HMAC-SHA1, 6 digits, 30 s steps: what Google Authenticator, Authy,
 * Microsoft Authenticator and 1Password all use. Implemented with Node's crypto so there is
 * no extra dependency to audit.
 */
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).replace(/[\s=]+/g, '').toUpperCase();
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits
}

function hotp(secretBuf, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

const stepAt = (nowMs) => Math.floor(nowMs / 1000 / STEP_SECONDS);

function totp(secretBase32, nowMs = Date.now()) {
  return hotp(base32Decode(secretBase32), stepAt(nowMs));
}

/**
 * Returns the matched time step (a number) or null.
 * Accepts the previous/current/next step (clock drift) but never a step <= lastUsedStep,
 * so a code that was already used cannot be replayed.
 */
function verify(secretBase32, code, { nowMs = Date.now(), window = 1, lastUsedStep = 0 } = {}) {
  const given = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(nowMs);
  let matched = null;
  for (let s = current - window; s <= current + window; s++) {
    if (s <= lastUsedStep) continue;
    const expected = hotp(secret, s);
    // compare every candidate in constant time, keep the latest match
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) matched = s;
  }
  return matched;
}

function otpauthUri({ secret, account, issuer = 'TechNeeds' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, base32Encode, base32Decode, hotp, totp, verify, otpauthUri, stepAt };
