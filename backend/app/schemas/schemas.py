from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

# ── Auth Schemas ──────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# ── Project Schemas ───────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    environment: Optional[str] = "production"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    environment: str
    rate_limit_per_minute: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ── API Key Schemas ───────────────────────────────────────────────────────────
class APIKeyCreate(BaseModel):
    name: str
    project_id: Optional[str] = None
    environment: Optional[str] = "production"
    expires_in_days: Optional[int] = None
    expiration_days: Optional[int] = None

class APIKeyResponse(BaseModel):
    id: str
    project_id: str
    name: str
    key_prefix: str
    environment: str
    rate_limit_per_minute: int
    status: str
    expires_at: Optional[datetime] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class APIKeyCreatedResponse(APIKeyResponse):
    raw_key: str

# ── Request Log Schemas ───────────────────────────────────────────────────────
class APIRequestLogResponse(BaseModel):
    id: str
    request_id: str
    project_id: Optional[str] = None
    api_key_id: Optional[str] = None
    endpoint: str
    method: str
    status_code: int
    latency_ms: Optional[float] = 0.0
    request_headers: Optional[str] = None
    request_body: Optional[str] = None
    response_body: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class LogResponse(BaseModel):
    id: str
    request_id: Optional[str] = None
    project_id: Optional[str] = None
    api_key_id: Optional[str] = None
    method: str
    endpoint: str
    status_code: int
    latency_ms: Optional[float] = 0.0
    request_headers: Optional[str] = None
    request_body: Optional[str] = None
    response_body: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True

class TimeSeriesPoint(BaseModel):
    timestamp: str
    count: int

class StatusCountPoint(BaseModel):
    status_code: int
    count: int

class UsageStatsResponse(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    status_200_count: int
    status_3xx_count: int
    status_401_count: int
    status_400_count: int
    status_404_count: int
    status_405_count: int
    status_429_count: int
    status_500_count: int
    status_5xx_count: int
    status_other_count: int
    status_breakdown: List[StatusCountPoint]
    success_rate: float
    avg_latency_ms: float
    time_series: List[TimeSeriesPoint]
