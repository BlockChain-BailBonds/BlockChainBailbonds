import io
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
import qrcode
import httpx
from fastapi import Depends, FastAPI, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from xml.etree.ElementTree import Element, SubElement, tostring

from .config import get_settings
from .db import Base, engine, get_db
from .models import AuthAttempt, Call, Code, Owner, PhoneVerification, License, utcnow
from .schedule import allowed, next_change, validate_schedule
from .verify import begin_verification, check_verification
from .gate import router as gate_router
from .security import (digest, new_login_session, phone_decrypt, phone_encrypt,
                       secure_token, twilio_jwt, verify_login_session,
                       verify_password, verify_twilio_signature)

ROOT = Path(__file__).resolve().parent
SETTINGS = get_settings()
SETTINGS.require_deployment()
app = FastAPI(title='918 QR Call', docs_url=None, redoc_url=None, openapi_url=None)
if SETTINGS.pages_base_url:
    app.add_middleware(CORSMiddleware, allow_origins=[SETTINGS.pages_base_url.rstrip('/')], allow_credentials=False, allow_methods=['GET','POST','PUT'], allow_headers=['Authorization','Content-Type','X-CSRF-Token'], max_age=600)
app.include_router(gate_router)
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
templates = Jinja2Templates(directory=str(ROOT / 'templates'))


@app.on_event('startup')
def initialize_database():
    Base.metadata.create_all(engine)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(self), geolocation=()'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = (
        "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
        "script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "connect-src 'self' https://eventgw.twilio.com https://media.twiliocdn.com "
        "https://sdk.twilio.com https://*.twilio.com wss://*.twilio.com; "
        "media-src 'self' blob:; font-src 'self'; form-action 'self'"
    )
    if SETTINGS.app_base_url.startswith('https://'):
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


def now_utc():
    return datetime.now(timezone.utc)


def client_id(request):
    return digest('ip:' + (request.client.host if request.client else 'unknown'))


def admin_user(request: Request):
    session = verify_login_session(request.cookies.get('qrcall_session', ''))
    if session is None:
        raise HTTPException(401, 'Sign in required')
    return session


def verified_owner(db: Session = Depends(get_db), session=Depends(admin_user)):
    if SETTINGS.require_license and not db.scalar(select(License.id).limit(1)):
        raise HTTPException(402, 'Paid license activation required')
    if not session.get('phone_verified') or db.scalar(select(Owner.id).limit(1)) is None:
        raise HTTPException(403, 'SMS verification required before QR Call can operate')
    return session


def verified_edit(request: Request, session=Depends(verified_owner)):
    token = request.headers.get('x-csrf-token', '')
    if not secrets.compare_digest(token, session['csrf']):
        raise HTTPException(403, 'CSRF validation failed')
    return session


def authorize_edit(request: Request, session=Depends(admin_user)):
    token = request.headers.get('x-csrf-token', '')
    if not secrets.compare_digest(token, session['csrf']):
        raise HTTPException(403, 'CSRF validation failed')
    return session


def e164(value):
    if not re.fullmatch(r'\+1[2-9][0-9]{9}', value):
        raise ValueError('MVP supports US/NANP destination numbers in +1XXXXXXXXXX format')
    return value


def get_code(db, token):
    if not 32 <= len(token) <= 128 or not re.fullmatch(r'[A-Za-z0-9_-]+', token):
        return None
    return db.scalar(select(Code).where(Code.token_hash == digest('qr:' + token)))


def public_status(db, code, at=None):
    at = at or now_utc()
    if not code:
        return {'status': 'invalid', 'available': False, 'next_change': None}
    change = next_change(code, at)
    if not code.enabled:
        status = 'revoked'
    elif not allowed(code, at):
        status = 'scheduled_closed'
    elif (SETTINGS.require_license and not db.scalar(select(License.id).limit(1))):
        status = 'not_licensed'
    elif not db.scalar(select(Owner.id).limit(1)):
        status = 'unconfigured'
    elif code.max_calls is not None and code.used_calls >= code.max_calls:
        status = 'limit_reached'
    elif db.scalar(select(Call.id).where(Call.code_id == code.id,
            Call.status == 'dialed', Call.created_at >= at - timedelta(hours=1)).limit(1)):
        status = 'busy'
    else:
        status = 'available'
    return {'status': status, 'available': status == 'available',
            'server_now': at.isoformat(), 'next_change': change.isoformat() if change else None,
            'timezone': code.timezone}


