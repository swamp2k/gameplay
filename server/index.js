'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { runScan } = require('./services/scanner');

// Ensure cache directories exist
fs.mkdirSync(config.thumbnailDir, { recursive: true });
fs.mkdirSync(config.hlsDir, { recursive: true });
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const app = express();

app.use(express.json());

// API routes
app.use('/api/media', require('./routes/media'));
app.use('/stream',    require('./routes/stream'));
app.use('/download',  require('./routes/download'));
app.use('/thumbnail', require('./routes/thumbnail'));
app.use('/transcode', require('./routes/transcode'));

// Serve built frontend in production
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Frontend not built yet. Run: npm run build');
  });
}

// Error handler
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`[server] Listening on http://0.0.0.0:${config.port}`);
  console.log(`[server] Media paths: ${config.mediaPaths.join(', ')}`);

  // Initial scan
  runScan().catch(err => console.error('[scanner] Initial scan error:', err));

  // Periodic rescan
  const intervalMs = config.scanner.rescanIntervalMinutes * 60 * 1000;
  setInterval(() => {
    runScan().catch(err => console.error('[scanner] Periodic scan error:', err));
  }, intervalMs);
});
