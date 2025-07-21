from core.privacy.python.anonymizer import anonymize_id, log_request

def test_anonymize_id():
    h1 = anonymize_id("bot123")
    h2 = anonymize_id("bot123")
    assert h1 == h2
    assert len(h1) == 64

def test_log_request():
    log = log_request("abc", "/foo", False)
    assert "timestamp" in log
    assert log["agent"] == anonymize_id("abc")
    assert log["path"] == "/foo"
    assert log["privacy"] == "normal"
    # If do_not_log: True, returns None
    assert log_request("abc", "/foo", True) is None
