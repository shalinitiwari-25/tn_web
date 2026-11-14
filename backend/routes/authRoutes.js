const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Mentor = require('../models/Mentor');
const Mentee = require('../models/Mentee');
const { requireRole } = require('../middleware/requireRole');
const guard = require('../utils/loginGuard');
const { audit } = require('../utils/audit');
const { twoFaRequired, issueSession, issueChallenge, readChallenge } = require('../utils/adminSession');
const { verifySecondFactor } = require('../utils/adminTwoFactor');
const router = express.Router();

// Compared against when the account does not exist, so response time doesn't reveal which emails are real
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const ADMIN_MIN_PASSWORD = 12;

function tooMany(res, ms) {
  res.set('Retry-After', String(Math.ceil(ms / 1000)));
  return res.status(429).json({ error: `Too many failed attempts. Try again in ${guard.minutes(ms)} minute${guard.minutes(ms) > 1 ? 's' : ''}.` });
}

const adminUserPayload = (a) => ({
  id: a._id, name: a.name, email: a.email, role: 'admin',
  mustChangePassword: a.mustChangePassword || false, avatar: a.avatar || '',
});

// POST /api/auth/login
// Body: { email, password, role }   role: mentor | mentee
// Admins do NOT sign in here. See /api/auth/admin/login.
// For mentee: email field can also be an enrollment number (starts with TN)
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || !role) {
      return res.status(400).json({ error: 'email, password and role are required' });
    }
    if (role !== 'mentor' && role !== 'mentee') {
      return res.status(400).json({ error: 'Invalid role. Must be mentor or mentee.' });
    }

    const identity = email.trim();
    const keys = [guard.accountKey(role, identity), guard.ipKey(req.ip)];
    const wait = await guard.retryAfterMs(keys);
    if (wait > 0) return tooMany(res, wait);

    let user = null;
    if (role === 'mentor') {
      user = await Mentor.findOne({ email: identity.toLowerCase() });
    } else if (/^TN\d{2}-\d+$/i.test(identity)) {
      user = await Mentee.findOne({ enrollmentNumber: identity.toUpperCase() });
    } else {
      user = await Mentee.findOne({ email: identity.toLowerCase() });
    }

    const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !isMatch) {
      await guard.recordFailure(keys);
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    await guard.clear(keys[0].key);

    const payload = { id: user._id, role: user.role || role, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || role,
        mustChangePassword: user.mustChangePassword || false,
        avatar: user.avatar || ''
      },
      mustChangePassword: user.mustChangePassword || false
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/admin/login   Body: { email, password }
// Step 1 of admin sign-in. With 2FA on (default) this returns { step: 'otp', challenge } and no session.
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const identity = email.trim().toLowerCase();
    const keys = [guard.accountKey('admin', identity), guard.ipKey(req.ip)];
    const wait = await guard.retryAfterMs(keys);
    if (wait > 0) {
      await audit(req, 'admin.login.locked', { actor: { label: identity }, success: false });
      return tooMany(res, wait);
    }

    const admin = await Admin.findOne({ email: identity });
    const isMatch = await bcrypt.compare(password, admin ? admin.password : DUMMY_HASH);
    if (!admin || !isMatch) {
      await guard.recordFailure(keys);
      await audit(req, 'admin.login.failed', { actor: { label: identity }, success: false });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const actor = { id: String(admin._id), role: 'admin', label: admin.email };

    if (!twoFaRequired()) {
      await guard.clear(keys[0].key);
      await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
      await audit(req, 'admin.login.success', { actor, meta: { mfa: false } });
      return res.json({ token: issueSession(admin, { mfa: false }), user: adminUserPayload(admin), mustChangePassword: admin.mustChangePassword || false });
    }

    if (!admin.twoFactor || !admin.twoFactor.enabled) {
      await audit(req, 'admin.login.no2fa', { actor, success: false });
      return res.status(403).json({ error: 'Two-factor sign-in is required but not set up for this account. Run "npm run admin:2fa" on the server.' });
    }
    // The failure counter is NOT cleared here: guessing the 6-digit code counts against the same lockout.
    res.json({ step: 'otp', challenge: issueChallenge(admin) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/admin/verify-2fa   Body: { challenge, code }   code = 6-digit app code or a recovery code
router.post('/admin/verify-2fa', async (req, res) => {
  try {
    const { challenge, code } = req.body || {};
    const claims = readChallenge(challenge);
    if (!claims || typeof code !== 'string') return res.status(401).json({ error: 'Sign-in expired. Please start again.' });

    const admin = await Admin.findById(claims.sub);
    if (!admin || (admin.tokenVersion || 0) !== claims.tv) return res.status(401).json({ error: 'Sign-in expired. Please start again.' });

    const keys = [guard.accountKey('admin', admin.email), guard.ipKey(req.ip)];
    const wait = await guard.retryAfterMs(keys);
    const actor = { id: String(admin._id), role: 'admin', label: admin.email };
    if (wait > 0) {
      await audit(req, 'admin.login.locked', { actor, success: false });
      return tooMany(res, wait);
    }

    const result = await verifySecondFactor(Admin, admin, code);
    if (!result.ok) {
      await guard.recordFailure(keys);
      await audit(req, 'admin.2fa.failed', { actor, success: false });
      return res.status(401).json({ error: 'Invalid code' });
    }

    await guard.clear(keys[0].key);
    await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
    await audit(req, 'admin.login.success', { actor, meta: { mfa: true, method: result.method } });
    res.json({
      token: issueSession(admin, { mfa: true }),
      user: adminUserPayload(admin),
      mustChangePassword: admin.mustChangePassword || false,
      ...(result.method === 'recovery' ? { recoveryCodesLeft: result.recoveryLeft } : {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password
// Requires auth (any role). Body: { currentPassword, newPassword }
// If user.mustChangePassword is true, currentPassword check is skipped (first-login flow).
// For admins, changing the password ends all other admin sessions and returns a fresh token.
router.post('/change-password', requireRole('admin', 'mentor', 'mentee'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'newPassword is required' });
    }
    const userRole = req.user.role;
    const minLen = userRole === 'admin' ? ADMIN_MIN_PASSWORD : 8;
    if (newPassword.length < minLen) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters` });
    }

    // Fetch user WITH password for verification
    let userWithPassword = null;
    const userId = req.user._id;

    if (userRole === 'admin') {
      userWithPassword = await Admin.findById(userId);
    } else if (userRole === 'mentor') {
      userWithPassword = await Mentor.findById(userId);
    } else if (userRole === 'mentee') {
      userWithPassword = await Mentee.findById(userId);
    }

    if (!userWithPassword) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Skip current password check on first-login forced change
    if (!userWithPassword.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'currentPassword is required' });
      }
      // A stolen session must not be able to guess the current password
      const keys = [guard.accountKey('pw-' + userRole, String(userId))];
      const wait = await guard.retryAfterMs(keys);
      if (wait > 0) return tooMany(res, wait);
      const isMatch = await bcrypt.compare(currentPassword, userWithPassword.password);
      if (!isMatch) {
        await guard.recordFailure(keys);
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    userWithPassword.password = await bcrypt.hash(newPassword, 10);
    userWithPassword.mustChangePassword = false;
    if (userRole === 'admin') userWithPassword.tokenVersion = (userWithPassword.tokenVersion || 0) + 1;
    await userWithPassword.save();

    if (userRole === 'admin') {
      await audit(req, 'admin.password.changed');
      return res.json({ message: 'Password changed', token: issueSession(userWithPassword, { mfa: !!req.auth.mfa }) });
    }
    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
