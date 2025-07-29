"""
Unit tests for PEAC Python SDK
"""

import base64
from nacl.signing import SigningKey
from .peac_sdk import sign_message, verify_message

def test_sign_and_verify():
    sk = SigningKey.generate()
    vk = sk.verify_key
    privkey_b64 = base64.b64encode(bytes(sk)).decode()
    pubkey_b64 = base64.b64encode(bytes(vk)).decode()

    message = "hello-peac"
    nonce = "xyz123"
    timestamp = 1721548800000

    sig = sign_message(message, privkey_b64, nonce, timestamp)
    assert verify_message(message, sig, pubkey_b64, nonce, timestamp)
    assert not verify_message("tampered", sig, pubkey_b64, nonce, timestamp)

if __name__ == "__main__":
    test_sign_and_verify()
    print("PEAC SDK Python tests passed.")
