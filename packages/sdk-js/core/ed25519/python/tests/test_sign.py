"""
PEAC Protocol v0.9.1
Test for Ed25519 sign (Python)
Apache 2.0 License
"""

import base64
from nacl.signing import SigningKey
from core.ed25519.python.sign import sign

def test_sign():
    sk = SigningKey.generate()
    privkey_b64 = base64.b64encode(sk._seed).decode()
    message = "test-message"
    nonce = "nonce-123"
    timestamp = 1721548812991
    signature = sign(message, privkey_b64, nonce, timestamp)
    assert isinstance(signature, str)
    assert len(base64.b64decode(signature)) == 64

if __name__ == "__main__":
    test_sign()
    print("sign.py test passed.")
