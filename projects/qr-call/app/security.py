import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from urllib.parse import urlsplit
from argon2 import PasswordHasher, exceptions as argon_exceptions
from .glyphmatics import seal, open_seal
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import jwt
from .config import get_settings


hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def digest(value):
    return hmac.new(get_settings().app_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def secure_token():
    return secrets.token_urlsafe(32)


def phone_encrypt(phone):
    return seal(phone, get_settings().encryption_key)


def phone_decrypt(value):
    return open_seal(value, get_settings().encryption_key)


def verify_password(password):
    if not get_settings().admin_password_hash:
        return False
    try:
        return hasher.verify(get_settings().admin_password_hash, password)
    except (argon_exceptions.VerifyMismatchError, argon_exceptions.VerificationError, argon_exceptions.InvalidHashError):
        return False


def serializer():
    return URLSafeTimedSerializer(get_settings().app_secret, salt='qrcall-owner-session-v1')


def new_login_session(csrf=None, phone_verified=False):
    csrf = csrf or secure_token()
    return serializer().dumps({'auth': 1, 'csrf': csrf, 'phone_verified': bool(phone_verified)}), csrf


def verify_login_session(value):
    try:
        result = serializer().loads(value, max_age=get_settings().session_hours * 3600)
        if result.get('auth') == 1 and isinstance(result.get('csrf'), str) and len(result['csrf']) > 20:
            return result
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        pass
    return None


def twilio_jwt(identity):
    s = get_settings()
    now = int(datetime.now(timezone.utc).timestamp())
    claims = {
        'jti': f'{s.twilio_api_key_sid}-{now}-{secrets.token_hex(8)}',
        'grants': {'identity': identity, 'voice': {'outgoing': {'application_sid': s.twilio_twiml_app_sid}}},
        'iat': now, 'nbf': now, 'exp': now + 180, 'iss': s.twilio_api_key_sid, 'sub': s.twilio_account_sid,
    }
    return jwt.encode(claims, s.twilio_api_key_secret, algorithm='HS256', headers={'typ': 'JWT', 'cty': 'twilio-fpa;v=1'})


def verify_twilio_signature(url, form, signature):
    """Signature for application/x-www-form-urlencoded requests, per Twilio validator.
    Canonical URL is server-configured: never trust attacker-supplied Host/X-Forwarded headers.
    """
    if not signature:
        return False
    content = url + ''.join(key + str(form[key]) for key in sorted(form))
    check = hmac.new(get_settings().twilio_auth_token.encode(), content.encode(), hashlib.sha1).digest()
    import base64
    return hmac.compare_digest(base64.b64encode(check).decode(), signature)
