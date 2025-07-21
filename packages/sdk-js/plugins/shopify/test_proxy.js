/**
 * Test: Simulate PEAC-protected Shopify proxy
 * Run: node test_proxy.js
 */
const axios = require('axios');

(async () => {
    const resp = await axios.post('http://localhost:3030/peac-proxy', {}, {
        headers: {
            'X-PEAC-Signature': 'demo-sig',
            'X-PEAC-Nonce': 'demo-nonce',
            'X-PEAC-Expiry': '123456789',
            'X-PEAC-Public-Key': 'demo-pubkey'
        }
    });
    console.log('Response:', resp.status, resp.data);
})();