@app.get('/sw.js', include_in_schema=False)
def service_worker():
    return FileResponse(ROOT / 'static' / 'sw.js', media_type='application/javascript',
                        headers={'Service-Worker-Allowed': '/', 'Cache-Control': 'no-cache'})


@app.get('/healthz')
def healthz(db: Session = Depends(get_db)):
    db.execute(select(func.count()).select_from(Code)).scalar()
    return {'status': 'ok', 'service': 'qr-call'}


@app.get('/')
def index(request: Request):
    return RedirectResponse('/admin' if verify_login_session(request.cookies.get('qrcall_session', '')) else '/login', status_code=303)


@app.get('/login', response_class=HTMLResponse)
def login_page(request: Request):
    if verify_login_session(request.cookies.get('qrcall_session', '')):
        return RedirectResponse('/admin', status_code=303)
    return templates.TemplateResponse(request, 'login.html', {'message': None})


@app.post('/login')
def login(request: Request, password: str = Form(...), db: Session = Depends(get_db)):
    ip = client_id(request)
    cutoff = now_utc() - timedelta(minutes=15)
    count = db.scalar(select(func.count()).select_from(AuthAttempt).where(
        AuthAttempt.ip_hash == ip, AuthAttempt.created_at >= cutoff))
    if count >= 8:
        return templates.TemplateResponse(request, 'login.html', {'message': 'Too many attempts. Retry in 15 minutes.'}, status_code=429)
    if not verify_password(password):
        db.add(AuthAttempt(ip_hash=ip))
        db.commit()
        return templates.TemplateResponse(request, 'login.html', {'message': 'Invalid credentials.'}, status_code=401)
    cookie, _ = new_login_session()
    response = RedirectResponse('/admin', status_code=303)
    response.set_cookie('qrcall_session', cookie, secure=SETTINGS.app_base_url.startswith('https://'),
                        httponly=True, samesite='strict', max_age=SETTINGS.session_hours * 3600)
    return response


@app.post('/logout')
def logout(request: Request, session=Depends(authorize_edit)):
    response = RedirectResponse('/login', status_code=303)
    response.delete_cookie('qrcall_session')
    return response


@app.get('/admin', response_class=HTMLResponse)
def admin_page(request: Request):
    session = verify_login_session(request.cookies.get('qrcall_session', ''))
    if not session:
        return RedirectResponse('/login', status_code=303)
    return templates.TemplateResponse(request, 'admin.html', {'csrf': session['csrf'], 'phone_verified': session.get('phone_verified', False)})


class PhoneInput(BaseModel):
    phone: str


@app.get('/api/owner')
def owner_get(db: Session = Depends(get_db), session=Depends(admin_user)):
    owner = db.scalar(select(Owner).limit(1))
    if not owner:
        return {'configured': False, 'masked': None, 'activated': False}
    phone = phone_decrypt(owner.phone_ciphertext)
    return {'configured': True, 'masked': '••• ••• ' + phone[-4:], 'activated': bool(session.get('phone_verified'))}


class VerifyStart(BaseModel):
    phone: str
    channel: str = 'sms'


class VerifyCheck(BaseModel):
    code: str


@app.post('/api/owner/verify/start')
def owner_verification_start(data: VerifyStart, db: Session = Depends(get_db), session=Depends(authorize_edit)):
    try:
        phone = e164(data.phone.strip())
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    if data.channel != 'sms':
        raise HTTPException(422, 'QR Call requires independent SMS ownership verification')
    if SETTINGS.require_license and not db.scalar(select(License.id).limit(1)):
        raise HTTPException(402, 'Purchase activation required before SMS registration')
    existing_owner = db.scalar(select(Owner).limit(1))
    if existing_owner and phone_decrypt(existing_owner.phone_ciphertext) != phone:
        raise HTTPException(403, 'For security, verify the currently registered phone; contact support for a recovery transfer')
    cutoff = now_utc() - timedelta(hours=1)
    phone_hash = digest('phone:' + phone)
    attempts = db.scalar(select(func.count()).select_from(PhoneVerification).where(PhoneVerification.created_at >= cutoff))
    to_same = db.scalar(select(func.count()).select_from(PhoneVerification).where(
        PhoneVerification.created_at >= cutoff, PhoneVerification.phone_hash == phone_hash))
    if attempts >= 6 or to_same >= 3:
        raise HTTPException(429, 'Too many verification requests. Retry later.')
    result = begin_verification(phone, data.channel)
    if result.get('status') != 'pending':
        raise HTTPException(502, 'Verification provider did not accept the verification request.')
    db.add(PhoneVerification(phone_ciphertext=phone_encrypt(phone), phone_hash=phone_hash))
    db.commit()
    return {'sent': True, 'channel': data.channel, 'masked': '••• ••• ' + phone[-4:]}


