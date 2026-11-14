const assert = require('assert');
const t = require('../utils/totp');
const secret = t.base32Encode(Buffer.from('12345678901234567890'));
assert.strictEqual(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
// RFC 6238 Appendix B (SHA-1), last 6 digits
for (const [sec, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
  assert.strictEqual(t.totp(secret, sec * 1000), code, 'RFC vector ' + sec);
}
assert.deepStrictEqual(t.base32Decode(secret), Buffer.from('12345678901234567890'));
const now = 1111111109 * 1000, step = t.stepAt(now);
assert.strictEqual(t.verify(secret, '081804', { nowMs: now }), step);
assert.strictEqual(t.verify(secret, '081 804', { nowMs: now }), step);          // spaces ok
assert.strictEqual(t.verify(secret, '081804', { nowMs: now + 29000 }), step);   // within window
assert.strictEqual(t.verify(secret, '081804', { nowMs: now + 120000 }), null);  // too old
assert.strictEqual(t.verify(secret, '081804', { nowMs: now, lastUsedStep: step }), null); // replay
assert.strictEqual(t.verify(secret, '12345', { nowMs: now }), null);
assert.strictEqual(t.verify(secret, 'abcdef', { nowMs: now }), null);
const box = require('../utils/secretBox');
process.env.JWT_SECRET = 'x'.repeat(40);
const enc = box.encrypt(secret); assert.notStrictEqual(enc, secret); assert.strictEqual(box.decrypt(enc), secret);
assert.throws(() => box.decrypt(enc.slice(0, -2) + 'AA'));
const g = t.generateSecret(); assert.strictEqual(t.base32Decode(g).length, 20);
console.log('TOTP TESTS PASSED');
