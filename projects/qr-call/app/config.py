from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_base_url: str = 'https://example.invalid'
    database_url: str = 'sqlite:///./qrcall.db'
    app_secret: str = ''
    encryption_key: str = ''
    admin_password_hash: str = ''
    twilio_account_sid: str = ''
    twilio_api_key_sid: str = ''
    twilio_api_key_secret: str = ''
    twilio_auth_token: str = ''
    twilio_twiml_app_sid: str = ''
    twilio_verify_service_sid: str = ''
    twilio_caller_id: str = ''
    environment: str = 'production'
    pages_base_url: str = ''
    donation_url: str = ''
    release_artifact_path: str = 'private_download/QR-Call-v1.0.0.zip'
    release_version: str = '1.0.0'
    stripe_secret_key: str = ''
    stripe_price_id: str = ''
    stripe_webhook_secret: str = ''
    require_license: bool = True
    session_hours: int = Field(default=12, ge=1, le=48)
    max_call_seconds: int = Field(default=900, ge=30, le=3600)
    max_prepares_per_hour: int = Field(default=8, ge=1, le=120)
    max_prepares_per_ip_hour: int = Field(default=15, ge=1, le=100)

    @field_validator('app_base_url')
    @classmethod
    def validate_base_url(cls, value):
        value = value.rstrip('/')
        if not value.startswith('https://') and not value.startswith('http://localhost'):
            raise ValueError('APP_BASE_URL must be HTTPS (or localhost for tests)')
        return value

    def require_deployment(self):
        if self.environment != 'production':
            return
        values = (self.app_secret, self.encryption_key, self.admin_password_hash,
                  self.twilio_account_sid, self.twilio_api_key_sid,
                  self.twilio_api_key_secret, self.twilio_auth_token,
                  self.twilio_twiml_app_sid, self.twilio_verify_service_sid, self.twilio_caller_id)
        if any(not item for item in values) or len(self.app_secret) < 40:
            raise RuntimeError('Production secrets and Twilio credentials are mandatory')
        if self.pages_base_url and not self.pages_base_url.startswith('https://'):
            raise RuntimeError('PAGES_BASE_URL must use HTTPS')
        if self.require_license and not all((self.stripe_secret_key, self.stripe_price_id, self.stripe_webhook_secret)):
            raise RuntimeError('Paid activation requires Stripe checkout and webhook credentials')
        if self.app_base_url == 'https://example.invalid' or not self.database_url.startswith('postgresql+'):
            raise RuntimeError('Production requires APP_BASE_URL and a PostgreSQL DATABASE_URL')


@lru_cache

def get_settings():
    return Settings()
