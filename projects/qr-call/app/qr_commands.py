"""Structured QR Call commands. URLs are data, never executable code.

The scanner sees an opaque HTTPS URL. The trusted server resolves it to a
strict allowlist action and enforces payment, SMS ownership, time and revocation
checks. No QR is allowed to run shell commands or change OS settings.
"""
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

PATHS = {
    'call': re.compile(r'^/c/[A-Za-z0-9_-]{32,128}$'),
    'download': re.compile(r'^/gate/code/[A-Za-z0-9_-]{32,128}$'),
}


@dataclass(frozen=True)
class QRCommand:
    kind: str
    url: str


def parse_qr_command(raw: str, allowed_origin: str) -> QRCommand:
    """Classify permitted QR URLs; never execute content found in a QR."""
    if not isinstance(raw, str) or len(raw) > 500 or raw != raw.strip():
        raise ValueError('Unsupported QR content')
    candidate, expected = urlsplit(raw), urlsplit(allowed_origin)
    if (candidate.scheme != expected.scheme or candidate.netloc != expected.netloc or
            candidate.username or candidate.password or candidate.query or candidate.fragment or
            not expected.scheme or not expected.netloc):
        raise ValueError('QR must point to the configured trusted service')
    for kind, rx in PATHS.items():
        if rx.fullmatch(candidate.path):
            return QRCommand(kind=kind, url=raw)
    raise ValueError('Unknown or unsafe QR action')
