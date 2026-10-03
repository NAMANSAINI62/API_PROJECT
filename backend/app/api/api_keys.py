from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.core.security import generate_api_key
from app.models.all_models import User, Project, APIKey, APIRequestLog
from app.schemas.schemas import APIKeyCreate, APIKeyResponse, APIKeyCreatedResponse

router = APIRouter()

@router.get("", response_model=List[APIKeyResponse])
def get_api_keys(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(APIKey).join(Project).filter(Project.user_id == current_user.id)
    if project_id:
        query = query.filter(APIKey.project_id == project_id)
    if status:
        query = query.filter(APIKey.status == status)
    if environment:
        query = query.filter(APIKey.environment == environment)
    if search:
        query = query.filter(APIKey.name.ilike(f"%{search}%"))

    keys = query.order_by(APIKey.created_at.desc()).all()

    # Check and mark expired keys dynamically
    now = datetime.utcnow()
    for key in keys:
        if key.expires_at and key.expires_at < now and key.status == "active":
            key.status = "expired"
            db.commit()

    return keys

@router.post("", response_model=APIKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    key_in: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if key_in.project_id and key_in.project_id.strip():
        project = db.query(Project).filter(
            Project.id == key_in.project_id,
            Project.user_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Selected project not found")
    else:
        project = db.query(Project).filter(Project.user_id == current_user.id).first()
        if not project:
            raise HTTPException(status_code=400, detail="Please create a project first")

    raw_key, key_prefix, key_hash = generate_api_key(environment=key_in.environment)

    exp_days = key_in.expires_in_days or key_in.expiration_days
    expires_at = None
    if exp_days:
        expires_at = datetime.utcnow() + timedelta(days=exp_days)

    api_key = APIKey(
        project_id=project.id,
        name=key_in.name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        environment=key_in.environment,
        rate_limit_per_minute=key_in.rate_limit_per_minute,
        expires_at=expires_at,
        status="active"
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    response_dict = {
        "id": api_key.id,
        "project_id": api_key.project_id,
        "name": api_key.name,
        "key_prefix": api_key.key_prefix,
        "environment": api_key.environment,
        "status": api_key.status,
        "rate_limit_per_minute": api_key.rate_limit_per_minute,
        "created_at": api_key.created_at,
        "expires_at": api_key.expires_at,
        "last_used_at": api_key.last_used_at,
        "raw_key": raw_key
    }
    return response_dict

@router.post("/{key_id}/revoke", response_model=APIKeyResponse)
def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    api_key = db.query(APIKey).join(Project).filter(
        APIKey.id == key_id,
        Project.user_id == current_user.id
    ).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key not found")

    api_key.status = "revoked"
    db.commit()
    db.refresh(api_key)

    return api_key

@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    api_key = db.query(APIKey).join(Project).filter(
        APIKey.id == key_id,
        Project.user_id == current_user.id
    ).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key not found")

    # Unlink logs before deleting key to prevent FK constraint failure
    db.query(APIRequestLog).filter(APIRequestLog.api_key_id == key_id).update({"api_key_id": None})
    db.commit()

    db.delete(api_key)
    db.commit()
    return None