@app.post('/api/owner/verify/check')
def owner_verification_check(data: VerifyCheck, db: Session = Depends(get_db), session=Depends(authorize_edit)):
    if not re.fullmatch(r'\d{4,10}', data.code):
        raise HTTPException(422, 'Enter the numeric code from your verification message')
    pending = db.scalar(select(PhoneVerification).where(PhoneVerification.verified.is_(False)).order_by(
        PhoneVerification.id.desc()).with_for_update().limit(1))
    if not pending or pending.created_at.replace(tzinfo=pending.created_at.tzinfo or timezone.utc) < now_utc() - timedelta(minutes=10):
        raise HTTPException(403, 'Verification has expired. Request a new code.')
    if pending.check_attempts >= 5:
        raise HTTPException(429, 'Too many incorrect verification attempts.')
    pending.check_attempts += 1
    db.commit()
    response = check_verification(phone_decrypt(pending.phone_ciphertext), data.code)
    if response.get('status') != 'approved':
        raise HTTPException(403, 'Verification code is incorrect or expired.')
    # Prevent an old/parallel verification from overwriting a newer phone request.
    latest = db.scalar(select(PhoneVerification.id).order_by(PhoneVerification.id.desc()).limit(1))
    if latest != pending.id:
        raise HTTPException(409, 'A newer verification was requested. Approve the latest one.')
    owner = db.scalar(select(Owner).with_for_update().limit(1))
    if owner:
        owner.phone_ciphertext = pending.phone_ciphertext
    else:
        db.add(Owner(phone_ciphertext=pending.phone_ciphertext))
    pending.verified = True
    db.commit()
    cookie, _ = new_login_session(csrf=session['csrf'], phone_verified=True)
    response = JSONResponse({'verified': True, 'activated': True, 'masked': '••• ••• ' + phone_decrypt(pending.phone_ciphertext)[-4:]})
    response.set_cookie('qrcall_session', cookie, secure=SETTINGS.app_base_url.startswith('https://'),
                        httponly=True, samesite='strict', max_age=SETTINGS.session_hours * 3600)
    return response


