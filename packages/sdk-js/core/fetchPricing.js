const yaml = require('js-yaml');

async function fetchPricing(url) {
  const urls = [
    `${url}/pricing.txt`,
    `${url}/.well-known/peac.yaml`,
    `${url}/.well-known/peac.json`
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.status === 200) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          return await res.json();
        } else {
          const text = await res.text();
          return yaml.load(text);
        }
      }
    } catch (e) {
      continue;
    }
  }
  return {};
}

module.exports = { fetchPricing };