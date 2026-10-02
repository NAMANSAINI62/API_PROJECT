from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.all_models import User, Project
from app.schemas.schemas import UserRegister, UserLogin, Token, UserResponse

from app.api.deps import get_current_user

router = APIRouter()

@router.post("/register", response_model=Token)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists"
        )

    hashed_pw = get_password_hash(user_in.password)
    user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_pw
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create default project for the user
    default_project = Project(
        user_id=user.id,
        name="Default Project",
        description="My initial API project",
        environment="production",
        rate_limit_per_minute=60
    )
    db.add(default_project)
    db.commit()

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/login", response_model=Token)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

