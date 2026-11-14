require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const app = express();
const cors = require('cors');

const isProd = process.env.NODE_ENV === 'production';

// A weak or placeholder JWT secret makes every token forgeable
const secret = process.env.JWT_SECRET || '';
if (secret.length < 32 || /change_me/i.test(secret)) {
  console.warn('[security] JWT_SECRET is missing, short (<32 chars) or still the example value. Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  if (isProd) { console.error('Refusing to start in production with a weak JWT_SECRET.'); process.exit(1); }
}

// Connect to MongoDB
connectDB();

// Behind a hosting proxy (Render, Railway, Vercel...) req.ip is the proxy unless this is set.
// TRUST_PROXY = number of proxy hops (default 1 in production, off locally).
const hops = process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : (isProd ? 1 : 0);
if (hops > 0) app.set('trust proxy', hops);
app.disable('x-powered-by');

// Middleware
const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
if (!origins.length && isProd) console.warn('[security] CORS_ORIGINS is not set: any website can call this API from a browser. Set it to your frontend URL.');
app.use(cors(origins.length ? { origin: origins } : undefined));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
  next();
});
app.use(express.json({ limit: '200kb' }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));         // Unified auth (login, change-password)
app.use('/api/admin', require('./routes/adminRoutes'));       // Admin panel routes
app.use('/api/mentor-requests', require('./routes/mentorRequestRoutes')); // Public mentor request form
app.use('/api/mentor', require('./routes/mentorRoutes'));      // Mentor panel routes
app.use('/api/public', require('./routes/publicRoutes'));      // Cohort listing + leaderboard (no auth)
app.use('/api/m', require('./routes/menteeRoutes'));          // Mentee portal routes
app.use('/api/mentor-feedback', require('./routes/mentorFeedbackRoutes')); // Mentor feedback
app.use('/api/chat', require('./routes/chatRoutes'));          // Chat (mentors + mentees only, never admins)

app.get('/', (req, res) => res.send('Mentorship API Running'));

// Any error thrown in an async route comes here as JSON (Express 5 forwards rejected promises)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// PORT: default 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
