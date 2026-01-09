# Python SDK Implementation Plan

PEAC Protocol SDK for Python 3.9+.

**Status:** Planning (v0.9.28 P2 - Deferred)
**Package:** `peac-protocol` (PyPI)
**Layer:** 6 (SDKs)

## Overview

Python SDK providing receipt verification, issuance, and policy evaluation for Python applications.

**Goal:** Feature parity with TypeScript SDK and Go SDK.

## Package Structure

```
sdks/python/
├── pyproject.toml            # PEP 518 build config
├── setup.py                  # Setuptools config
├── README.md
├── LICENSE
├── peac/
│   ├── __init__.py           # Main exports
│   ├── verify.py             # Receipt verification
│   ├── issue.py              # Receipt issuance
│   ├── policy.py             # Policy evaluation
│   ├── types.py              # Type definitions
│   ├── errors.py             # Error classes
│   ├── jwks.py               # JWKS fetching/caching
│   ├── jws.py                # JWS parsing/signing
│   └── crypto.py             # Ed25519 operations
├── tests/
│   ├── test_verify.py
│   ├── test_issue.py
│   ├── test_policy.py
│   ├── test_jwks.py
│   └── test_conformance.py   # Cross-SDK parity
└── examples/
    ├── verify_basic.py
    ├── issue_basic.py
    └── policy_basic.py
```

## API Design

### Verify Function

```python
from dataclasses import dataclass
from typing import Optional, List
from datetime import timedelta

@dataclass
class VerifyOptions:
    """Options for receipt verification."""
    issuer: str                          # Expected issuer (REQUIRED)
    audience: str                        # Expected audience (REQUIRED)
    max_age: timedelta = timedelta(hours=1)  # Max receipt age
    clock_skew: timedelta = timedelta(seconds=30)  # Clock tolerance
    jwks_url: Optional[str] = None       # Explicit JWKS URL
    jwks_cache_ttl: timedelta = timedelta(hours=1)  # JWKS cache TTL

@dataclass
class PEACReceiptClaims:
    """PEAC receipt claims."""
    receipt_id: str
    issuer: str
    audience: List[str]
    issued_at: int
    expires_at: Optional[int]
    subject: Optional[dict]
    payment: Optional[dict]
    extensions: Optional[dict]
    # v0.9.24+
    purpose_declared: Optional[List[str]]
    purpose_enforced: Optional[str]
    purpose_reason: Optional[str]

@dataclass
class VerifyResult:
    """Verification result."""
    claims: PEACReceiptClaims
    key_id: str
    algorithm: str
    perf: dict  # Performance metrics

def verify(receipt_jws: str, options: VerifyOptions) -> VerifyResult:
    """
    Verify a PEAC receipt JWS.

    Args:
        receipt_jws: JWS compact serialization
        options: Verification options

    Returns:
        VerifyResult with claims and metadata

    Raises:
        PEACError: Verification failed

    Example:
        >>> from peac import verify, VerifyOptions
        >>> result = verify(receipt_jws, VerifyOptions(
        ...     issuer="https://publisher.example",
        ...     audience="https://agent.example"
        ... ))
        >>> print(result.claims.receipt_id)
    """
    pass
```

### Issue Function

```python
from dataclasses import dataclass
from typing import Optional, Dict, Any, List

@dataclass
class IssueOptions:
    """Options for receipt issuance."""
    # Required fields
    issuer: str
    audience: str
    amount: int          # Minor units
    currency: str        # ISO 4217
    rail: str
    reference: str
    private_key: bytes   # Ed25519 private key (32 bytes)
    key_id: str

    # Optional fields
    asset: Optional[str] = None
    env: str = 'test'
    network: Optional[str] = None
    facilitator_ref: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None
    idempotency_key: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    subject: Optional[str] = None
    extensions: Optional[Dict[str, Any]] = None
    expires_at: Optional[int] = None

    # v0.9.24+ Purpose tracking
    purpose: Optional[List[str]] = None
    purpose_enforced: Optional[str] = None
    purpose_reason: Optional[str] = None

@dataclass
class IssueResult:
    """Issuance result."""
    jws: str             # JWS compact serialization
    receipt_id: str      # UUIDv7 generated
    issued_at: int       # Unix timestamp
    perf: dict          # Performance metrics

def issue(options: IssueOptions) -> IssueResult:
    """
    Issue a PEAC receipt.

    Args:
        options: Issuance options

    Returns:
        IssueResult with JWS and metadata

    Raises:
        PEACError: Issuance failed

    Example:
        >>> from peac import issue, IssueOptions
        >>> result = issue(IssueOptions(
        ...     issuer="https://publisher.example",
        ...     audience="https://agent.example",
        ...     amount=1000,
        ...     currency="USD",
        ...     rail="stripe",
        ...     reference="ch_abc123",
        ...     private_key=private_key,
        ...     key_id="2025-01-09T12:00:00Z"
        ... ))
        >>> print(result.jws)
    """
    pass
```

