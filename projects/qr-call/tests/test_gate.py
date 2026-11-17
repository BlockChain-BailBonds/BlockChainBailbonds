import hashlib
import hmac
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZipFile

from app.config import get_settings
from app.db import SessionLocal
from app.models import CheckoutIntent, License
from app.gate import stripe_signature_valid
from app.qr_commands import parse_qr_command
from sqlalchemy import select


def stripe_event(sid):
    return {'id': 'evt_test_qrcall', 'type': 'checkout.session.completed',
            'data': {'object': {'id': sid, 'payment_status': 'paid', 'mode': 'payment',
                                'metadata': {'product': 'qr-call'}}}}


def signed_webhook(client, obj, secret, timestamp=None, valid=True):
    raw = json.dumps(obj, separators=(',', ':')).encode()
    t = int(time.time()) if timestamp is None else timestamp
    sig = hmac.new(secret.encode(), str(t).encode() + b'.' + raw, hashlib.sha256).hexdigest()
    return client.post('/gate/stripe/webhook', content=raw,
                       headers={'Content-Type': 'application/json',
                                'Stripe-Signature': f't={t},v1={sig if valid else "0"*64}'})


def prepare_gate(monkeypatch, tmp_path):
    cfg = get_settings()
    monkeypatch.setattr(cfg, 'stripe_webhook_secret', 'whsec_' + 'z'*48)
    monkeypatch.setattr(cfg, 'require_license', True)
    artifact = tmp_path / 'QR-Call-v1.0.0.zip'
    with ZipFile(artifact, 'w') as zipf:
        zipf.writestr('README.md', '# QR Call verified release')
    monkeypatch.setattr(cfg, 'release_artifact_path', str(artifact))
    return cfg


def test_reject_unpaid_unverified_app(client, monkeypatch, tmp_path):
    prepare_gate(monkeypatch, tmp_path)
    assert client.post('/login', data={'password': 'test-password-123456'}, follow_redirects=False).status_code == 303
    assert client.get('/api/codes').status_code == 402
    html = client.get('/admin').text
    assert 'verified-workspace' in html and 'hidden' in html
    assert client.post('/api/owner/verify/start', json={'phone': '+14155550122'}).status_code == 403  # CSRF must pass first
    import re
    csrf = re.search(r'<meta name="csrf-token" content="([^"]+)">', html).group(1)
    client.headers.update({'X-CSRF-Token': csrf})
    assert client.post('/api/owner/verify/start', json={'phone': '+14155550122'}).status_code == 402


def test_verified_payment_to_single_use_qr(client, monkeypatch, tmp_path):
    cfg = prepare_gate(monkeypatch, tmp_path)
    sid = 'cs_test_' + 'A'*28
    with SessionLocal() as db:
        db.add(CheckoutIntent(stripe_session_id=sid))
        db.commit()
    assert signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret, valid=False).status_code == 403
    assert signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret,
                          timestamp=int(time.time())-400).status_code == 403
    valid = signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret)
    assert valid.status_code == 200 and valid.json()['activated'] is True
    assert signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret).status_code == 200
    with SessionLocal() as db:
        assert len(db.scalars(select(License)).all()) == 1
    result = client.get('/gate/success', params={'session_id': sid})
    assert result.status_code == 200
    code = re.search(r'/gate/code/([A-Za-z0-9_-]{32,128})', result.text).group(1)
    assert code not in result.headers.get('location', '')
    assert client.get('/gate/code/' + code + '/qr.png').content[:8] == b'\x89PNG\r\n\x1a\n'
    assert client.get('/gate/code/' + code).status_code == 200
    assert client.get('/gate/code/' + code).status_code == 200  # preview must not redeem
    download = client.post('/gate/code/' + code + '/redeem')
    assert download.status_code == 200
    assert download.content[:2] == b'PK'
    assert client.post('/gate/code/' + code + '/redeem').status_code == 410
    assert client.get('/gate/code/' + code).status_code == 410
    assert 'Already redeemed' in client.get('/gate/success', params={'session_id': sid}).text


def test_unknown_checkout_cannot_activate(client, monkeypatch, tmp_path):
    cfg = prepare_gate(monkeypatch, tmp_path)
    sid = 'cs_test_' + 'B'*28
    webhook = signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret)
    assert webhook.status_code == 200 and webhook.json()['activated'] is False
    assert client.get('/gate/success', params={'session_id': sid}).status_code == 409
    assert client.get('/gate/code/' + 'A'*43).status_code == 410


def test_qr_command_rejects_arbitrary_execution_and_foreign_origins():
    prefix = 'https://call.example.com'
    for path, kind in [('/c/'+'a'*43, 'call'), ('/gate/code/'+'b'*43, 'download')]:
        command = parse_qr_command(prefix + path, prefix)
        assert command.kind == kind
    malicious = [
        'qrcall:exec:rm -rf /',
        'https://evil.example/c/'+'a'*43,
        prefix+'/admin',
        prefix+'/c/'+'a'*43+'?exec=1',
        prefix+'/c/'+'a'*43+'#fragment',
        prefix+'/c/../../admin',
        'javascript:alert(1)',
        'file:///etc/passwd',
        prefix+'@bad.example/c/'+'a'*43,
        prefix+'/gate/code/short',
    ]
    for raw in malicious:
        try:
            parse_qr_command(raw, prefix)
        except ValueError:
            continue
        raise AssertionError('Unsafe QR command accepted: ' + raw)


def test_expired_download_refused(client, monkeypatch, tmp_path):
    cfg = prepare_gate(monkeypatch, tmp_path)
    sid = 'cs_test_' + 'C'*28
    with SessionLocal() as db:
        db.add(CheckoutIntent(stripe_session_id=sid))
        db.commit()
    signed_webhook(client, stripe_event(sid), cfg.stripe_webhook_secret)
    code = re.search(r'/gate/code/([A-Za-z0-9_-]{32,128})', client.get('/gate/success', params={'session_id': sid}).text).group(1)
    with SessionLocal() as db:
        l = db.scalar(select(License).where(License.stripe_session_id == sid))
        l.qr_created_at = datetime.now(timezone.utc) - timedelta(minutes=31)
        db.commit()
    assert client.get('/gate/code/' + code).status_code == 410
    assert client.post('/gate/code/' + code + '/redeem').status_code == 410
    # A recovered receipt may obtain a newly issued QR, but cannot reuse the old one.
    newer = re.search(r'/gate/code/([A-Za-z0-9_-]{32,128})', client.get('/gate/success', params={'session_id': sid}).text).group(1)
    assert newer != code
    assert client.post('/gate/code/' + newer + '/redeem').status_code == 200
