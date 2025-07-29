"""
PEAC Protocol v0.9.1
Test for Ed25519 verify (Python)
Apache 2.0 License
"""

import sys
import os
import base64
from nacl.signing import SigningKey

# Ensure import works regardless of how test is run
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from sign import sign
from verify import verify

def test_verify():
    sk = SigningKey.generate()
    pk = sk.verify_key
    privkey_b64 = base64.b64encode(sk._seed).decode()
    pubkey_b64 = base64.b64encode(bytes(pk)).decode()
    message = "hello-peac"
    nonce = "abc123"
    timestamp = 1721548812991

    signature = sign(message, privkey_b64, nonce, timestamp)
    assert verify(message, signature, pubkey_b64, nonce, timestamp) is True
    assert verify("tampered", signature, pubkey_b64, nonce, timestamp) is False

if __name__ == "__main__":
    test_verify()
    print("verify.py test passed.")