### Policy Evaluation

```python
from dataclasses import dataclass
from typing import List, Optional, Dict
from enum import Enum

class PolicyDecision(Enum):
    """Policy decision values."""
    ALLOW = "allow"
    DENY = "deny"
    REVIEW = "review"

@dataclass
class PolicyDocument:
    """PEAC policy document (peac-policy/0.1)."""
    version: str
    name: str
    rules: List['PolicyRule']

@dataclass
class PolicyRule:
    """Policy rule."""
    name: str
    match: Dict[str, Any]
    purpose: List[str]
    allow: str
    require: Optional[Dict[str, Any]] = None

@dataclass
class EvaluationContext:
    """Policy evaluation context."""
    subject_type: str
    subject_id: str
    subject_labels: Dict[str, str]
    purpose: str
    licensing_mode: Optional[str] = None
    receipt_verified: bool = False

@dataclass
class Decision:
    """Policy decision."""
    allow: str              # "allow", "deny", "review"
    rule: str              # Matched rule name
    receipt_required: bool
    licensing: List[str]
    license_url: Optional[str] = None

def load_policy(data: bytes) -> PolicyDocument:
    """
    Load policy from YAML or JSON.

    Args:
        data: Policy file content

    Returns:
        PolicyDocument

    Raises:
        PEACError: Invalid policy format

    Example:
        >>> with open('policy.yaml', 'rb') as f:
        ...     policy = load_policy(f.read())
    """
    pass

class Policy:
    """Policy evaluator."""

    def __init__(self, document: PolicyDocument):
        self.document = document

    def evaluate(self, context: EvaluationContext) -> Decision:
        """
        Evaluate policy against context.

        Args:
            context: Evaluation context

        Returns:
            Decision (first-match-wins)

        Example:
            >>> policy = Policy(document)
            >>> decision = policy.evaluate(EvaluationContext(
            ...     subject_type="agent",
            ...     subject_id="agent:abc123",
            ...     purpose="train",
            ...     receipt_verified=True
            ... ))
            >>> if decision.allow == "deny":
            ...     return 403
        """
        pass

    def enforce_for_http(self, decision: Decision) -> tuple[int, Dict[str, str]]:
        """
        Convert decision to HTTP response.

        Args:
            decision: Policy decision

        Returns:
            (status_code, headers)

        Example:
            >>> status, headers = policy.enforce_for_http(decision)
            >>> return Response(status=status, headers=headers)
        """
        pass
```

## Implementation Details

### Ed25519 Crypto

Use `cryptography` library:

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization

