/**
 * PEAC Protocol API Server
 * Provides negotiation and dashboard endpoints
 * @license Apache-2.0
 */

const express = require('express');
const path = require('path');
const { negotiationRouter } = require('./negotiation');
const { dashboardRouter } = require('./dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

// CORS (configure for your needs)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: require('../package.json').version,
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/negotiate', negotiationRouter);
app.use('/api/dashboard', dashboardRouter);

// Serve peac.txt if exists
app.get('/peac.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '../peac.txt'), (err) => {
    if (err) {
      res.status(404).send('No peac.txt found');
    }
  });
});

// Error handling middleware
app.use((err, req, res) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      status: 404,
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`PEAC Protocol API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
