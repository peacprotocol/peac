from core.interop.http402.python.handler import payment_required

def test_payment_required():
    pricing = {'amount': '0.01', 'currency': 'USD'}
    resp = payment_required(pricing)
    assert resp.status_code == 402
    assert 'X-PEAC-Pricing' in resp.headers
    assert b'payment_required' in resp.data
