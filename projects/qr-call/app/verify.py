"""Explicit consent gate for the owner phone using Twilio Verify V2."""
import httpx
from fastapi import HTTPException
from .config import get_settings


def verification_request(endpoint: str, payload: dict) -> dict:
    s = get_settings()
    url = f'https://verify.twilio.com/v2/Services/{s.twilio_verify_service_sid}/{endpoint}'
    try:
        with httpx.Client(timeout=9.0) as http:
            response = http.post(url, data=payload, auth=(s.twilio_account_sid, s.twilio_auth_token))
        if not response.is_success:
            raise HTTPException(502, 'Verification provider declined the request; check the number and service configuration.')
        return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(502, 'Phone verification provider is temporarily unreachable.') from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(502, 'Unexpected phone verification response.') from exc


def begin_verification(phone: str, channel: str):
    return verification_request('Verifications', {'To': phone, 'Channel': channel})


def check_verification(phone: str, code: str):
    return verification_request('VerificationCheck', {'To': phone, 'Code': code})