class ScheduleInput(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    timezone: str = Field(default='America/Chicago', max_length=80)
    start_at: datetime | None = None
    end_at: datetime | None = None
    windows: list[dict] = Field(default_factory=list)
    max_calls: int | None = Field(default=None, ge=1, le=10000)


def validated(data):
    try:
        validate_schedule(data.timezone, data.windows, data.start_at, data.end_at)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


def serialize_code(c):
    token = phone_decrypt(c.token_ciphertext)
    return {'id': c.public_id, 'label': c.label, 'enabled': c.enabled,
            'url': f'{SETTINGS.app_base_url}/c/{quote(token)}', 'created_at': c.created_at.isoformat(),
            'timezone': c.timezone, 'windows': c.windows,
            'start_at': c.start_at.isoformat() if c.start_at else None,
            'end_at': c.end_at.isoformat() if c.end_at else None, 'max_calls': c.max_calls, 'used_calls': c.used_calls}


@app.get('/api/codes')
def list_codes(db: Session = Depends(get_db), session=Depends(verified_owner)):
    codes = db.scalars(select(Code).order_by(Code.id.desc()).limit(300)).all()
    return {'codes': [serialize_code(c) for c in codes]}


@app.post('/api/codes', status_code=201)
def create_code(data: ScheduleInput, db: Session = Depends(get_db), session=Depends(verified_edit)):
    validated(data)
    token = secure_token()
    code = Code(public_id=secrets.token_hex(12), token_hash=digest('qr:' + token),
                token_ciphertext=phone_encrypt(token), label=data.label.strip(),
                timezone=data.timezone, windows=data.windows, start_at=data.start_at,
                end_at=data.end_at, max_calls=data.max_calls, enabled=True)
    if not code.label:
        raise HTTPException(422, 'Label cannot be blank')
    db.add(code)
    db.commit()
    return serialize_code(code)


@app.put('/api/codes/{public_id}')
def update_code(public_id: str, data: ScheduleInput, db: Session = Depends(get_db), session=Depends(verified_edit)):
    validated(data)
    code = db.scalar(select(Code).where(Code.public_id == public_id).with_for_update())
    if not code:
        raise HTTPException(404, 'Unknown code')
    if not data.label.strip():
        raise HTTPException(422, 'Label cannot be blank')
    code.label = data.label.strip()
    code.timezone = data.timezone
    code.windows = data.windows
    code.start_at = data.start_at
    code.end_at = data.end_at
    code.max_calls = data.max_calls
    db.commit()
    return serialize_code(code)


def terminate_twilio_call(call_sid):
    """Best-effort hangup of an established/connecting call after revocation."""
    if not re.fullmatch(r'CA[a-fA-F0-9]{32}', call_sid or ''):
        return False
    url = f'https://api.twilio.com/2010-04-01/Accounts/{SETTINGS.twilio_account_sid}/Calls/{call_sid}.json'
    try:
        with httpx.Client(timeout=4.0) as client:
            response = client.post(url, data={'Status': 'completed'},
                auth=(SETTINGS.twilio_api_key_sid, SETTINGS.twilio_api_key_secret))
        return response.is_success
    except httpx.HTTPError:
        return False


@app.post('/api/codes/{public_id}/revoke')
def revoke_code(public_id: str, db: Session = Depends(get_db), session=Depends(verified_edit)):
    code = db.scalar(select(Code).where(Code.public_id == public_id).with_for_update())
    if not code:
        raise HTTPException(404, 'Unknown code')
    code.enabled = False
    active_sids = db.scalars(select(Call.call_sid).where(Call.code_id == code.id,
        Call.status == 'dialed', Call.call_sid.is_not(None),
        Call.created_at >= now_utc() - timedelta(hours=1))).all()
    db.commit()
    hung_up = [terminate_twilio_call(sid) for sid in active_sids]
    return {'ok': True, 'enabled': False,
            'active_calls_found': len(active_sids),
            'active_calls_termination_confirmed': sum(hung_up)}


@app.get('/api/codes/{public_id}/qr.png')
def qr_image(public_id: str, db: Session = Depends(get_db), session=Depends(verified_owner)):
    code = db.scalar(select(Code).where(Code.public_id == public_id))
    if not code:
        raise HTTPException(404, 'Unknown code')
    data = serialize_code(code)
    out = io.BytesIO()
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=12, border=4)
    qr.add_data(data['url'])
    qr.make(fit=True)
    qr.make_image(fill_color='black', back_color='white').save(out, format='PNG')
    return Response(out.getvalue(), media_type='image/png', headers={'Content-Disposition': 'inline; filename="qr-call-access.png"'})


@app.get('/c/{token}', response_class=HTMLResponse)
def caller_page(token: str, request: Request, db: Session = Depends(get_db)):
    if not get_code(db, token):
        raise HTTPException(404, 'Unknown code')
    return templates.TemplateResponse(request, 'call.html', {'token': token})


@app.get('/api/c/{token}/state')
def caller_state(token: str, db: Session = Depends(get_db)):
    return public_status(db, get_code(db, token))


@app.post('/api/c/{token}/prepare')
def prepare_call(token: str, request: Request, db: Session = Depends(get_db)):
    # Lock the code to serialize concurrent authorizations under PostgreSQL.
    code = get_code(db, token)
    if not code:
        raise HTTPException(404, 'Invalid QR code')
    code = db.scalar(select(Code).where(Code.id == code.id).with_for_update())
    at = now_utc()
    state = public_status(db, code, at)
    if not state['available']:
        raise HTTPException(403, {'status': state['status']})
    hour = at - timedelta(hours=1)
    code_preps = db.scalar(select(func.count()).select_from(Call).where(
        Call.code_id == code.id, Call.created_at >= hour))
    ip_preps = db.scalar(select(func.count()).select_from(Call).where(
        Call.ip_hash == client_id(request), Call.created_at >= hour))
    if code_preps >= SETTINGS.max_prepares_per_hour or ip_preps >= SETTINGS.max_prepares_per_ip_hour:
        raise HTTPException(429, 'Calling limit reached. Try later.')
    session = secure_token()
    identity = 'guest_' + secrets.token_hex(16)
    db.add(Call(code_id=code.id, session_hash=digest('call:' + session),
                caller_identity=identity, ip_hash=client_id(request), status='prepared'))
    db.commit()
    return {'voice_token': twilio_jwt(identity), 'session': session, 'expires_in_seconds': 180}


