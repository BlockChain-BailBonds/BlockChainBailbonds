from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class Owner(Base):
    __tablename__ = 'owners'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)


class Code(Base):
    __tablename__ = 'codes'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timezone: Mapped[str] = mapped_column(String(80), default='America/Chicago', nullable=False)
    windows: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    max_calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    calls: Mapped[list['Call']] = relationship(back_populates='code')


class Call(Base):
    __tablename__ = 'calls'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code_id: Mapped[int] = mapped_column(ForeignKey('codes.id'), nullable=False, index=True)
    session_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    caller_identity: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default='prepared', nullable=False)
    call_sid: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    dial_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    code: Mapped[Code] = relationship(back_populates='calls')
    __table_args__ = (Index('ix_calls_code_created', 'code_id', 'created_at'),)


class AuthAttempt(Base):
    __tablename__ = 'auth_attempts'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PhoneVerification(Base):
    __tablename__ = 'phone_verifications'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    check_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class License(Base):
    __tablename__ = 'licenses'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stripe_session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    download_version: Mapped[str | None] = mapped_column(String(24), nullable=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    token_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CheckoutIntent(Base):
    __tablename__ = 'checkout_intents'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stripe_session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default='pending', nullable=False)
    ip_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
