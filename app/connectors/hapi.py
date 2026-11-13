from collections.abc import Iterator

import httpx

from .http import request_with_retry


class HapiClient:
    """Source connector: reads resources from a HAPI FHIR server, following Bundle paging."""

    def __init__(self, base_url: str, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(transport=transport, timeout=30,
                                   headers={"Accept": "application/fhir+json"})

    def fetch(self, resource_type: str = "Patient", count: int = 10, page_size: int = 10) -> Iterator[dict]:
        url: str | None = f"{self.base_url}/{resource_type}"
        params: dict | None = {"_count": min(page_size, count)}
        yielded = 0
        while url and yielded < count:
            resp = request_with_retry(self.client, "GET", url, params=params)
            resp.raise_for_status()
            bundle = resp.json()
            for entry in bundle.get("entry", []):
                res = entry.get("resource")
                if res and res.get("resourceType") == resource_type:
                    yield res
                    yielded += 1
                    if yielded >= count:
                        return
            url = next((l["url"] for l in bundle.get("link", []) if l.get("relation") == "next"), None)
            params = None  # the next link already carries its own query string
