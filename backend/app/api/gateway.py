import time
import uuid
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from jose import jwt
from app.core.config import settings
from app.core.database import get_db
from app.api.deps import validate_gateway_api_key
from app.services.rate_limiter import RateLimitService
from app.models.all_models import APIRequestLog, APIKey, TestUser, Project
from app.core.security import hash_api_key
from app.core.limiter import limiter

router = APIRouter()



def _create_log(
    db: Session,
    request_id: str,
    project_id: Optional[str],
    api_key_id: Optional[str],
    method: str,
    endpoint: str,
    status_code: int,
    latency_ms: float,
    request_headers: Optional[str] = None,
    request_body: Optional[str] = None,
    response_body: Optional[str] = None,
) -> None:
    """Create an API request log entry in PostgreSQL with optional request/response payloads."""
    log = APIRequestLog(
        request_id=request_id,
        project_id=project_id,
        api_key_id=api_key_id,
        method=method.upper(),
        endpoint=endpoint,
        status_code=status_code,
        latency_ms=round(latency_ms, 2),
        request_headers=request_headers,
        request_body=request_body,
        response_body=response_body,
    )
    db.add(log)
    db.commit()



def _rate_limit_headers(rl_result, request_id: str) -> dict:
    """Build standard Gateway headers including X-Request-ID and rate limits."""
    return {
        "X-Request-ID": request_id,
        "X-RateLimit-Limit": str(rl_result.limit),
        "X-RateLimit-Remaining": str(max(0, rl_result.limit - rl_result.current_count)),
        "X-RateLimit-Reset": str(rl_result.ttl_remaining),
    }


def _extract_auth_key(request: Request, x_api_key: Optional[str], authorization: Optional[str]) -> str:
    """Extract raw key from X-API-Key or Authorization header."""
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()
    if authorization and authorization.strip():
        raw = authorization.strip()
        if raw.lower().startswith("bearer "):
            return raw[7:].strip()
        return raw
    return ""


_SENSITIVE_KEYS = {
    "authorization", "cookie", "set-cookie", "password", "password_hash",
    "token", "access_token", "refresh_token", "api_key", "raw_key", "secret",
}


def _redact_sensitive_data(data):
    if isinstance(data, dict):
        return {
            key: "[REDACTED]" if str(key).lower() in _SENSITIVE_KEYS else _redact_sensitive_data(value)
            for key, value in data.items()
        }
    if isinstance(data, list):
        return [_redact_sensitive_data(value) for value in data]
    return data


def _safe_json(data) -> Optional[str]:
    """Safely serialize data to a JSON string, truncated to 10KB max."""
    if data is None:
        return None
    try:
        s = json.dumps(_redact_sensitive_data(data), default=str)
        return s[:10240] if len(s) > 10240 else s
    except Exception:
        return None


def _sanitize_headers(request: Request) -> dict:
    """Log only non-sensitive headers needed for request diagnostics."""
    safe_headers = {
        "accept", "content-type", "user-agent", "x-request-id",
        "x-forwarded-for", "x-forwarded-proto",
    }
    headers = {}
    for key, value in request.headers.items():
        lower_key = key.lower()
        if lower_key in safe_headers:
            headers[key] = value
    return headers

