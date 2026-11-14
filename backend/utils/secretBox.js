/** AES-256-GCM for secrets stored in the database (the admin's TOTP secret). */
const crypto = require('crypto');

function key() {
  const base = process.env.TWO_FA_ENC_KEY || process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET (or TWO_FA_ENC_KEY) is required');
  return crypto.createHash('sha256').update(`techneeds:2fa:${base}`).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

function decrypt(box) {
  const [iv, tag, ct] = String(box).split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
