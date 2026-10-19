#!/usr/bin/env python3
"""A stand-in for bjk-identity-server, for the API smoke test only.

It publishes a discovery document and signing key like the real identity server, and signs access tokens on
request, so the API validates tokens exactly as it does in production (issuer, audience, signature, expiry and
"at+jwt" type) with no test-only code in the API. Never run this anywhere but CI or your own machine.

    python3 fake-issuer.py 5999
    curl -s -X POST localhost:5999/token -d '{"sub": "...", "scope": ["bjk.posts"]}'
"""
import base64
import json
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5999
ISSUER = f"http://localhost:{PORT}"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KID = "smoke-test"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def number(n: int) -> str:
    return b64(n.to_bytes((n.bit_length() + 7) // 8, "big"))


def sign(header: dict, claims: dict) -> str:
    signing_input = f"{b64(json.dumps(header).encode())}.{b64(json.dumps(claims).encode())}"
    signature = KEY.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{b64(signature)}"


def token(request: dict) -> str:
    now = int(time.time())
    lifetime = int(request.get("lifetime", 600))
    claims = {
        "iss": request.get("iss", ISSUER),
        "aud": request.get("aud", "bjk-api"),
        "sub": request["sub"],
        "client_id": request.get("client_id", "bjk-web"),
        "scope": request.get("scope", []),
        "amr": request.get("amr", ["pwd"]),
        "email_verified": request.get("email_verified", True),
        "iat": now,
        "nbf": now + min(0, lifetime) - 60,
        "exp": now + lifetime,
        "jti": str(uuid.uuid4()),
    }
    if request.get("role"):
        claims["role"] = request["role"]
    # The subscription plan (free, premium, premium_plus), as the identity server will issue it once billing exists.
    if request.get("plan"):
        claims["plan"] = request["plan"]
    # Issued by the identity server once the account passes the age check. Present unless the request sets it to null.
    age_verified = request.get("age_verified", "true")
    if age_verified is not None:
        claims["age_verified"] = age_verified
    header = {"alg": "RS256", "kid": KID, "typ": request.get("typ", "at+jwt")}
    return sign(header, claims)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/.well-known/openid-configuration":
            self._json(200, {"issuer": ISSUER, "jwks_uri": f"{ISSUER}/jwks", "id_token_signing_alg_values_supported": ["RS256"]})
        elif self.path == "/jwks":
            public = KEY.public_key().public_numbers()
            self._json(200, {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": KID, "n": number(public.n), "e": number(public.e)}]})
        else:
            self._json(404, {})

    def do_POST(self):
        if self.path != "/token":
            self._json(404, {})
            return
        length = int(self.headers.get("Content-Length", 0))
        self._json(200, {"access_token": token(json.loads(self.rfile.read(length) or b"{}"))})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Fake issuer on {ISSUER}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
