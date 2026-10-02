from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.all_models import User
from app.schemas.schemas import LogResponse

router = APIRouter()

@router.get("", response_model=List[LogResponse])
def get_logs(
    project_id: Optional[str] = Query(None),
    status_code: Optional[int] = Query(None),
    status_category: Optional[str] = Query(None),  # 2xx, 3xx, 4xx, 5xx
    method: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Dynamic raw PostgreSQL query string building
    where_clauses = [
        "l.project_id IN (SELECT id FROM projects WHERE user_id = :user_id)"
    ]
    params = {
        "user_id": current_user.id,
        "limit": limit,
        "offset": offset
    }

    if project_id:
        where_clauses.append("l.project_id = :project_id")
        params["project_id"] = project_id

    if status_code:
        where_clauses.append("l.status_code = :status_code")
        params["status_code"] = status_code

    if status_category:
        cat = status_category.lower()
        if cat == "2xx":
            where_clauses.append("l.status_code >= 200 AND l.status_code < 300")
        elif cat == "3xx":
            where_clauses.append("l.status_code >= 300 AND l.status_code < 400")
        elif cat == "4xx":
            where_clauses.append("l.status_code >= 400 AND l.status_code < 500")
        elif cat == "5xx":
            where_clauses.append("l.status_code >= 500")

    if method:
        where_clauses.append("l.method = :method")
        params["method"] = method.upper()

    if search and search.strip():
        where_clauses.append("(l.endpoint ILIKE :search OR l.request_id ILIKE :search)")
        params["search"] = f"%{search.strip()}%"

    where_sql = " AND ".join(where_clauses)

    raw_sql = f"""
        SELECT 
            l.id,
            l.request_id,
            l.project_id,
            l.method,
            l.endpoint,
            l.status_code,
            l.latency_ms,
            l.request_headers,
            l.request_body,
            l.response_body,
            l.created_at
        FROM api_request_logs l
        LEFT OUTER JOIN projects p ON l.project_id = p.id
        WHERE {where_sql}
        ORDER BY l.created_at DESC
        LIMIT :limit OFFSET :offset
    """

    results = db.execute(text(raw_sql), params).mappings().all()

    logs = []
    for row in results:
        item = dict(row)
        if item.get("created_at"):
            dt = item["created_at"]
            item["created_at"] = dt.isoformat() + "Z" if hasattr(dt, "isoformat") else str(dt) + "Z"
        logs.append(item)

    return logs
