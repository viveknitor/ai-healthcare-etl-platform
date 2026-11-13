import time

import httpx

from .http import request_with_retry


class MedplumError(Exception):
    pass


class MedplumClient:
    """Target connector: OAuth2 client-credentials + idempotent conditional upsert."""

    def __init__(self, base_url: str, client_id: str, client_secret: str,
                 transport: httpx.BaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.client_id, self.client_secret = client_id, client_secret
        self.client = httpx.Client(transport=transport, timeout=30)
        self._token: str | None = None
        self._expires_at = 0.0

    def _auth_header(self) -> dict:
        if not self._token or time.time() > self._expires_at - 30:
            r = self.client.post(f"{self.base_url}/oauth2/token", data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            })
            if r.status_code != 200:
                raise MedplumError(f"auth failed: {r.status_code} {r.text[:200]}")
            body = r.json()
            self._token = body["access_token"]
            self._expires_at = time.time() + int(body.get("expires_in", 3600))
        return {"Authorization": f"Bearer {self._token}"}

    def upsert(self, resource: dict, identifier_system: str, identifier_value: str) -> dict:
        """Conditional update: creates if no match, updates if one match. Re-runs don't duplicate."""
        rt = resource["resourceType"]
        r = request_with_retry(
            self.client, "PUT", f"{self.base_url}/fhir/R4/{rt}",
            params={"identifier": f"{identifier_system}|{identifier_value}"},
            json=resource,
            headers={**self._auth_header(), "Content-Type": "application/fhir+json"},
        )
        if r.status_code not in (200, 201):
            raise MedplumError(f"{r.status_code}: {r.text[:300]}")
        return r.json()
