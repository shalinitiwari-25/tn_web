/**
 * Turn on (or reset) two-factor sign-in for an admin. Run on the server:
 *   npm run admin:2fa -- admin@example.com
 * Prints a QR code and one-time recovery codes. Ends the admin's existing sessions and clears any lockout.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const LoginThrottle = require('../models/LoginThrottle');
const AuditLog = require('../models/AuditLog');
const { enroll, printEnrollment } = require('../utils/adminTwoFactor');

(async () => {
  const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) { console.error('Usage: npm run admin:2fa -- admin@example.com'); process.exit(1); }
  if (!process.env.JWT_SECRET) { console.error('JWT_SECRET must be set in .env'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await Admin.findOne({ email });
  if (!admin) { console.error(`No admin with email ${email}`); process.exit(1); }
  const result = await enroll(Admin, admin);
  await LoginThrottle.deleteMany({ key: `acct:admin:${email}` });
  await AuditLog.create({ action: 'admin.2fa.enrolled', actorLabel: 'server-cli', targetType: 'admin', targetLabel: email });
  await printEnrollment({ email, ...result });
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
