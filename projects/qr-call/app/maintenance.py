"""Delete personal metadata at short retention intervals; code.used_calls preserves quotas."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete
from .db import SessionLocal
from .models import Call, PhoneVerification, AuthAttempt


def prune():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        calls = db.execute(delete(Call).where(Call.created_at < now - timedelta(days=30))).rowcount
        verifications = db.execute(delete(PhoneVerification).where(PhoneVerification.created_at < now - timedelta(days=1))).rowcount
        login_events = db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < now - timedelta(hours=1))).rowcount
        db.commit()
    return {'calls': calls, 'verifications': verifications, 'auth_attempts': login_events}


if __name__ == '__main__':
    result = prune()
    print('Expired metadata pruned:', result)
