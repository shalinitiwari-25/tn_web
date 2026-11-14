const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  mustChangePassword: { type: Boolean, default: false },
  avatar: { type: String, default: '' },
  // Bumped to end every existing session ("sign out everywhere", password change, 2FA reset)
  tokenVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date },
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secret: { type: String },                 // AES-GCM encrypted TOTP secret
    lastUsedStep: { type: Number, default: 0 }, // blocks code replay
    recoveryHashes: { type: [String], default: [] }, // sha256 of one-time recovery codes
  },
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);
