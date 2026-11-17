"""Stripe-verified, single-redemption QR delivery for QR Call release artifacts.

A QR identifies a *permission*, never a shell command or direct binary URL.
Checkout session IDs are high-entropy bearer receipts. A cryptographically random
redemption code is generated only after a verified Stripe webhook, and GET does
not consume it, preventing link preview bots from burning purchases.
"""
import hmac
import io
import json
import re
import secrets
import time
from datetime import timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
import qrcode
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import CheckoutIntent, License, utcnow
from .security import digest, phone_encrypt, phone_decrypt, secure_token

router = APIRouter(prefix='/gate', tags=['download-gate'])
def aware(value):
    return value.replace(tzinfo=value.tzinfo or timezone.utc)


CS_ID = re.compile(r'^cs_(?:test|live)_[a-zA-Z0-9]{16,255}$')
CODE = re.compile(r'^[A-Za-z0-9_-]{32,128}$')


def stripe_signature_valid(payload: bytes, header: str, secret: str, now=None):
    if not secret or not header or len(payload) > 262144:
        return False
    fields = {}
    for entry in header.split(','):
        key, sep, value = entry.strip().partition('=')
        if sep and key in ('t', 'v1'):
            fields.setdefault(key, []).append(value)
    try:
        t = int(fields.get('t', [''])[0])
        moment = time.time() if now is None else now
        if abs(moment - t) > 300:
            return False
    except (ValueError, OverflowError):
        return False
    import hashlib
    body = str(t).encode() + b'.' + payload
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(value, expected) for value in fields.get('v1', []))


def release_file():
    s = get_settings()
    path = Path(s.release_artifact_path).resolve()
    if not path.is_file() or not path.name.endswith('.zip'):
        raise HTTPException(503, 'Release package has not been installed on the gateway')
    return path


@router.post('/checkout')
def checkout(request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    if not (s.stripe_secret_key and s.stripe_price_id and s.stripe_webhook_secret):
        raise HTTPException(503, 'Verified payment is not configured')
    release_file()
    ip = digest('ip:' + (request.client.host if request.client else 'unknown'))
    recent = utcnow() - timedelta(hours=1)
    attempts = db.scalar(select(func.count()).select_from(CheckoutIntent).where(
        CheckoutIntent.ip_hash == ip, CheckoutIntent.created_at >= recent))
    if attempts >= 6:
        raise HTTPException(429, 'Too many checkouts. Retry later')
    payload = {
        'mode': 'payment',
        'success_url': s.app_base_url + '/gate/success?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': s.pages_base_url or s.app_base_url,
        'line_items[0][price]': s.stripe_price_id,
        'line_items[0][quantity]': '1',
        'metadata[product]': 'qr-call',
        'metadata[release_policy]': 'lifetime-defined-scope',
        'expires_at': str(int(time.time()) + 1800),
    }
    try:
        with httpx.Client(timeout=12) as client:
            r = client.post('https://api.stripe.com/v1/checkout/sessions', data=payload,
                            auth=(s.stripe_secret_key, ''),
                            headers={'Idempotency-Key': secure_token()})
        if not r.is_success:
            raise HTTPException(502, 'Checkout provider could not create a session')
        data = r.json()
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(502, 'Checkout provider unavailable') from exc
    session_id = data.get('id', '')
    target = data.get('url', '')
    if not CS_ID.fullmatch(session_id) or not target.startswith('https://checkout.stripe.com/'):
        raise HTTPException(502, 'Unexpected checkout provider response')
    db.add(CheckoutIntent(stripe_session_id=session_id, status='pending', ip_hash=ip))
    db.commit()
    return {'checkout_url': target}


@router.post('/stripe/webhook')
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    body = await request.body()
    if not stripe_signature_valid(body, request.headers.get('stripe-signature', ''), s.stripe_webhook_secret):
        raise HTTPException(403, 'Invalid payment notification signature')
    try:
        event = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(400, 'Malformed payment notification') from exc
    if event.get('type') not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'):
        return {'received': True}
    obj = event.get('data', {}).get('object', {})
    sid = obj.get('id', '')
    if not CS_ID.fullmatch(sid):
        raise HTTPException(400, 'Invalid checkout session')
    if (obj.get('payment_status') != 'paid' or obj.get('mode') != 'payment' or
            obj.get('metadata', {}).get('product') != 'qr-call'):
        return {'received': True, 'activated': False}
    intent = db.scalar(select(CheckoutIntent).where(CheckoutIntent.stripe_session_id == sid).with_for_update())
    if intent is None:
        # Ignore any unrelated checkout, even if made from the same Stripe account.
        return {'received': True, 'activated': False}
    intent.status = 'paid'
    if not db.scalar(select(License.id).where(License.stripe_session_id == sid)):
        db.add(License(stripe_session_id=sid))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {'received': True, 'activated': True}


def paid_license(db: Session, sid: str):
    if not CS_ID.fullmatch(sid):
        raise HTTPException(404, 'Unknown checkout')
    result = db.scalar(select(License).where(License.stripe_session_id == sid).with_for_update())
    if result is None:
        raise HTTPException(409, 'Payment is not yet confirmed')
    return result


def mint_receipt(db: Session, sid: str):
    license_row = paid_license(db, sid)
    current = get_settings().release_version
    if license_row.download_version == current and license_row.consumed_at:
        return None
    if (license_row.download_version != current or license_row.qr_created_at is None or aware(license_row.qr_created_at) < utcnow() - timedelta(minutes=30)):
        code = secure_token()
        license_row.download_version = current
        license_row.consumed_at = None
        license_row.token_hash = digest('dl:' + code)
        license_row.token_ciphertext = phone_encrypt(code)
        license_row.qr_created_at = utcnow()
        db.commit()
    return phone_decrypt(license_row.token_ciphertext)


@router.get('/success', response_class=HTMLResponse)
def success(session_id: str, db: Session = Depends(get_db)):
    code = mint_receipt(db, session_id)
    if code is None:
        return HTMLResponse('<!doctype html><meta name="viewport" content="width=device-width"><title>QR Call</title><h1>Already redeemed</h1><p>Your one-time download credential has been used.</p>')
    link = get_settings().app_base_url + '/gate/code/' + code
    return HTMLResponse('<!doctype html><meta name="viewport" content="width=device-width"><title>QR Call download</title><main style="max-width:34rem;margin:4rem auto;font:1.1rem system-ui"><h1>Your QR Call download QR</h1><p>This code permits one download. It expires in 30 minutes and is invalid after redemption. Scan it from your phone, then confirm.</p><img alt="Single-use download QR" width="288" height="288" src="/gate/code/' + code + '/qr.png"><p><a rel="noreferrer" href="' + link + '">Open protected download link</a></p><p>After downloading, open the web app from the service URL and install it from your browser. SMS ownership verification is required before calling features can be activated.</p></main>', headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})


