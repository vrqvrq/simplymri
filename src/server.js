const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { auditMiddleware } = require('./middleware/audit');

const app = express();
const PORT = process.env.PORT || 3000;

// Generate a random session secret if not provided (log warning)
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('WARNING: SESSION_SECRET not set. Using random secret — sessions will not persist across restarts. Set SESSION_SECRET env var in production.');
  return crypto.randomBytes(32).toString('hex');
})();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts used by EJS templates
}));

// Rate limiting — general API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(generalLimiter);

// Rate limiting — auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(auditMiddleware);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Apply auth rate limiter to login routes
app.use('/login', authLimiter);
app.use('/portal/login', authLimiter);

// Routes
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/patients', require('./routes/patients'));
app.use('/orders', require('./routes/orders'));
app.use('/samples', require('./routes/samples'));
app.use('/results', require('./routes/results'));
app.use('/billing', require('./routes/billing'));
app.use('/reports', require('./routes/reports'));
app.use('/settings', require('./routes/settings'));
app.use('/api', require('./routes/api'));
app.use('/export', require('./routes/export'));
app.use('/codes', require('./routes/barcodes'));
app.use('/physicians', require('./routes/physicians'));
app.use('/worklist', require('./routes/worklist'));
app.use('/panels', require('./routes/panels'));
app.use('/tests', require('./routes/tests'));
app.use('/mri', require('./routes/mri'));
app.use('/portal', require('./routes/portal'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong');
});

app.listen(PORT, () => {
  console.log(`SimplyDiagnostic LIS running at http://localhost:${PORT}`);
});
