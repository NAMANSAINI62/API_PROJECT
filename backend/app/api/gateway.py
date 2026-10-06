import time
import uuid
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from jose import jwt

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import validate_gateway_api_key
from app.services.rate_limiter import RateLimitService
from app.models.all_models import APIRequestLog, APIKey, TestUser, Project
from app.core.security import hash_api_key

router = APIRouter()


# ---------------------------------------------------------------
# Constants
# ---------------------------------------------------------------

# Values of these keys are never saved in logs
SECRET_WORDS = [
    "authorization", "cookie", "set-cookie", "password", "password_hash",
    "token", "access_token", "refresh_token", "api_key", "raw_key", "secret",
]

# Only these request headers are saved in logs
SAFE_HEADERS = [
    "accept", "content-type", "user-agent", "x-request-id",
    "x-forwarded-for", "x-forwarded-proto",
]


# ---------------------------------------------------------------
# 1. Small helper functions
# ---------------------------------------------------------------

def make_request_id():
    """Create a unique id like 'req_a1b2c3d4e5f6'."""
    return "req_" + uuid.uuid4().hex[:12]


def get_api_key_from_headers(x_api_key, authorization):
    """Read the key from X-API-Key or from 'Authorization: Bearer <key>'."""
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()

    if authorization and authorization.strip():
        text = authorization.strip()
        if text.lower().startswith("bearer "):
            return text[7:].strip()
        return text

    return ""


def hide_secrets(data):
    """Replace secret values with [REDACTED] (also inside nested data)."""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if str(key).lower() in SECRET_WORDS:
                result[key] = "[REDACTED]"
            else:
                result[key] = hide_secrets(value)
        return result

    if isinstance(data, list):
        return [hide_secrets(item) for item in data]

    return data


def to_json(data):
    """Convert data to a JSON string for the log (secrets hidden, max 10KB)."""
    if data is None:
        return None

    try:
        text = json.dumps(hide_secrets(data), default=str)
    except Exception:
        return None

    return text[:10240]


def get_safe_headers(request: Request):
    """Return only the harmless headers from the request."""
    result = {}
    for key, value in request.headers.items():
        if key.lower() in SAFE_HEADERS:
            result[key] = value
    return result


def user_to_dict(user):
    """Turn a TestUser database object into a normal dictionary."""
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
    }


# ---------------------------------------------------------------
# 2. Logging
# ---------------------------------------------------------------

def save_log(db, request_id, project_id, api_key_id, method, endpoint,
             status_code, start_time,
             request_headers=None, request_body=None, response_body=None):
    """Save one row in the api request log table."""
    latency_ms = (time.time() - start_time) * 1000

    log = APIRequestLog(
        request_id=request_id,
        project_id=project_id,
        api_key_id=api_key_id,
        method=method.upper(),
        endpoint=endpoint,
        status_code=status_code,
        latency_ms=round(latency_ms, 2),
        request_headers=to_json(request_headers),
        request_body=to_json(request_body),
        response_body=to_json(response_body),
    )
    db.add(log)
    db.commit()


# ---------------------------------------------------------------
# 3. Failed authentication: find key id and project id for the log
# ---------------------------------------------------------------

def find_ids_for_failed_auth(request, db, raw_key, authorization):
    """
    The key was rejected, but we still try to find which key / project
    it belongs to, so the failed attempt can be logged properly.
    Returns (key_id, project_id).
    """
    key_id = None
    project_id = None

    # Try 1: find the key by its hash
    if raw_key:
        key_hash = hash_api_key(raw_key)
        found_key = db.query(APIKey).filter(APIKey.key_hash == key_hash).first()
        if found_key:
            key_id = found_key.id
            project_id = found_key.project_id

    # Try 2: project id sent in header or query string
    if not project_id:
        project_hint = request.headers.get("x-project-id") or request.query_params.get("project_id")
        if project_hint:
            found_project = db.query(Project).filter(Project.id == project_hint).first()
            if found_project:
                project_id = found_project.id

    # Try 3: the Bearer value may be a JWT login token
    if not project_id and authorization and authorization.lower().startswith("bearer "):
        try:
            token = authorization[7:].strip()
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                user_project = db.query(Project).filter(Project.user_id == user_id).first()
                if user_project:
                    project_id = user_project.id
        except Exception:
            pass

    return key_id, project_id


# ---------------------------------------------------------------
# 4. Rate limit headers
# ---------------------------------------------------------------

def make_headers(request_id, rl):
    """Headers that go in every response."""
    remaining = rl.limit - rl.current_count
    if remaining < 0:
        remaining = 0

    return {
        "X-Request-ID": request_id,
        "X-RateLimit-Limit": str(rl.limit),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(rl.ttl_remaining),
    }


# ---------------------------------------------------------------
# 5. Status test (fake 3xx / 5xx responses)  -- SAME AS BEFORE
# ---------------------------------------------------------------

