const fetch = require('node-fetch');
const yaml = require('js-yaml');

async function fetchPricing(origin) {
  const url = origin.replace(/\/$/, '') + '/.well-known/pricing.txt';
  const res = await fetch(url);
  if (res.ok) {
    const text = await res.text();
    return yaml.load(text);
  }

  const fallback = origin.replace(/\/$/, '') + '/.well-known/peac.json';
  const res2 = await fetch(fallback);
  if (res2.ok && res2.headers.get('content-type')?.includes('application/json')) {
    return await res2.json();
  }

  return {};
}

module.exports = { fetchPricing };
