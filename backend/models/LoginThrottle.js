const mongoose = require('mongoose');

// Failed-login counters used by utils/loginGuard.js. Documents delete themselves via the TTL index.
const LoginThrottleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  attempts: { type: [Date], default: [] },
  lockedUntil: { type: Date },
  expireAt: { type: Date, required: true },
});
LoginThrottleSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginThrottle', LoginThrottleSchema);
