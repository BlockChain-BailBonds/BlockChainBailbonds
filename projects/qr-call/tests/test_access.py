import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from app.schedule import allowed, next_change, validate_schedule
from app.security import verify_twilio_signature
from app.config import get_settings
import jwt


def issue(client, **kwargs):
    value = {'label': 'Contractor', 'timezone': 'America/Chicago', 'windows': [],
             'start_at': None, 'end_at': None, 'max_calls': None} | kwargs
    response = client.post('/api/codes', json=value)
    assert response.status_code == 201, response.text
    return response.json()


def raw_token(code):
    return code['url'].rsplit('/', 1)[-1]


def public(client, code):
    return client.get('/api/c/' + raw_token(code) + '/state')


def prepare(client, code):
    return client.post('/api/c/' + raw_token(code) + '/prepare')


def webhook(client, path, values, signed=True):
    values = {'AccountSid': get_settings().twilio_account_sid} | values
    url = get_settings().app_base_url + path
    packed = url + ''.join(key + str(values[key]) for key in sorted(values))
    sig = base64.b64encode(hmac.new(get_settings().twilio_auth_token.encode(),packed.encode(),hashlib.sha1).digest()).decode()
    headers = {'X-Twilio-Signature': sig if signed else 'invalid'}
    return client.post(path, data=values, headers=headers)


def dial(client, prep):
    token = jwt.decode(prep['voice_token'], get_settings().twilio_api_key_secret, algorithms=['HS256'], audience=None)
    identity = token['grants']['identity']
    return webhook(client, '/twilio/voice', {
        'session': prep['session'], 'From': 'client:' + identity,
        'CallSid': 'CA' + 'd' * 32,
    })


def test_owner_auth_and_csrf(client):
    assert client.get('/api/codes').status_code == 401
    assert client.post('/api/owner/verify/start', json={'phone': '+14155550122'}).status_code == 401
    assert client.post('/login', data={'password': 'wrong'}).status_code == 401
    assert client.post('/login', data={'password':'test-password-123456'}, follow_redirects=False).status_code == 303
    assert client.get('/admin').status_code == 200
    assert client.post('/api/owner/verify/start', json={'phone': '+14155550122'}).status_code == 403


def test_issue_qr_privacy_and_revoke(owner_client):
    c = issue(owner_client)
    assert c['url'].startswith('http://localhost/c/')
    assert '+14155550122' not in str(c)
    public_page = owner_client.get('/c/' + raw_token(c))
    assert public_page.status_code == 200
    assert '+14155550122' not in public_page.text
    state = public(owner_client,c).json()
    assert state['available'] is True
    assert '+14155550122' not in str(state)
    qr = owner_client.get('/api/codes/' + c['id'] + '/qr.png')
    assert qr.status_code == 200
    assert qr.content[:8] == b'\x89PNG\r\n\x1a\n'
    assert owner_client.post('/api/codes/' + c['id'] + '/revoke').status_code == 200
    assert public(owner_client,c).json()['status'] == 'revoked'
    assert prepare(owner_client,c).status_code == 403
    assert owner_client.get('/api/owner').json()['masked'].endswith('0122')
    assert '+14155550122' not in str(owner_client.get('/api/events').json())


def test_timer_absolute(owner_client):
    now = datetime.now(timezone.utc)
    c = issue(owner_client, start_at=(now+timedelta(minutes=10)).isoformat(),
              end_at=(now+timedelta(hours=2)).isoformat())
    assert public(owner_client,c).json()['status'] == 'scheduled_closed'
    assert prepare(owner_client,c).status_code == 403
    before = public(owner_client,c).json()['next_change']
    assert before is not None
    payload = {'label':'Now','timezone':'America/Chicago','start_at':(now-timedelta(minutes=10)).isoformat(),
               'end_at':(now+timedelta(minutes=10)).isoformat(),'windows':[],'max_calls':None}
    assert owner_client.put('/api/codes/' + c['id'], json=payload).status_code == 200
    assert public(owner_client,c).json()['available']
    assert prepare(owner_client,c).status_code == 200


def test_weekday_window_and_overnight():
    class C:
        enabled=True
        timezone='America/Chicago'
        start_at=None
        end_at=None
        windows=[{'days':[0],'start':'22:00','end':'02:00'}]
    mon = datetime(2026,11,16,23,0,tzinfo=ZoneInfo('America/Chicago'))
    tue = datetime(2026,11,17,1,0,tzinfo=ZoneInfo('America/Chicago'))
    tue_late = datetime(2026,11,17,3,0,tzinfo=ZoneInfo('America/Chicago'))
    sun = datetime(2026,11,15,23,0,tzinfo=ZoneInfo('America/Chicago'))
    assert allowed(C,mon) and allowed(C,tue)
    assert not allowed(C,tue_late) and not allowed(C,sun)
    assert next_change(C,mon) == datetime(2026,11,17,2,0,tzinfo=ZoneInfo('America/Chicago')).astimezone(timezone.utc)


def test_weekly_window_validation():
    for windows in [ [{'days':[],'start':'09:00','end':'18:00'}],
                     [{'days':[9],'start':'09:00','end':'18:00'}],
                     [{'days':[1],'start':'25:00','end':'18:00'}],
                     [{'days':[1],'start':'09:00','end':'09:00'}] ]:
        try: validate_schedule('America/Chicago',windows,None,None)
        except ValueError: continue
        assert False, f'Accepted malformed window {windows}'


