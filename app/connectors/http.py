import json
import logging
import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}
log = logging.getLogger("app.connectors.http")


def _extract_retry_delay(response: httpx.Response, default_delay: float) -> float:
    """Extract wait duration in seconds from standard HTTP Retry-After header or Medplum OperationOutcome diagnostics."""
    # 1. Standard HTTP Retry-After header (RFC 7231 / RFC 6585)
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            val = float(retry_after)
            if val >= 0:
                return val + 0.5
        except (ValueError, TypeError):
            pass

    # 2. Medplum FHIR OperationOutcome diagnostics JSON
    try:
        data = response.json()
        if isinstance(data, dict) and data.get("resourceType") == "OperationOutcome":
            for issue in data.get("issue", []):
                diag_str = issue.get("diagnostics", "")
                if "_msBeforeNext" in diag_str:
                    diag_data = json.loads(diag_str)
                    ms = diag_data.get("_msBeforeNext", 0)
                    if ms > 0:
                        return (ms / 1000.0) + 0.5
    except Exception:
        pass

    return default_delay


def request_with_retry(client: httpx.Client, method: str, url: str, *, retries: int = 3,
                       backoff: float = 0.5, max_delay: float = 65.0,
                       sleep=time.sleep, **kw) -> httpx.Response:
    """Retry on transient errors with exponential backoff and dynamic 429 Retry-After handling. Returns the last response."""
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

        # Calculate backoff delay
        delay = backoff * (2 ** attempt)
        if last is not None and last.status_code == 429:
            delay = _extract_retry_delay(last, delay)
            log.warning(
                f"Rate limited (HTTP 429) on {url}. Server requested backoff. "
                f"Sleeping {delay:.2f}s before retry {attempt + 1}/{retries}..."
            )
        delay = min(delay, max_delay)
        sleep(delay)

    assert last is not None
    return last

