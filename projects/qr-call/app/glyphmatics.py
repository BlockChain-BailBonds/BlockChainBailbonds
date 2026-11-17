"""QR Call GlyphMatics GM1 encrypted record envelope.

GlyphMatics supplies the versioned record format, domain separation and key schedule.
The cryptographic primitive is audited AES-256-GCM; this module does not claim
that an experimental GlyphMatics cipher has been independently validated.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag

PREFIX = 'GM1.'
AAD = b'918 Technologies | QR Call | GlyphMatics envelope GM1'


def _key(master: str) -> bytes:
    try:
        data = base64.urlsafe_b64decode(master.encode('ascii'))
    except (ValueError, UnicodeError) as exc:
        raise ValueError('Invalid base64 encryption master key') from exc
    if len(data) != 32:
        raise ValueError('Encryption master key must contain exactly 256 bits')
    return HKDF(algorithm=hashes.SHA256(), length=32,
                salt=b'qr-call-gm1-master', info=AAD).derive(data)


def seal(plain: str, master: str) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key(master)).encrypt(nonce, plain.encode('utf-8'), AAD)
    return PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode('ascii')


def open_seal(envelope: str, master: str) -> str:
    if not envelope.startswith(PREFIX):
        raise ValueError('Unsupported GlyphMatics encryption envelope')
    try:
        payload = base64.urlsafe_b64decode(envelope[len(PREFIX):].encode('ascii'))
        if len(payload) < 29:
            raise ValueError('Truncated encrypted record')
        return AESGCM(_key(master)).decrypt(payload[:12], payload[12:], AAD).decode('utf-8')
    except (InvalidTag, UnicodeError, ValueError) as exc:
        raise ValueError('Encrypted record failed authentication') from exc
