import secrets
import hashlib
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt, JWTError
from app.core.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    # Ensure bytes truncate at 72 bytes for bcrypt safety
    pw_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode('utf-8')


def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def generate_api_key(environment: str = "production") -> tuple[str, str, str]:
    """
    Generates an API key.
    Returns: (raw_key, key_prefix, key_hash)
    Format: pk_live_32hex or pk_test_32hex
    """
    prefix_env = "live" if environment == "production" else "test"
    random_bytes = secrets.token_hex(20)
    raw_key = f"pk_{prefix_env}_{random_bytes}"
    key_prefix = raw_key[:12]
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, key_prefix, key_hash

def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()
