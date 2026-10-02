import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    environment = Column(String, default="production")
    rate_limit_per_minute = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    api_keys = relationship("APIKey", back_populates="project", cascade="all, delete-orphan")

class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False)
    key_prefix = Column(String, nullable=False)
    environment = Column(String, default="production")
    rate_limit_per_minute = Column(Integer, default=5)
    status = Column(String, default="active")  # active, revoked, expired
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="api_keys")
    request_logs = relationship("APIRequestLog", back_populates="api_key", cascade="all, delete-orphan")

class APIRequestLog(Base):
    __tablename__ = "api_request_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    request_id = Column(String, nullable=False, unique=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    api_key_id = Column(String, ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True)
    method = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False)
    latency_ms = Column(Float, nullable=False)
    request_headers = Column(Text, nullable=True)
    request_body = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    api_key = relationship("APIKey", back_populates="request_logs")

class TestUser(Base):
    __tablename__ = "test_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role = Column(String, default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
