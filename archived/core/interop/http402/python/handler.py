"""
PEAC Protocol v0.9.1
HTTP 402 Payment Required Handler (Python)
Apache-2.0 License
"""
from flask import Response
import json

def payment_required(pricing):
    headers = {
        'X-PEAC-Pricing': json.dumps(pricing),
        'Content-Type': 'application/json'
    }
    body = json.dumps({
        'error': 'payment_required',
        'pricing': pricing,
        'message': 'Payment or consent required for access'
    })
    return Response(body, status=402, headers=headers)
