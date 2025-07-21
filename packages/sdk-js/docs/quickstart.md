# PEAC Protocol Quickstart

Welcome to PEAC Protocol! This guide helps you integrate programmable access, consent, and payment enforcement in minutes.

---

## 1. Add a `pricing.txt` to Your Web Root

```bash
cp examples/pricing.txt ./pricing.txt
# Or for advanced use:
cp examples/full-pricing.txt ./pricing.txt
```
## 2. Install the SDK

***Node.js:***

```bash
npm install @peac/protocol
```

***Python:***

```bash
pip install pynacl
```

## 3. Validate Your Terms

```bash
node cli/peac-cli.js validate pricing.txt
```

## 4. Integrate Middleware (Node/Express)

```js
const peacMiddleware = require('./core/middleware');
const yaml = require('js-yaml');
const fs = require('fs');
const pricing = yaml.load(fs.readFileSync('pricing.txt', 'utf8'));

app.use(peacMiddleware(pricing));
```

## 5. Sign and Verify Requests

***Node:***
See core/ed25519/node/sign.js and verify.js for Ed25519 example.

***Python:***
See core/ed25519/python/sign.py and verify.py.

## 6. Test
```bash
npm test
pytest
```

## 7. Explore Examples
- examples/pricing.txt (minimal)
- examples/full-pricing.txt (tiers, sessions)

For full docs, see README.md.