@router.get('/code/{code}/qr.png')
def download_qr(code: str, db: Session = Depends(get_db)):
    license_row = db.scalar(select(License).where(License.token_hash == digest('dl:' + code))) if CODE.fullmatch(code) else None
    if not license_row or license_row.download_version != get_settings().release_version or license_row.consumed_at or not license_row.qr_created_at or aware(license_row.qr_created_at) < utcnow() - timedelta(minutes=30):
        raise HTTPException(404, 'QR unavailable')
    qr = qrcode.make(get_settings().app_base_url + '/gate/code/' + code)
    out = io.BytesIO()
    qr.save(out, format='PNG')
    return Response(out.getvalue(), media_type='image/png', headers={'Cache-Control': 'no-store'})


@router.get('/code/{code}', response_class=HTMLResponse)
def redeem_page(code: str, db: Session = Depends(get_db)):
    if not CODE.fullmatch(code):
        raise HTTPException(404, 'Unknown download QR')
    l = db.scalar(select(License).where(License.token_hash == digest('dl:' + code)))
    if not l or l.download_version != get_settings().release_version or l.consumed_at or not l.qr_created_at or aware(l.qr_created_at) < utcnow() - timedelta(minutes=30):
        raise HTTPException(410, 'Download QR expired or used')
    return HTMLResponse('<!doctype html><meta name="viewport" content="width=device-width"><title>QR Call install</title><main style="max-width:30rem;margin:4rem auto;font:1.1rem system-ui"><h1>QR Call</h1><p>One-time protected download. Confirm to use the credential on this device. Link previews will not consume your download.</p><form method="post" action="/gate/code/' + code + '/redeem"><button type="submit" style="padding:1rem 2rem">Download QR Call</button></form></main>', headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'})


@router.post('/code/{code}/redeem')
def redeem(code: str, db: Session = Depends(get_db)):
    if not CODE.fullmatch(code):
        raise HTTPException(404, 'Unknown download QR')
    # On PostgreSQL with_for_update serializes simultaneous redemption attempts.
    l = db.scalar(select(License).where(License.token_hash == digest('dl:' + code)).with_for_update())
    if not l or l.download_version != get_settings().release_version or l.consumed_at or not l.qr_created_at or aware(l.qr_created_at) < utcnow() - timedelta(minutes=30):
        raise HTTPException(410, 'Download QR expired or used')
    artifact = release_file()
    l.consumed_at = utcnow()
    db.commit()
    return FileResponse(artifact, filename=artifact.name, media_type='application/zip',
                        headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})