@router.api_route("/test/users", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.api_route("/test/users/{user_id}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.get("/test/status/{status_code}")
@limiter.limit("5/minute")
async def gateway_test_users_dispatcher(

    request: Request,
    user_id: Optional[int] = None,
    status_code: Optional[int] = None,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db)
):

    start_time = time.time()
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    method = request.method.upper()
    endpoint = request.url.path.replace("/api/v1", "")

    raw_key = _extract_auth_key(request, x_api_key, authorization)

    # --- Step 1: Validate API Key ---
    try:
        api_key, project = validate_gateway_api_key(raw_key, db)
    except HTTPException as e:
        latency = (time.time() - start_time) * 1000
        key_id = None
        project_id = None

        if raw_key:
            key_hash = hash_api_key(raw_key)
            existing_key = db.query(APIKey).filter(APIKey.key_hash == key_hash).first()
            if existing_key:
                key_id = existing_key.id
                project_id = existing_key.project_id

        if not project_id:
            hdr_proj = request.headers.get("x-project-id") or request.query_params.get("project_id")
            if hdr_proj:
                proj = db.query(Project).filter(Project.id == hdr_proj).first()
                if proj:
                    project_id = proj.id

        if not project_id and authorization and authorization.lower().startswith("bearer "):
            try:
                token = authorization[7:].strip()
                payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
                uid = payload.get("sub")
                if uid:
                    u_proj = db.query(Project).filter(Project.user_id == uid).first()
                    if u_proj:
                        project_id = u_proj.id
            except Exception:
                pass

        # Capture payload details for full audit trail
        req_headers_json = _safe_json(_sanitize_headers(request))
        res_body_json = _safe_json({"detail": e.detail})

        # Always log the attempt with full headers and error body
        _create_log(
            db, request_id, project_id, key_id, method, endpoint, e.status_code, latency,
            request_headers=req_headers_json,
            response_body=res_body_json
        )

        return JSONResponse(
            status_code=e.status_code,
            content={"detail": e.detail},
            headers={"X-Request-ID": request_id}
        )

    # --- Step 2: Update last_used_at ---
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    # --- Step 3: Per-API-Key Redis Rate Limiting ---
    rl = RateLimitService.check(
        api_key_id=api_key.id,
        limit_per_minute=api_key.rate_limit_per_minute
    )

    if rl.is_limited:
        latency = (time.time() - start_time) * 1000
        _create_log(db, request_id, project.id, api_key.id, method, endpoint, 429, latency)

        headers = _rate_limit_headers(rl, request_id)
        headers["Retry-After"] = str(rl.ttl_remaining)
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit exceeded. Limit: {rl.limit} req/min. Current window usage: {rl.current_count}/{rl.limit}."
            },
            headers=headers
        )

    rl_headers = _rate_limit_headers(rl, request_id)

    # Controlled status endpoints make redirect and upstream-error handling
    # observable without creating hidden failures in normal CRUD routes.
    if status_code is not None:
        if not (300 <= status_code < 400 or 500 <= status_code < 600):
            latency = (time.time() - start_time) * 1000
            _create_log(db, request_id, project.id, api_key.id, method, endpoint, 400, latency)
            return JSONResponse(
                status_code=400,
                content={"detail": "Status test only supports 3xx and 5xx codes"},
                headers=rl_headers,
            )
        latency = (time.time() - start_time) * 1000
        response_content = {
            "status": "simulated",
            "status_code": status_code,
            "message": (
                "Gateway redirect response"
                if status_code < 400
                else "Gateway upstream server error response"
            ),
        }
        _create_log(
            db, request_id, project.id, api_key.id, method, endpoint, status_code, latency,
            request_headers=_safe_json(_sanitize_headers(request)),
            response_body=_safe_json(response_content),
        )
        return JSONResponse(
            status_code=status_code,
            content=response_content,
            headers={**rl_headers, "X-Gateway-Status-Test": str(status_code)},
        )

    # --- Step 4: Parse Request Body (if any) ---
    body_data = {}
    if method in ["POST", "PUT", "PATCH"]:
        try:
            raw_body = await request.body()
            if raw_body:
                body_data = json.loads(raw_body.decode("utf-8"))
        except Exception:
            latency = (time.time() - start_time) * 1000
            _create_log(db, request_id, project.id, api_key.id, method, endpoint, 400, latency)
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid JSON body format"},
                headers=rl_headers
            )

    # --- Step 5: Route & Execute Real Logic ---
    res_status = 200
    res_content = None

    if user_id is None:
        # Collection routes: /test/users
        if method == "GET":
            users = db.query(TestUser).filter(TestUser.project_id == project.id).all()
            res_status = 200
            res_content = {
                "status": "success",
                "total": len(users),
                "data": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role, "created_at": u.created_at.isoformat()} for u in users]
            }

        elif method == "POST":
            name = body_data.get("name")
            email = body_data.get("email")
            if not name or not email:
                latency = (time.time() - start_time) * 1000
                _create_log(db, request_id, project.id, api_key.id, method, endpoint, 400, latency)
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Fields 'name' and 'email' are required for creating a user"},
                    headers=rl_headers
                )
            role = body_data.get("role", "developer")
            new_u = TestUser(project_id=project.id, name=name, email=email, role=role)
            db.add(new_u)
            db.commit()
            db.refresh(new_u)
            res_status = 201
            res_content = {
                "status": "created",
                "message": "User created successfully",
                "data": {"id": new_u.id, "name": new_u.name, "email": new_u.email, "role": new_u.role, "created_at": new_u.created_at.isoformat()}
            }

        elif method in ["PUT", "PATCH", "DELETE"]:
            latency = (time.time() - start_time) * 1000
            _create_log(db, request_id, project.id, api_key.id, method, endpoint, 405, latency)
            return JSONResponse(
                status_code=405,
                content={"detail": f"Method {method} not allowed on collection endpoint '/test/users'. Use '/test/users/{{id}}'."},
                headers=rl_headers
            )

    else:
        # Item routes: /test/users/{user_id}
        if method == "POST":
            latency = (time.time() - start_time) * 1000
            _create_log(db, request_id, project.id, api_key.id, method, endpoint, 405, latency)
            return JSONResponse(
                status_code=405,
                content={"detail": "Method POST not allowed on item endpoint '/test/users/{id}'. Use '/test/users'."},
                headers=rl_headers
            )

        u_obj = db.query(TestUser).filter(TestUser.id == user_id, TestUser.project_id == project.id).first()
        if not u_obj:
            latency = (time.time() - start_time) * 1000
            _create_log(db, request_id, project.id, api_key.id, method, endpoint, 404, latency)
            return JSONResponse(
                status_code=404,
                content={"detail": f"User with ID {user_id} not found in project"},
                headers=rl_headers
            )

        if method == "GET":
            res_status = 200
            res_content = {
                "status": "success",
                "data": {"id": u_obj.id, "name": u_obj.name, "email": u_obj.email, "role": u_obj.role, "created_at": u_obj.created_at.isoformat()}
            }

        elif method == "PUT":
            name = body_data.get("name")
            email = body_data.get("email")
            if not name or not email:
                latency = (time.time() - start_time) * 1000
                _create_log(db, request_id, project.id, api_key.id, method, endpoint, 400, latency)
                return JSONResponse(
                    status_code=400,
                    content={"detail": "PUT requires complete replacement fields 'name' and 'email'"},
                    headers=rl_headers
                )
            u_obj.name = name
            u_obj.email = email
            u_obj.role = body_data.get("role", "developer")
            db.commit()
            db.refresh(u_obj)
            res_status = 200
            res_content = {
                "status": "success",
                "message": "User updated (replaced) successfully",
                "data": {"id": u_obj.id, "name": u_obj.name, "email": u_obj.email, "role": u_obj.role}
            }

        elif method == "PATCH":
            if "name" in body_data:
                u_obj.name = body_data["name"]
            if "email" in body_data:
                u_obj.email = body_data["email"]
            if "role" in body_data:
                u_obj.role = body_data["role"]
            db.commit()
            db.refresh(u_obj)
            res_status = 200
            res_content = {
                "status": "success",
                "message": "User partially updated successfully",
                "data": {"id": u_obj.id, "name": u_obj.name, "email": u_obj.email, "role": u_obj.role}
            }

        elif method == "DELETE":
            db.delete(u_obj)
            db.commit()
            res_status = 204
            res_content = None

    # --- Step 6: Log & Return Real HTTP Response ---
    latency = (time.time() - start_time) * 1000
    req_headers_json = _safe_json(_sanitize_headers(request))
    req_body_json = _safe_json(body_data) if body_data else None
    res_body_json = _safe_json(res_content)
    _create_log(
        db, request_id, project.id, api_key.id, method, endpoint, res_status, latency,
        request_headers=req_headers_json,
        request_body=req_body_json,
        response_body=res_body_json,
    )

    if res_status == 204:
        return Response(status_code=204, headers=rl_headers)

    return JSONResponse(
        status_code=res_status,
        content=res_content,
        headers=rl_headers
    )