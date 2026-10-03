from typing import Optional
from datetime import datetime, timedelta
from collections import Counter
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.all_models import User
from app.schemas.schemas import UsageStatsResponse

router = APIRouter()

@router.get("", response_model=UsageStatsResponse)
def get_usage(
    project_id: Optional[str] = Query(None),
    days: int = Query(7, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start_date = datetime.utcnow() - timedelta(days=days)

    params = {
        "user_id": current_user.id,
        "start_date": start_date
    }

    if project_id:
        where_clauses = [
            "(l.project_id = :project_id OR l.project_id IS NULL)",
            "l.created_at >= :start_date"
        ]
        params["project_id"] = project_id
    else:
        where_clauses = [
            "(l.project_id IN (SELECT id FROM projects WHERE user_id = :user_id) OR l.project_id IS NULL)",
            "l.created_at >= :start_date"
        ]

    where_sql = " AND ".join(where_clauses)

    raw_sql = f"""
        SELECT 
            l.id,
            l.status_code,
            l.latency_ms,
            l.created_at
        FROM api_request_logs l
        WHERE {where_sql}
    """

    results = db.execute(text(raw_sql), params).mappings().all()
    logs = [dict(row) for row in results]
    status_counts = Counter(log["status_code"] for log in logs)

    total_requests = len(logs)
    successful_requests = sum(1 for log in logs if 200 <= log["status_code"] < 400)
    failed_requests = total_requests - successful_requests

    status_200_count = sum(1 for log in logs if 200 <= log["status_code"] < 300)
    status_3xx_count = sum(1 for log in logs if 300 <= log["status_code"] < 400)
    status_401_count = sum(1 for log in logs if log["status_code"] == 401)
    status_400_count = sum(1 for log in logs if log["status_code"] == 400)
    status_404_count = sum(1 for log in logs if log["status_code"] == 404)
    status_405_count = sum(1 for log in logs if log["status_code"] == 405)
    status_429_count = sum(1 for log in logs if log["status_code"] == 429)
    status_500_count = sum(1 for log in logs if log["status_code"] == 500)
    status_5xx_count = sum(1 for log in logs if 500 <= log["status_code"] < 600)
    tracked_status_count = (
        status_200_count
        + status_3xx_count
        + status_400_count
        + status_401_count
        + status_404_count
        + status_405_count
        + status_429_count
        + status_5xx_count
    )
    status_other_count = max(0, total_requests - tracked_status_count)

    status_breakdown = [
        {"status_code": status_code, "count": count}
        for status_code, count in sorted(status_counts.items())
    ]

    success_rate = (successful_requests / total_requests * 100) if total_requests > 0 else 0.0
    avg_latency_ms = (sum(log["latency_ms"] for log in logs) / total_requests) if total_requests > 0 else 0.0

    # Build daily time series bucket
    daily_buckets = {}
    for i in range(days):
        day_str = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        daily_buckets[day_str] = 0

    for log in logs:
        created = log["created_at"]
        day_str = created.strftime("%Y-%m-%d") if isinstance(created, datetime) else str(created)[:10]
        if day_str in daily_buckets:
            daily_buckets[day_str] += 1

    time_series = [{"timestamp": k, "count": v} for k, v in daily_buckets.items()]

    return {
        "total_requests": total_requests,
        "successful_requests": successful_requests,
        "failed_requests": failed_requests,
        "status_200_count": status_200_count,
        "status_3xx_count": status_3xx_count,
        "status_401_count": status_401_count,
        "status_400_count": status_400_count,
        "status_404_count": status_404_count,
        "status_405_count": status_405_count,
        "status_429_count": status_429_count,
        "status_500_count": status_500_count,
        "status_5xx_count": status_5xx_count,
        "status_other_count": status_other_count,
        "status_breakdown": status_breakdown,
        "success_rate": round(success_rate, 2),
        "avg_latency_ms": round(avg_latency_ms, 2),
        "time_series": time_series
    }
