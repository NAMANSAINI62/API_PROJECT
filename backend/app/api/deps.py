from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_api_key
from app.models.all_models import User, APIKey, Project

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

from datetime import datetime

def validate_gateway_api_key(raw_api_key: str, db: Session) -> tuple[APIKey, Project]:
    """
    Validates customer API key for the Gateway.
    Checks Redis cache first for cached project config / key validity.
    """
    if not raw_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key missing")
    
    # Strip quotes, bearer prefix and surrounding whitespace
    raw_api_key = str(raw_api_key).strip().strip('"').strip("'")
    if raw_api_key.lower().startswith("bearer "):
        raw_api_key = raw_api_key[7:].strip().strip('"').strip("'")

    key_hash = hash_api_key(raw_api_key)

    api_key = db.query(APIKey).filter(APIKey.key_hash == key_hash).first()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key (key not found)")

    # Check expiration
    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        if api_key.status == "active":
            api_key.status = "expired"
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key has expired")

    if api_key.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"API key is {api_key.status}")

    project = db.query(Project).filter(Project.id == api_key.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found")

    return api_key, project
