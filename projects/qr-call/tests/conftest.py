import os
import tempfile
from pathlib import Path
from cryptography.fernet import Fernet
from argon2 import PasswordHasher

DB_PATH = Path(tempfile.mkdtemp(prefix='ghostconnect-test-')) / 'test.sqlite'
os.environ['ENVIRONMENT'] = 'test'
os.environ['REQUIRE_LICENSE'] = 'false'
os.environ['APP_BASE_URL'] = 'http://localhost'
os.environ['DATABASE_URL'] = f'sqlite:///{DB_PATH}'
os.environ['APP_SECRET'] = 'this-secret-is-long-enough-for-a-test-' * 3
os.environ['ENCRYPTION_KEY'] = Fernet.generate_key().decode()
os.environ['ADMIN_PASSWORD_HASH'] = PasswordHasher().hash('test-password-123456')
os.environ['TWILIO_ACCOUNT_SID'] = 'AC' + 'a' * 32
os.environ['TWILIO_API_KEY_SID'] = 'SK' + 'b' * 32
os.environ['TWILIO_API_KEY_SECRET'] = 'unit-test-api-key'
os.environ['TWILIO_AUTH_TOKEN'] = 'unit-test-auth-token'
os.environ['TWILIO_TWIML_APP_SID'] = 'AP' + 'c' * 32
os.environ['TWILIO_VERIFY_SERVICE_SID'] = 'VA' + 'e' * 32
os.environ['TWILIO_CALLER_ID'] = '+14155550199'

import pytest
from fastapi.testclient import TestClient
from app.db import Base, engine
from app.main import app


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as tc:
        yield tc


@pytest.fixture
def owner_client(client, monkeypatch):
    result = client.post('/login', data={'password': 'test-password-123456'}, follow_redirects=False)
    assert result.status_code == 303
    page = client.get('/admin')
    import re
    csrf = re.search(r'<meta name="csrf-token" content="([^"]+)">', page.text).group(1)
    client.headers.update({'X-CSRF-Token': csrf})
    import app.main as main
    monkeypatch.setattr(main, 'begin_verification', lambda phone, channel: {'status':'pending'})
    monkeypatch.setattr(main, 'check_verification', lambda phone, code: {'status':'approved'} if code == '123456' else {'status':'pending'})
    response = client.post('/api/owner/verify/start', json={'phone': '+14155550122', 'channel':'sms'})
    assert response.status_code == 200, response.text
    confirm = client.post('/api/owner/verify/check', json={'code':'123456'})
    assert confirm.status_code == 200, confirm.text
    yield client
