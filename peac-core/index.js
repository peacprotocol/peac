const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { ethers } = require('ethers');
const yaml = require('js-yaml');

let config = {};
try {
  config = JSON.parse(fs.readFileSync('.peacrc', 'utf8'));
} catch (e) {}

function getClient(url) {
  const protocol = new URL(url).protocol;
  if (protocol === 'http:' && !config.allowHttp) {
    throw new Error('HTTPS required; set allowHttp: true in .peacrc to override');
  }
  return protocol === 'https:' ? https : http;
}

async function fetchPricing(url) {
  const paths = [
    '/pricing.txt',
    '/.well-known/peac.yaml',
    '/.well-known/peac.json'
  ];
  for (const path of paths) {
    try {
      const fullUrl = new URL(path, url).href;
      const response = await new Promise((resolve, reject) => {
        const req = getClient(fullUrl).get(fullUrl, resolve);
        req.on('error', reject);
      });
      if (response.statusCode === 200) {
        let body = '';
        response.on('data', chunk => body += chunk);
        await new Promise(resolve => response.on('end', resolve));
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('json')) {
          return JSON.parse(body);
        } else {
          return yaml.safeLoad(body);
        }
      }
      const link = response.headers.link;
      if (link && link.includes('rel="peac-terms"')) {
        const linkUrl = link.match(/<([^>]+)>/)[1];
        return fetchPricing(linkUrl);
      }
    } catch (e) {}
  }
  throw new Error('No terms found');
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([hms])$/);
  if (!match) return 0;
  const num = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'h') return num * 3600000;
  if (unit === 'm') return num * 60000;
  if (unit === 's') return num * 1000;
  return 0;
}

function checkAccess(terms, headers, request = {}) {
  const now = Date.now();
  if (terms.valid_until && Date.parse(terms.valid_until) < now) {
    return { access: false, reason: 'session expired' };
  }
  if (terms.expires_in) {
    const durationMs = parseDuration(terms.expires_in);
    if (durationMs > 0 && (terms.created_at + durationMs) < now) {
      return { access: false, reason: 'session expired' };
  }
  }
  if (terms.attribution_required && !headers['X-PEAC-Attribution-Consent']) {
    return { access: false, reason: 'attribution consent missing' };
  }
  if (terms.agent_type === 'x402' || headers['X-402-Payment-Required']) {
    // Assume this is an x402 flow; optionally return 402 with PEAC stub
    return { access: false, reason: 'payment required' };
  }
  const sig = headers['X-PEAC-Signature'];
  if (sig) {
    const domain = {
      name: 'PEAC Protocol',
      version: '0.9',
      chainId: 1,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };
    const types = {
      Request: [
        { name: 'agent_id', type: 'string' },
        { name: 'user_id', type: 'string' },
        { name: 'agent_type', type: 'string' }
      ]
    };
    const message = { agent_id: headers['X-PEAC-Agent-ID'] || headers['X-PEAC-Agent-Type'], user_id: headers['X-PEAC-User-ID'], agent_type: terms.agent_type };
    const recovered = ethers.verifyTypedData(domain, types, message, sig);
    if (recovered !== (headers['X-PEAC-Agent-ID'] || headers['X-PEAC-Agent-Type'])) {
      return { access: false, reason: 'signature invalid' };
    }
  }
  if (terms.metadata && terms.metadata.deal_id && headers['X-PEAC-Deal-ID'] !== terms.metadata.deal_id) {
    return { access: false, reason: 'deal ID mismatch' };
  }
  if (!validateTiers(request, terms)) {
    return { access: false, reason: 'tier access denied' };
  }
  return { access: true };
}

// This is a stub. Override or extend this method with real Stripe redirect logic. See Stripe Agent Docs.
// pricing_proof can be verified externally, e.g., against a blockchain or payment gateway.
function handlePayment(options) {
  if (options.method === 'stripe') {
    return { redirect: 'https://example.com/stripe-stub', pricing_proof: 'stub-uri' };
  }
  return {};
}

// Example for real payment integration (warning: integrate your own provider to maintain neutrality)
function handlePaymentReal(options) {
  // Implement real logic here, e.g., Stripe API call
  return { redirect: 'real-payment-url', pricing_proof: 'real-proof' };
}

async function signRequest(request, privateKey) {
  request.agent_id = config.agent_id || request.agent_id;
  request.user_id = config.user_id || request.user_id;
  request.agent_type = config.agent_type || request.agent_type;
  const method = config.signing_method || 'eip-712';
  if (method !== 'eip-712') {
    throw new Error('Only eip-712 supported currently; DID/JWT in v1.0');
  }
  const domain = {
    name: 'PEAC Protocol',
    version: '0.9',
    chainId: 1,
    verifyingContract: '0x0000000000000000000000000000000000000000'
  };
  const types = {
    Request: [
      { name: 'agent_id', type: 'string' },
      { name: 'user_id', type: 'string' },
      { name: 'agent_type', type: 'string' }
    ]
  };
  const signer = new ethers.Wallet(privateKey);
  return await signer.signTypedData(domain, types, request);
}

function getTermsHash(terms) {
  return crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex');
}

function validateAttribution(headers, terms) {
  if (terms.agent_type === 'research' && !headers['X-PEAC-Attribution-Consent']) {
    return false;
  }
  if (config.enforce_attribution_log && terms.attribution_required && headers['X-PEAC-Attribution-Consent'] && !headers['X-PEAC-Attribution-URL']) {
    return false;
  } else if (terms.attribution_required && headers['X-PEAC-Attribution-Consent'] && !headers['X-PEAC-Attribution-URL']) {
    console.log('Attribution URL missing; consent true but no log possible');
  }
  return true;
}

function validateTiers(request, terms) {
  if (terms.tiers && terms.tiers.length > 0 && request.path) {
    for (const tier of terms.tiers) {
      if (tier.allowed_paths.some(p => new RegExp(p.replace('*', '.*')).test(request.path))) {
        return true;
      }
    }
    return false;
  }
  return true;
}