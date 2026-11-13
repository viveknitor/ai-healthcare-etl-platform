import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


def request_with_retry(client: httpx.Client, method: str, url: str, *, retries: int = 3,
                       backoff: float = 0.5, sleep=time.sleep, **kw) -> httpx.Response:
    """Retry on transient errors with exponential backoff. Returns the last response."""
    last: httpx.Response | None = None
    for attempt in range(retries + 1):
        try:
            last = client.request(method, url, **kw)
        except httpx.TransportError:
            if attempt == retries:
                raise
        else:
            if last.status_code not in RETRY_STATUS or attempt == retries:
                return last
        sleep(backoff * (2 ** attempt))
    assert last is not None
    return last