def handle_status_test(status_code):
    """Return a fake redirect or server-error response."""
    is_redirect = 300 <= status_code < 400
    is_server_error = 500 <= status_code < 600

    if not is_redirect and not is_server_error:
        return 400, {"detail": "Status test only supports 3xx and 5xx codes"}

    if is_redirect:
        message = "Gateway redirect response"
    else:
        message = "Gateway upstream server error response"

    return status_code, {
        "status": "simulated",
        "status_code": status_code,
        "message": message,
    }


# ---------------------------------------------------------------
# 6. Reading the request body
# ---------------------------------------------------------------

async def read_json_body(request: Request, method: str):
    """
    Returns (body, is_valid).
    Only POST / PUT / PATCH have a body.
    """
    if method not in ["POST", "PUT", "PATCH"]:
        return {}, True

    try:
        raw_body = await request.body()
        if raw_body:
            return json.loads(raw_body.decode("utf-8")), True
        return {}, True
    except Exception:
        return {}, False


# ---------------------------------------------------------------
# 7. User functions (each returns: status_code, content)
# ---------------------------------------------------------------

def list_users(db, project):
    users = db.query(TestUser).filter(TestUser.project_id == project.id).all()

    user_list = []
    for u in users:
        user_list.append(user_to_dict(u))

    return 200, {"status": "success", "total": len(user_list), "data": user_list}


