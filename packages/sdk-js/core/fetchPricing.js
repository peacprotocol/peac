const fetch = require('node-fetch');
const yaml = require('js-yaml');
const fs = require('fs');

// Helper to check allowHttp override in .peacrc (optional)
function getAllowHttpOverride() {
  try {
    const raw = fs.readFileSync('.peacrc', 'utf8');
    const conf = JSON.parse(raw);
    return conf.allowHttp === true;
  } catch {
    return false;
  }
}

async function fetchPricing(origin) {
  // Enforce HTTPS unless .peacrc allows HTTP
  const allowHttp = getAllowHttpOverride();
  if (!allowHttp && origin.startsWith('http://')) {
    throw new Error('PEAC fetchPricing: HTTP origins are blocked for security. Use HTTPS, or set "allowHttp": true in .peacrc for dev/testing.');
  }

  // Try YAML first
  const url = origin.replace(/\/$/, '') + '/.well-known/pricing.txt';
  const res = await fetch(url);
  if (res.ok) {
    const text = await res.text();
    return yaml.load(text);
  }

  // Fallback: JSON
  const fallback = origin.replace(/\/$/, '') + '/.well-known/peac.json';
  const res2 = await fetch(fallback);
  if (res2.ok && res2.headers.get('content-type')?.includes('application/json')) {
    return await res2.json();
  }

  return {};
}

module.exports = { fetchPricing };