def sign_jws(header: dict, payload: dict, private_key: bytes) -> str:
    """Sign JWS with Ed25519."""
    key = Ed25519PrivateKey.from_private_bytes(private_key)

    # Construct signing input
    header_b64 = base64url_encode(json.dumps(header).encode())
    payload_b64 = base64url_encode(json.dumps(payload).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()

    # Sign
    signature = key.sign(signing_input)
    signature_b64 = base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"

def verify_jws(jws: str, public_key: bytes) -> dict:
    """Verify JWS with Ed25519."""
    key = Ed25519PublicKey.from_public_bytes(public_key)

    # Parse JWS
    header_b64, payload_b64, signature_b64 = jws.split('.')
    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = base64url_decode(signature_b64)

    # Verify
    key.verify(signature, signing_input)

    # Return payload
    return json.loads(base64url_decode(payload_b64))
```

### JWKS Fetching

Use `httpx` for async/sync HTTP:

```python
import httpx
from typing import Dict, Optional
from datetime import datetime, timedelta

class JWKSCache:
    """JWKS cache with TTL."""

    def __init__(self, ttl: timedelta = timedelta(hours=1)):
        self._cache: Dict[str, tuple[dict, datetime]] = {}
        self._ttl = ttl

    async def get(self, url: str) -> dict:
        """Fetch JWKS with caching."""
        # Check cache
        if url in self._cache:
            jwks, fetched_at = self._cache[url]
            if datetime.now() - fetched_at < self._ttl:
                return jwks

        # Fetch from URL
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)
            response.raise_for_status()
            jwks = response.json()

        # Cache
        self._cache[url] = (jwks, datetime.now())
        return jwks

    def get_sync(self, url: str) -> dict:
        """Synchronous JWKS fetch."""
        # Check cache
        if url in self._cache:
            jwks, fetched_at = self._cache[url]
            if datetime.now() - fetched_at < self._ttl:
                return jwks

        # Fetch from URL
        with httpx.Client() as client:
            response = client.get(url, timeout=5.0)
            response.raise_for_status()
            jwks = response.json()

        # Cache
        self._cache[url] = (jwks, datetime.now())
        return jwks
```

### UUIDv7 Generation

Use `uuid7` library:

```python
from uuid_utils import uuid7

def generate_receipt_id() -> str:
    """Generate UUIDv7 receipt ID."""
    return f"rcpt_{uuid7()}"
```

### Type Hints

Full type hints for Python 3.9+:

```python
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass

# Use typing.TypedDict for structured dicts
from typing import TypedDict

class PaymentDict(TypedDict, total=False):
    """Payment claim structure."""
    rail: str
    reference: str
    amount: int
    currency: str
    asset: Optional[str]
    env: Optional[str]
    network: Optional[str]
    evidence: Optional[Dict[str, Any]]
```

## Testing

### Unit Tests

Use `pytest`:

```python
import pytest
from peac import verify, VerifyOptions, PEACError

def test_verify_valid_receipt():
    """Test verification of valid receipt."""
    receipt_jws = "..."  # From conformance fixtures

    result = verify(receipt_jws, VerifyOptions(
        issuer="https://publisher.example",
        audience="https://agent.example"
    ))

    assert result.claims.receipt_id.startswith("rcpt_")
    assert result.claims.issuer == "https://publisher.example"

def test_verify_expired_receipt():
    """Test verification of expired receipt."""
    receipt_jws = "..."  # Expired receipt

    with pytest.raises(PEACError) as exc_info:
        verify(receipt_jws, VerifyOptions(
            issuer="https://publisher.example",
            audience="https://agent.example"
        ))

    assert exc_info.value.code == "expired"
```

### Conformance Tests

Cross-SDK parity with TypeScript and Go:

```python
import pytest
import json
from pathlib import Path

def load_conformance_fixtures():
    """Load conformance test fixtures."""
    fixtures_dir = Path(__file__).parent.parent.parent / "specs" / "conformance" / "fixtures"

    fixtures = []
    for fixture_file in fixtures_dir.glob("**/*.json"):
        with open(fixture_file) as f:
            fixtures.append((fixture_file.name, json.load(f)))

    return fixtures

@pytest.mark.parametrize("name,fixture", load_conformance_fixtures())
def test_conformance(name, fixture):
    """Test conformance against golden vectors."""
    if fixture["valid"]:
        # Should verify successfully
        result = verify(fixture["jws"], VerifyOptions(
            issuer=fixture["issuer"],
            audience=fixture["audience"]
        ))
        assert result.claims.receipt_id == fixture["expected"]["receipt_id"]
    else:
        # Should fail with expected error
        with pytest.raises(PEACError) as exc_info:
            verify(fixture["jws"], VerifyOptions(
                issuer=fixture["issuer"],
                audience=fixture["audience"]
            ))
        assert exc_info.value.code == fixture["expected_error"]
