const crypto = require('crypto');
const totp = require('./totp');
const box = require('./secretBox');

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const normalizeRecovery = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hashRecovery = (s) => crypto.createHash('sha256').update(normalizeRecovery(s)).digest('hex');
const looksLikeRecovery = (s) => normalizeRecovery(s).length === 10 && !/^\d{6}$/.test(String(s).replace(/\s+/g, ''));

function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const raw = Array.from(crypto.randomBytes(10), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/**
 * Turn 2FA on (or reset it) for an admin. Run from the server (seed or `npm run admin:2fa`),
 * never over HTTP, so a leaked password alone can never enrol an attacker's phone.
 * Returns the secret, otpauth URI and the one-time recovery codes. Shown once, never stored in clear.
 */
async function enroll(Admin, admin) {
  const secret = totp.generateSecret();
  const codes = newRecoveryCodes();
  await Admin.updateOne({ _id: admin._id }, {
    $set: {
      'twoFactor.enabled': true,
      'twoFactor.secret': box.encrypt(secret),
      'twoFactor.lastUsedStep': 0,
      'twoFactor.recoveryHashes': codes.map(hashRecovery),
    },
    $inc: { tokenVersion: 1 }, // existing sessions end
  });
  return { secret, uri: totp.otpauthUri({ secret, account: admin.email }), codes };
}

/**
 * Check the second factor: a 6-digit authenticator code or a one-time recovery code.
 * Both are consumed with an atomic conditional update, so the same code can't be used twice
 * even by two simultaneous requests.
 */
async function verifySecondFactor(Admin, admin, input, nowMs = Date.now()) {
  const tf = admin.twoFactor || {};
  if (!tf.enabled || !tf.secret) return { ok: false };

  if (looksLikeRecovery(input)) {
    const h = hashRecovery(input);
    const before = (tf.recoveryHashes || []).length;
    if (!(tf.recoveryHashes || []).includes(h)) return { ok: false };
    const r = await Admin.updateOne({ _id: admin._id, 'twoFactor.recoveryHashes': h }, { $pull: { 'twoFactor.recoveryHashes': h } });
    return r.modifiedCount === 1 ? { ok: true, method: 'recovery', recoveryLeft: before - 1 } : { ok: false };
  }

  const step = totp.verify(box.decrypt(tf.secret), input, { nowMs, lastUsedStep: tf.lastUsedStep || 0 });
  if (step === null) return { ok: false };
  const r = await Admin.updateOne({ _id: admin._id, 'twoFactor.lastUsedStep': { $lt: step } }, { $set: { 'twoFactor.lastUsedStep': step } });
  return r.modifiedCount === 1 ? { ok: true, method: 'totp' } : { ok: false };
}

async function printEnrollment({ email, secret, uri, codes }) {
  const QRCode = require('qrcode');
  console.log(`\nTwo-factor setup for ${email}`);
  console.log('Scan this QR code with Google Authenticator / Authy / Microsoft Authenticator:\n');
  console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
  console.log(`Or enter this key manually: ${secret}`);
  console.log('\nRecovery codes (each works once; store them somewhere safe, they will not be shown again):');
  codes.forEach((c) => console.log(`  ${c}`));
  console.log('');
}

module.exports = { enroll, verifySecondFactor, printEnrollment, newRecoveryCodes, hashRecovery, looksLikeRecovery };
