const jwt = require('jsonwebtoken');

const ALG = { algorithms: ['HS256'] };

/** ADMIN_2FA_REQUIRED defaults to ON. Set it to "false" only for demos. */
const twoFaRequired = () => String(process.env.ADMIN_2FA_REQUIRED ?? 'true').trim().toLowerCase() !== 'false';

/** ADMIN_SESSION_HOURS, default 1, capped at 24. */
function sessionSeconds() {
  const h = parseFloat(process.env.ADMIN_SESSION_HOURS);
  const hours = Number.isFinite(h) && h > 0 ? Math.min(h, 24) : 1;
  return Math.round(hours * 3600);
}

/** Full admin session. `tv` is checked against Admin.tokenVersion so "sign out everywhere" works. */
function issueSession(admin, { mfa }) {
  return jwt.sign(
    { id: admin._id, role: 'admin', name: admin.name, tv: admin.tokenVersion || 0, mfa: !!mfa },
    process.env.JWT_SECRET,
    { expiresIn: sessionSeconds(), algorithm: 'HS256' }
  );
}

/** Short-lived proof that the password step passed. It has no `role`, so it can never open an API route. */
function issueChallenge(admin) {
  return jwt.sign({ purpose: 'admin-2fa', sub: String(admin._id), tv: admin.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
}

function readChallenge(token) {
  try {
    const d = jwt.verify(String(token || ''), process.env.JWT_SECRET, ALG);
    return d.purpose === 'admin-2fa' ? d : null;
  } catch { return null; }
}

module.exports = { twoFaRequired, sessionSeconds, issueSession, issueChallenge, readChallenge, ALG };
