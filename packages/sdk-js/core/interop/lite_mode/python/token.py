"""
PEAC Protocol v0.9.1
Lite Mode Token - Python
Apache-2.0 License
"""
import base64
import time

_issued_tokens = set()

def generate_token(agent_id):
    token = base64.b64encode(f"{agent_id}:{int(time.time())}".encode()).decode()
    _issued_tokens.add(token)
    return token

def validate_token(token):
    return token in _issued_tokens
