"""
PEAC Protocol v0.9.1
Ed25519 signer (Python)
Apache 2.0 License
"""

import base64
from nacl.signing import SigningKey

def sign(message: str, private_key_b64: str, nonce: str, timestamp: int) -> str:
    sk = SigningKey(base64.b64decode(private_key_b64))
    combined = (message + nonce + str(timestamp)).encode('utf-8')
    signature = sk.sign(combined).signature
    return base64.b64encode(signature).decode()
