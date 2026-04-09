"""Verify a signed interaction record against the PEAC Hosted Verify API.

Usage:
    python httpx_verify.py <compact-jws> [<base64url-ed25519-public-key>]

Requires: Python 3.12+, httpx >= 0.27
"""

from __future__ import annotations

import sys

import httpx

VERIFY_URL = "http://localhost:3000/v1/verify"


def verify_receipt(
    receipt_jws: str,
    public_key_b64url: str | None = None,
    *,
    base_url: str = VERIFY_URL,
    timeout: float = 10.0,
) -> dict:
    """Verify a receipt against the Hosted Verify API.

    Returns the DD-210 verification report on success.
    Raises httpx.HTTPStatusError on 4xx/5xx with RFC 9457 Problem Details body.
    """
    body: dict[str, str] = {"receipt": receipt_jws}
    if public_key_b64url is not None:
        body["public_key"] = public_key_b64url

    resp = httpx.post(
        base_url,
        json=body,
        headers={"Accept": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python httpx_verify.py <jws> [<public_key>]", file=sys.stderr)
        sys.exit(1)

    result = verify_receipt(
        sys.argv[1],
        sys.argv[2] if len(sys.argv) > 2 else None,
    )
    verified = result["verified"]
    issuer = result.get("issuer", "unknown")
    receipt_ref = result.get("receipt_ref", "")
    print(f"Verified: {verified}")
    print(f"Issuer:   {issuer}")
    print(f"Ref:      {receipt_ref}")
