# PEAC Python CLI v0.9.12

Ultra-lean Python implementation of PEAC Protocol operations using `jwcrypto` for Ed25519 cryptography.

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Generate Ed25519 Keypair

```bash
python peac.py keygen --kid test-key-001 --output keys.json
```

### Sign PEAC Receipt

```bash
python peac.py --keys keys.json sign --file example-receipt.json --kid test-key-001
```

### Verify PEAC Receipt

```bash
python peac.py verify "eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3QifQ.eyJ0ZXN0IjoidHJ1ZSJ9.signature"
```

### Discover .well-known/peac.txt

```bash
python peac.py discover https://example.com
```

## Commands

- `keygen` - Generate Ed25519 keypair
- `sign` - Sign PEAC receipt as JWS
- `verify` - Verify PEAC receipt JWS
- `discover` - Fetch and parse .well-known/peac.txt

## Security

- Uses `jwcrypto` library for secure Ed25519 operations
- Validates receipt schema with Pydantic
- Enforces PEAC v0.9.12 ADR-002 requirements
- Includes basic SSRF protection for discovery

## Example Workflow

```bash
# 1. Generate keypair
python peac.py keygen --kid test-key-001 --output test-keys.json

# 2. Sign receipt
python peac.py --keys test-keys.json sign --file example-receipt.json --kid test-key-001 > receipt.jws

# 3. Verify receipt
python peac.py --keys test-keys.json verify "$(cat receipt.jws)"

# 4. Discover endpoint
python peac.py discover https://peac.dev
```