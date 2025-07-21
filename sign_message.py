import base64
from nacl.signing import SigningKey

private_key_b64 = '8C2NlW8vmtwGZXQ1LeB8XjA9mTgTcwh1wT5icAF9v28='
sk = SigningKey(base64.b64decode(private_key_b64))

nonce = 'bot-abc-999'         # make this unique every run!
expiry = '1721592000'         # <--- seconds, not ms!
path = '/index.php'           # must match curl and plugin

message = f"{nonce}{expiry}{path}".encode()
sig = sk.sign(message).signature
sig_b64 = base64.b64encode(sig).decode()

print(f"Nonce:     {nonce}")
print(f"Expiry:    {expiry}")
print(f"Path:      {path}")
print(f"Signature: {sig_b64}")
