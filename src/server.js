const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'simplymri-lis-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong');
});

app.listen(PORT, () => {
  console.log(`SimplyMRI LIS running at http://localhost:${PORT}`);
});