def test_twilio_signed_routing_and_replay(owner_client):
    c = issue(owner_client, max_calls=1)
    prepared = prepare(owner_client,c)
    assert prepared.status_code == 200
    claims = jwt.decode(prepared.json()['voice_token'], get_settings().twilio_api_key_secret, algorithms=['HS256'])
    assert claims['grants']['voice']['outgoing']['application_sid'] == get_settings().twilio_twiml_app_sid
    assert 'incoming' not in claims['grants']['voice']
    response = dial(owner_client, prepared.json())
    assert response.status_code == 200
    assert '<Number>+14155550122</Number>' in response.text
    assert 'callerId="+14155550199"' in response.text
    replay = dial(owner_client, prepared.json())
    assert '<Reject' in replay.text and '+14155550122' not in replay.text
    assert public(owner_client,c).json()['status'] == 'limit_reached'  # count cap takes precedence over busy
    finished = webhook(owner_client,'/twilio/complete',{'CallSid':'CA'+'d'*32,'DialCallStatus':'completed'})
    assert finished.status_code == 200
    assert '<Hangup' in finished.text
    assert prepare(owner_client,c).status_code == 403
    events = owner_client.get('/api/events').json()['events']
    assert events[0]['status'] == 'completed'
    assert '+14155550122' not in str(events)


def test_twilio_signature_account_identity_revoke(owner_client):
    c = issue(owner_client)
    prepared = prepare(owner_client,c).json()
    claims = jwt.decode(prepared['voice_token'],get_settings().twilio_api_key_secret,algorithms=['HS256'])
    params = {'session':prepared['session'],'From':'client:'+claims['grants']['identity'],'CallSid':'CA'+'f'*32}
    assert webhook(owner_client,'/twilio/voice',params,signed=False).status_code == 403
    assert webhook(owner_client,'/twilio/voice',params | {'AccountSid':'AC'+'1'*32}).status_code == 403
    assert '<Reject' in webhook(owner_client,'/twilio/voice',params | {'From':'client:imposter'}).text
    owner_client.post('/api/codes/'+c['id']+'/revoke')
    result = webhook(owner_client,'/twilio/voice',params)
    assert result.status_code == 200 and '<Reject' in result.text
    assert '+14155550122' not in result.text


def test_phone_number_validation(owner_client):
    assert owner_client.post('/api/owner/verify/start',json={'phone':'+441234567890'}).status_code == 422
    assert owner_client.post('/api/owner/verify/start',json={'phone':'not-phone'}).status_code == 422
    assert owner_client.get('/api/owner').json()['masked'].endswith('0122')


def test_rate_limiting(owner_client):
    c = issue(owner_client)
    for _ in range(get_settings().max_prepares_per_hour):
        assert prepare(owner_client,c).status_code == 200
    assert prepare(owner_client,c).status_code == 429


def test_out_of_window_recheck_webhook(owner_client, monkeypatch):
    now = datetime.now(timezone.utc)
    c = issue(owner_client, start_at=(now-timedelta(hours=1)).isoformat(),end_at=(now+timedelta(hours=1)).isoformat())
    prepared = prepare(owner_client,c).json()
    import app.main as m
    monkeypatch.setattr(m,'now_utc',lambda: now+timedelta(hours=2))
    result = dial(owner_client,prepared)
    assert '<Reject' in result.text and '+14155550122' not in result.text


def test_live_call_never_contains_credentials_in_web_page(owner_client):
    c = issue(owner_client)
    body = owner_client.get('/c/'+raw_token(c)).text
    for value in ['unit-test-api-key','unit-test-auth-token','+14155550122','AC'+'a'*32]:
        assert value not in body


def test_destination_requires_verification(client, monkeypatch):
    assert client.post('/login',data={'password':'test-password-123456'},follow_redirects=False).status_code == 303
    import re
    csrf = re.search(r'<meta name="csrf-token" content="([^"]+)">',client.get('/admin').text).group(1)
    client.headers.update({'X-CSRF-Token': csrf})
    import app.main as main
    monkeypatch.setattr(main,'begin_verification',lambda phone,channel:{'status':'pending'})
    monkeypatch.setattr(main,'check_verification',lambda phone,code:{'status':'pending'} if code != '123456' else {'status':'approved'})
    assert client.post('/api/owner/verify/start',json={'phone':'+14155550122','channel':'sms'}).status_code == 200
    assert client.get('/api/codes').status_code == 403
    assert client.post('/api/codes',json={'label':'blocked'}).status_code == 403
    assert client.post('/api/owner/verify/check',json={'code':'000000'}).status_code == 403
    assert client.get('/api/codes').status_code == 403
    assert client.post('/api/owner/verify/check',json={'code':'123456'}).status_code == 200
    c=issue(client)
    assert public(client,c).json()['status']=='available'


def test_revocation_attempts_to_end_live_call(owner_client,monkeypatch):
    import app.main as main
    calls=[]
    monkeypatch.setattr(main,'terminate_twilio_call',lambda sid:(calls.append(sid) or True))
    c=issue(owner_client)
    prepared=prepare(owner_client,c).json()
    assert '<Dial' in dial(owner_client,prepared).text
    response=owner_client.post('/api/codes/'+c['id']+'/revoke').json()
    assert response['enabled'] is False
    assert response['active_calls_found'] == 1
    assert response['active_calls_termination_confirmed'] == 1
    assert calls == ['CA'+'d'*32]
    assert '<Reject' in dial(owner_client,prepared).text
