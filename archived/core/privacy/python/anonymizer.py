"""
PEAC Protocol Privacy Anonymizer (Python)
Apache 2.0 License
"""
import hashlib
from datetime import datetime

def anonymize_id(agent_id: str) -> str:
    """SHA-256 hash of agent_id as hex."""
    return hashlib.sha256(agent_id.encode()).hexdigest()

def log_request(agent_id, path, do_not_log=False):
    """Log a request unless do_not_log is set."""
    if do_not_log:
        return None
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "agent": anonymize_id(agent_id),
        "path": path,
        "privacy": "private" if do_not_log else "normal"
    }
