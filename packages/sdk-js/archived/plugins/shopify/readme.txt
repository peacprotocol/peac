# PEAC Protocol Shopify Proxy

This Node.js/Express script simulates a Shopify API proxy that enforces PEAC machine-readable consent (signature, nonce, expiry, public key) for each request.

To run:

    cd plugins/shopify
    npm install express axios
    node peac-proxy.js
    node test_proxy.js

Replace stubs with full SDK validation logic before production use.
