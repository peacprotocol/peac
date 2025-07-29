"""
PEAC Protocol v0.9.1
Ed25519 signature verifier (Python)
Apache 2.0 License
"""

import base64
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError

def verify(message: str, signature_b64: str, public_key_b64: str, nonce: str, timestamp: int) -> bool:
    vk = VerifyKey(base64.b64decode(public_key_b64))
    combined = (message + nonce + str(timestamp)).encode('utf-8')
    try:
        vk.verify(combined, base64.b64decode(signature_b64))
        return True
    except BadSignatureError:
        return False
