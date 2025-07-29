from core.interop.lite_mode.python.token import generate_token, validate_token

def test_token():
    agent_id = "test-agent"
    token = generate_token(agent_id)
    assert isinstance(token, str)
    assert validate_token(token)
    assert not validate_token("invalid")