def create_user(db, project, body):
    name = str(body.get("name") or body.get("product") or body.get("title") or f"Resource_{uuid.uuid4().hex[:6]}")
    email = str(body.get("email") or f"user_{uuid.uuid4().hex[:6]}@example.com")
    role = str(body.get("role") or "developer")

    new_user = TestUser(project_id=project.id, name=name, email=email, role=role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    response_data = {"id": new_user.id}
    if isinstance(body, dict) and body:
        response_data.update(body)
    else:
        response_data.update(user_to_dict(new_user))

    if "created_at" not in response_data:
        response_data["created_at"] = new_user.created_at.isoformat()

    return 201, {
        "status": "created",
        "message": "Resource created successfully",
        "data": response_data,
    }


def find_user(db, project, user_id):
    """Find one user of this project. Returns None if not found."""
    return db.query(TestUser).filter(
        TestUser.id == user_id,
        TestUser.project_id == project.id,
    ).first()


def get_user(db, project, user_id):
    user = find_user(db, project, user_id)
    if user is None:
        return 404, {"detail": f"Resource with ID {user_id} not found in project"}

    return 200, {"status": "success", "data": user_to_dict(user)}


def replace_user(db, project, user_id, body):
    """PUT: replaces or updates resource fields."""
    user = find_user(db, project, user_id)
    if user is None:
        return 404, {"detail": f"Resource with ID {user_id} not found in project"}

    if "name" in body:
        user.name = str(body["name"])
    if "email" in body:
        user.email = str(body["email"])
    if "role" in body:
        user.role = str(body["role"])

    db.commit()
    db.refresh(user)

    response_data = {"id": user.id}
    if isinstance(body, dict) and body:
        response_data.update(body)
    else:
        response_data.update(user_to_dict(user))

    return 200, {
        "status": "success",
        "message": "Resource updated successfully",
        "data": response_data,
    }


def update_user(db, project, user_id, body):
    """PATCH: only the sent fields are changed."""
    user = find_user(db, project, user_id)
    if user is None:
        return 404, {"detail": f"Resource with ID {user_id} not found in project"}

    if "name" in body:
        user.name = str(body["name"])
    if "email" in body:
        user.email = str(body["email"])
    if "role" in body:
        user.role = str(body["role"])

    db.commit()
    db.refresh(user)

    response_data = {"id": user.id}
    if isinstance(body, dict) and body:
        response_data.update(body)
    else:
        response_data.update(user_to_dict(user))

    return 200, {
        "status": "success",
        "message": "Resource partially updated successfully",
        "data": response_data,
    }


def delete_user(db, project, user_id):
    user = find_user(db, project, user_id)
    if user is None:
        return 404, {"detail": f"User with ID {user_id} not found in project"}

    db.delete(user)
    db.commit()
    return 204, None


# ---------------------------------------------------------------
# 8. Shared helper 1: runs BEFORE every route (key check + rate limit)
# ---------------------------------------------------------------

def check_access(request, db, x_api_key, authorization, request_id, start_time):
    """
    Returns 4 things: (error_response, api_key, project, headers)
    - If something is wrong, error_response has the response to send back.
    - If all is fine, error_response is None.
    """
    method = request.method.upper()
    endpoint = request.url.path.replace("/api/v1", "")
    request_headers = get_safe_headers(request)
    raw_key = get_api_key_from_headers(x_api_key, authorization)

    # Step 1: check the API key
    try:
        api_key, project = validate_gateway_api_key(raw_key, db)
    except HTTPException as e:
        key_id, project_id = find_ids_for_failed_auth(request, db, raw_key, authorization)

        save_log(db, request_id, project_id, key_id, method, endpoint,
                 e.status_code, start_time,
                 request_headers=request_headers,
                 response_body={"detail": e.detail})

        error = JSONResponse(status_code=e.status_code,
                             content={"detail": e.detail},
                             headers={"X-Request-ID": request_id})
        return error, None, None, None

    # Step 2: remember when the key was last used
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    # Step 3: rate limit
    rl = RateLimitService.check(
        api_key_id=api_key.id,
        limit_per_minute=api_key.rate_limit_per_minute,
    )
    headers = make_headers(request_id, rl)

    if rl.is_limited:
        headers["Retry-After"] = str(rl.ttl_remaining)
        content = {
            "detail": f"Rate limit exceeded. Limit: {rl.limit} req/min. "
                      f"Current window usage: {rl.current_count}/{rl.limit}."
        }
        save_log(db, request_id, project.id, api_key.id, method, endpoint,
                 429, start_time, request_headers=request_headers, response_body=content)
        error = JSONResponse(status_code=429, content=content, headers=headers)
        return error, None, None, None

    return None, api_key, project, headers


# ---------------------------------------------------------------
# 9. Shared helper 2: runs AFTER every route (log + send response)
# ---------------------------------------------------------------

def finish_request(request, db, request_id, start_time, api_key, project,
                   headers, code, content, body=None):
    method = request.method.upper()
    endpoint = request.url.path.replace("/api/v1", "")

    save_log(db, request_id, project.id, api_key.id, method, endpoint, code, start_time,
             request_headers=get_safe_headers(request),
             request_body=body if body else None,
             response_body=content)

    if code == 204:
        return Response(status_code=204, headers=headers)

    return JSONResponse(status_code=code, content=content, headers=headers)


# ---------------------------------------------------------------
# 10. Shared helper 3: catches REAL errors and turns them into 500 / 503
# ---------------------------------------------------------------

def run_safely(db, function, *args):
    try:
        return function(*args)
    except OperationalError:
        # database is down or unreachable
        db.rollback()
        return 503, {"detail": "Database unavailable"}
    except Exception as error:
        # any unexpected bug in our code
        db.rollback()
        print("Unexpected error:", error)
        return 500, {"detail": "Internal server error"}


# ---------------------------------------------------------------
# 11. Routes: one function per job
# ---------------------------------------------------------------

@router.get("/test/users")
async def list_users_route(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code, content = run_safely(db, list_users, db, project)

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)


@router.post("/test/users")
async def create_user_route(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    body, body_is_valid = await read_json_body(request, "POST")
    if body_is_valid:
        code, content = run_safely(db, create_user, db, project, body)
    else:
        code, content = 400, {"detail": "Invalid JSON body format"}

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content, body)


@router.get("/test/users/{user_id}")
async def get_user_route(
    user_id: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code, content = run_safely(db, get_user, db, project, user_id)

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)


@router.put("/test/users/{user_id}")
async def replace_user_route(
    user_id: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    body, body_is_valid = await read_json_body(request, "PUT")
    if body_is_valid:
        code, content = run_safely(db, replace_user, db, project, user_id, body)
    else:
        code, content = 400, {"detail": "Invalid JSON body format"}

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content, body)


@router.patch("/test/users/{user_id}")
async def update_user_route(
    user_id: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    body, body_is_valid = await read_json_body(request, "PATCH")
    if body_is_valid:
        code, content = run_safely(db, update_user, db, project, user_id, body)
    else:
        code, content = 400, {"detail": "Invalid JSON body format"}

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content, body)


@router.delete("/test/users/{user_id}")
async def delete_user_route(
    user_id: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code, content = run_safely(db, delete_user, db, project, user_id)

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)


@router.api_route("/test/users", methods=["PUT", "PATCH", "DELETE"])
async def wrong_method_on_collection_route(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """PUT / PATCH / DELETE are not allowed on /test/users (no id). Returns a logged 405."""
    start_time = time.time()
    request_id = make_request_id()
    method = request.method.upper()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code = 405
    content = {
        "detail": f"Method {method} not allowed on collection endpoint '/test/users'. "
                  f"Use '/test/users/{{id}}'."
    }

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)


@router.api_route("/test/users/{user_id}", methods=["POST"])
async def wrong_method_on_item_route(
    user_id: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    """POST is not allowed on /test/users/{id}. Returns a logged 405."""
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code = 405
    content = {
        "detail": "Method POST not allowed on item endpoint '/test/users/{id}'. "
                  "Use '/test/users'."
    }

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)


@router.get("/test/status/{status_code}")
async def status_test_route(
    status_code: int,
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
):
    start_time = time.time()
    request_id = make_request_id()

    error, api_key, project, headers = check_access(
        request, db, x_api_key, authorization, request_id, start_time)
    if error:
        return error

    code, content = handle_status_test(status_code)
    if code != 400:
        headers["X-Gateway-Status-Test"] = str(code)

    return finish_request(request, db, request_id, start_time,
                          api_key, project, headers, code, content)