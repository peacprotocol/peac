/**
 * PEAC Protocol Shopify Proxy (Node.js/Express Style)
 * Apache 2.0 License
 * 
 * This simulates a proxy that enforces PEAC consent before forwarding to Shopify endpoint.
 * In production, this would run as a lightweight middleware in front of the shop's API.
 */
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3030;

// Demo: Accepts X-PEAC-Signature, X-PEAC-Nonce, X-PEAC-Expiry, X-PEAC-Public-Key headers
app.use(express.json());
app.all('/peac-proxy', (req, res) => {
    const signature = req.header('X-PEAC-Signature');
    const nonce = req.header('X-PEAC-Nonce');
    const expiry = req.header('X-PEAC-Expiry');
    const pubkey = req.header('X-PEAC-Public-Key');
    // TODO: validate signature/nonce/expiry with SDK!
    if (!signature || !nonce || !expiry || !pubkey) {
        return res.status(402).send('PEAC: Payment Required or Invalid Signature');
    }
    // Simulate pass-through if signature present (stub)
    res.status(200).send('PEAC: Access Granted (Stub Proxy)');
});

app.listen(PORT, () => {
    console.log(`PEAC Shopify Proxy running on port ${PORT}`);
});