```

## Dependencies

### pyproject.toml

```toml
[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "peac-protocol"
version = "0.9.28"
description = "PEAC Protocol SDK for Python"
authors = [{ name = "PEAC Protocol Contributors" }]
license = { text = "Apache-2.0" }
readme = "README.md"
requires-python = ">=3.9"
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: Apache Software License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.9",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
]
dependencies = [
    "cryptography>=41.0.0",
    "httpx>=0.25.0",
    "pyyaml>=6.0",
    "uuid-utils>=0.7.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "mypy>=1.5.0",
    "ruff>=0.1.0",
]

[project.urls]
Homepage = "https://peacprotocol.org"
Documentation = "https://peacprotocol.org/docs"
Repository = "https://github.com/peacprotocol/peac"
Issues = "https://github.com/peacprotocol/peac/issues"
```

## Documentation

### README.md

```markdown
# PEAC Protocol SDK for Python

Official Python SDK for PEAC Protocol receipt verification and issuance.

## Installation

```bash
pip install peac-protocol
```

## Quick Start

### Verify a Receipt

```python
from peac import verify, VerifyOptions

result = verify(receipt_jws, VerifyOptions(
    issuer="https://publisher.example",
    audience="https://agent.example"
))

print(f"Receipt ID: {result.claims.receipt_id}")
print(f"Amount: {result.claims.payment['amount']} {result.claims.payment['currency']}")
```

### Issue a Receipt

```python
from peac import issue, IssueOptions

result = issue(IssueOptions(
    issuer="https://publisher.example",
    audience="https://agent.example",
    amount=1000,
    currency="USD",
    rail="stripe",
    reference="ch_abc123",
    private_key=private_key,
    key_id="2025-01-09T12:00:00Z"
))

print(f"Receipt JWS: {result.jws}")
```

## License

Apache-2.0
```

### Type Stubs

Provide `.pyi` stubs for type checkers:

```python
# peac/__init__.pyi
from .verify import verify, VerifyOptions, VerifyResult
from .issue import issue, IssueOptions, IssueResult
from .policy import Policy, load_policy, PolicyDocument, Decision
from .errors import PEACError
from .types import PEACReceiptClaims

__all__ = [
    "verify",
    "VerifyOptions",
    "VerifyResult",
    "issue",
    "IssueOptions",
    "IssueResult",
    "Policy",
    "load_policy",
    "PolicyDocument",
    "Decision",
    "PEACError",
    "PEACReceiptClaims",
]
```

## Publishing

### PyPI Release

```bash
# Build distributions
python -m build

# Upload to PyPI
twine upload dist/*

# Verify installation
pip install peac-protocol==0.9.28
python -c "from peac import verify; print('OK')"
```

### CI/CD

GitHub Actions workflow:

```yaml
name: Python Package

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install build twine
      - run: python -m build
      - run: twine check dist/*
      - uses: pypa/gh-action-pypi-publish@release/v1
        with:
          password: ${{ secrets.PYPI_API_TOKEN }}
```

## Acceptance Criteria

- [ ] verify() function with full JWKS support
- [ ] issue() function with UUIDv7 and Ed25519
- [ ] Policy evaluation (load_policy, evaluate, enforce_for_http)
- [ ] Type hints for all public APIs
- [ ] 50+ unit tests
- [ ] Conformance tests (cross-SDK parity)
- [ ] Documentation (README, docstrings)
- [ ] Published to PyPI as peac-protocol
- [ ] Python 3.9+ support

## Timeline

- **Setup:** 1 day (project structure, pyproject.toml, CI)
- **Verify:** 2 days (JWS, JWKS, validation)
- **Issue:** 2 days (signing, UUIDv7, evidence)
- **Policy:** 2 days (YAML loading, evaluation)
- **Testing:** 2 days (unit tests, conformance)
- **Documentation:** 1 day (README, docstrings)
- **Total:** 10 days

## References

- TypeScript SDK: [packages/protocol/](../../packages/protocol/)
- Go SDK: [sdks/go/](../go/)
- Conformance Fixtures: [specs/conformance/](../../specs/conformance/)