def twiml_error():
    root = Element('Response')
    SubElement(root, 'Reject', {'reason': 'rejected'})
    return Response(tostring(root, encoding='unicode'), media_type='application/xml')


async def trusted_twilio_form(request: Request):
    if request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/x-www-form-urlencoded':
        raise HTTPException(415, 'Unsupported webhook content type')
    raw = await request.body()
    if len(raw) > 8192:
        raise HTTPException(413, 'Oversized webhook')
    # Reject duplicate fields to avoid ambiguity between signature validation and application logic.
    from urllib.parse import parse_qsl
    pairs = parse_qsl(raw.decode('utf-8'), keep_blank_values=True)
    if len(pairs) != len({key for key, value in pairs}):
        raise HTTPException(403, 'Ambiguous webhook')
    form = dict(pairs)
    url = SETTINGS.app_base_url + request.url.path
    if request.url.query:
        url += '?' + request.url.query
    if not verify_twilio_signature(url, form, request.headers.get('x-twilio-signature', '')):
        raise HTTPException(403, 'Invalid Twilio signature')
    if form.get('AccountSid') != SETTINGS.twilio_account_sid:
        raise HTTPException(403, 'Unexpected Twilio account')
    return form


@app.post('/twilio/voice')
async def twilio_voice(request: Request, db: Session = Depends(get_db)):
    form = await trusted_twilio_form(request)
    session = form.get('session', '')
    call_sid = form.get('CallSid', '')
    if not session or not re.fullmatch(r'CA[a-fA-F0-9]{32}', call_sid):
        return twiml_error()
    row = db.scalar(select(Call).where(Call.session_hash == digest('call:' + session)).with_for_update())
    if not row or row.status != 'prepared' or row.created_at.replace(tzinfo=row.created_at.tzinfo or timezone.utc) < now_utc() - timedelta(seconds=180):
        return twiml_error()
    if form.get('From') != 'client:' + row.caller_identity:
        return twiml_error()
    code = db.scalar(select(Code).where(Code.id == row.code_id).with_for_update())
    if not code or not allowed(code, now_utc()):
        return twiml_error()
    owner = db.scalar(select(Owner).limit(1))
    if not owner:
        return twiml_error()
    if code.max_calls is not None and code.used_calls >= code.max_calls:
        return twiml_error()
    if db.scalar(select(Call.id).where(Call.code_id == code.id, Call.status == 'dialed',
            Call.created_at >= now_utc() - timedelta(hours=1)).limit(1)):
        return twiml_error()
    code.used_calls += 1
    row.status = 'dialed'
    row.call_sid = call_sid
    db.commit()
    root = Element('Response')
    dial = SubElement(root, 'Dial', {
        'callerId': SETTINGS.twilio_caller_id, 'answerOnBridge': 'true',
        'record': 'do-not-record', 'timeout': '25', 'timeLimit': str(SETTINGS.max_call_seconds),
        'action': SETTINGS.app_base_url + '/twilio/complete', 'method': 'POST',
    })
    SubElement(dial, 'Number').text = phone_decrypt(owner.phone_ciphertext)
    return Response(tostring(root, encoding='unicode'), media_type='application/xml')


@app.post('/twilio/complete')
async def twilio_complete(request: Request, db: Session = Depends(get_db)):
    form = await trusted_twilio_form(request)
    sid = form.get('CallSid', '')
    row = db.scalar(select(Call).where(Call.call_sid == sid).with_for_update())
    if row and row.status == 'dialed':
        row.status = 'completed'
        row.dial_status = form.get('DialCallStatus', '')[:32]
        db.commit()
    root = Element('Response')
    SubElement(root, 'Hangup')
    return Response(tostring(root, encoding='unicode'), media_type='application/xml')


@app.get('/api/events')
def events(db: Session = Depends(get_db), session=Depends(verified_owner)):
    rows = db.execute(select(Call, Code.label).join(Code, Call.code_id == Code.id).order_by(Call.id.desc()).limit(100)).all()
    return {'events': [{'code_label': c, 'created_at': r.created_at.isoformat(), 'status': r.status,
                        'dial_status': r.dial_status} for r, c in rows]}
