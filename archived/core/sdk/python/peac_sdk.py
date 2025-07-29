"""
PEAC Protocol Python SDK v0.9.1
Apache 2.0 License
"""

import base64
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError

def sign_message(message: str, private_key_b64: str, nonce: str, timestamp: int) -> str:
    """
    Ed25519 sign with nonce/timestamp for PEAC
    """
    sk = SigningKey(base64.b64decode(private_key_b64))
    full_message = f"{message}|{nonce}|{timestamp}".encode()
    signature = sk.sign(full_message).signature
    return base64.b64encode(signature).decode()

def verify_message(message: str, signature_b64: str, public_key_b64: str, nonce: str, timestamp: int) -> bool:
    """
    Verify Ed25519 signature with nonce/timestamp for PEAC
    """
    vk = VerifyKey(base64.b64decode(public_key_b64))
    full_message = f"{message}|{nonce}|{timestamp}".encode()
    try:
        vk.verify(full_message, base64.b64decode(signature_b64))
        return True
    except BadSignatureError:
        return False
