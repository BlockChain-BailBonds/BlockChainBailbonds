"""Provision a production .env with unique secrets; never print credentials."""
import getpass
import re
import secrets
from pathlib import Path
from argon2 import PasswordHasher
from cryptography.fernet import Fernet


def validate(name, value, expression):
    if not re.fullmatch(expression, value):
        raise ValueError(f'Invalid {name}')
    return value


def configure():
    target = Path('.env')
    if target.exists():
        raise SystemExit('Refusing to replace existing .env; back it up and rotate secrets deliberately.')
    print('918 QR Call secure provisioning. Input is stored only in local .env (mode 0600).')
    domain = validate('domain', input('Public DNS hostname (e.g. call.example.com): ').strip(), r'[A-Za-z0-9](?:[A-Za-z0-9.-]{1,251}[A-Za-z0-9])?')
    password = getpass.getpass('New administrator password (minimum 16 characters): ')
    confirmation = getpass.getpass('Confirm password: ')
    if len(password) < 16 or password != confirmation:
        raise SystemExit('Passwords must match and be at least 16 characters.')
    values = {
        'DOMAIN': domain.lower(),
        'APP_BASE_URL': 'https://' + domain.lower(),
        'ENVIRONMENT': 'production',
        'POSTGRES_PASSWORD': secrets.token_hex(24),
        'APP_SECRET': secrets.token_urlsafe(48),
        'ENCRYPTION_KEY': Fernet.generate_key().decode(),
        'ADMIN_PASSWORD_HASH': PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2).hash(password),
        'TWILIO_ACCOUNT_SID': validate('Twilio Account SID', getpass.getpass('Twilio Account SID (AC...): ').strip(), r'AC[a-fA-F0-9]{32}'),
        'TWILIO_API_KEY_SID': validate('Twilio API Key SID', getpass.getpass('Twilio API Key SID (SK...): ').strip(), r'SK[a-fA-F0-9]{32}'),
        'TWILIO_API_KEY_SECRET': getpass.getpass('Twilio API Key secret: ').strip(),
        'TWILIO_AUTH_TOKEN': getpass.getpass('Twilio Auth Token: ').strip(),
        'TWILIO_TWIML_APP_SID': validate('Twilio TwiML App SID', getpass.getpass('Twilio TwiML App SID (AP...): ').strip(), r'AP[a-fA-F0-9]{32}'),
        'TWILIO_VERIFY_SERVICE_SID': validate('Twilio Verify Service SID', getpass.getpass('Twilio Verify Service SID (VA...): ').strip(), r'VA[a-fA-F0-9]{32}'),
        'TWILIO_CALLER_ID': validate('Twilio caller ID', input('Twilio purchased Voice caller ID (e.g. +15551234567): ').strip(), r'\+1[2-9][0-9]{9}'),
        'STRIPE_SECRET_KEY': getpass.getpass('Stripe restricted/live secret key: ').strip(),
        'STRIPE_PRICE_ID': validate('Stripe one-time Price ID', input('Stripe one-time Price ID (price_...): ').strip(), r'price_[A-Za-z0-9_]{8,}'),
        'STRIPE_WEBHOOK_SECRET': getpass.getpass('Stripe webhook signing secret (whsec_...): ').strip(),
        'PAGES_BASE_URL': input('Your GitHub Pages site HTTPS URL (may be empty): ').strip().rstrip('/'),
        'RELEASE_ARTIFACT_PATH': 'private_download/QR-Call-v1.0.0.zip',
    }
    if any(not values[k] for k in ('TWILIO_API_KEY_SECRET', 'TWILIO_AUTH_TOKEN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')):
        raise SystemExit('Twilio credentials must not be blank.')
    import urllib.parse
    values['DATABASE_URL'] = 'postgresql+psycopg://qrcall:' + values['POSTGRES_PASSWORD'] + '@database:5432/qrcall'
    fd = target.open('x')
    try:
        target.chmod(0o600)
        for key, value in values.items():
            if '\n' in value or '\r' in value:
                raise ValueError('Configuration values cannot contain line breaks')
            fd.write(key + '=' + value + '\n')
    finally:
        fd.close()
    print('Created .env with strong secrets. Keep it private; losing ENCRYPTION_KEY makes the saved phone number and codes unreadable.')
    print('Set the TwiML App Voice URL to https://' + domain.lower() + '/twilio/voice using POST.')
    print('Set Stripe webhook URL https://' + domain.lower() + '/gate/stripe/webhook and listen for checkout.session.completed and checkout.session.async_payment_succeeded.')
    print('Build release ZIP with python tools/build_release.py before starting Docker Compose.')
    print('Then run: docker compose up -d --build')


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2 or sys.argv[1] != 'configure':
        raise SystemExit('Usage: python -m app.manage configure')
    configure()
