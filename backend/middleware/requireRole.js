const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Mentor = require('../models/Mentor');
const Mentee = require('../models/Mentee');
const { twoFaRequired, ALG } = require('../utils/adminSession');

// requireRole('admin') or requireRole('mentor', 'admin') etc.
exports.requireRole = (...roles) => async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, ALG);
    let user = null;
    if (decoded.role === 'admin') {
      user = await Admin.findById(decoded.id).select('-password -twoFactor');
      if (user) {
        // Session was ended ("sign out everywhere", password change, 2FA reset) or is a pre-upgrade token
        if (decoded.tv !== (user.tokenVersion || 0)) return res.status(401).json({ error: 'Session ended. Please sign in again.' });
        // 2FA was switched on after this session started
        if (twoFaRequired() && !decoded.mfa) return res.status(401).json({ error: 'Two-factor sign-in required. Please sign in again.' });
      }
    } else if (decoded.role === 'mentor') user = await Mentor.findById(decoded.id).select('-password');
    else if (decoded.role === 'mentee') user = await Mentee.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    req.user.role = decoded.role;
    req.auth = decoded; // raw claims (mfa, tv)
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
