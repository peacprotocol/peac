"""
PEAC Protocol v0.9.1
Nonce cache for anti-replay (memory only)
Apache 2.0 License
"""

import time

NONCE_TTL = 5 * 60  # 5 minutes in seconds

class NonceCache:
    def __init__(self):
        self.nonces = {}

    def add(self, nonce: str, timestamp: int) -> bool:
        now = int(time.time() * 1000)
        # timestamp in ms
        if nonce in self.nonces:
            return False
        if abs(now - int(timestamp)) > NONCE_TTL * 1000:
            return False
        self.nonces[nonce] = now
        # Schedule cleanup not needed in scripts, but in prod: clean old entries periodically
        return True

    def clear(self):
        self.nonces = {}
