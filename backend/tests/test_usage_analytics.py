"""
Tests for usage analytics aggregation.
"""
import time
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

import os
os.environ["DATABASE_URL"] = "sqlite:///./test_pulsegate.db"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from app.core.database import Base, engine, SessionLocal
from app.main import app
from app.models.all_models import APIRequestLog

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def register_and_login():
    email = f"usage_{time.time_ns()}@example.com"
    client.post("/api/v1/auth/register", json={
        "name": "Usage User",
        "email": email,
        "password": "password123",
    })
    res = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "password123",
    })
    data = res.json()
    return data["access_token"], data["user"]["id"]


def create_project(token):
    res = client.post(
        "/api/v1/projects",
        json={"name": "Usage Project", "environment": "production"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    return res.json()["id"]


def seed_logs(project_id):
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        samples = (
            [(200, 16)] +
            [(401, 4)] +
            [(429, 5)] +
            [(400, 5)] +
            [(404, 1)]
        )
        index = 0
        for status_code, count in samples:
            for _ in range(count):
                db.add(APIRequestLog(
                    request_id=f"req_{index}",
                    project_id=project_id,
                    api_key_id=None,
                    method="GET",
                    endpoint="/test/users",
                    status_code=status_code,
                    latency_ms=10.0 + index,
                    request_headers=None,
                    request_body=None,
                    response_body=None,
                    created_at=now,
                ))
                index += 1
        db.commit()
    finally:
        db.close()


def test_usage_counts_include_all_logged_statuses():
    token, _ = register_and_login()
    project_id = create_project(token)
    seed_logs(project_id)

    res = client.get(
        "/api/v1/usage?days=7&project_id=" + project_id,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["total_requests"] == 31
    assert data["status_200_count"] == 16
    assert data["status_401_count"] == 4
    assert data["status_429_count"] == 5
    assert data["status_400_count"] == 5
    assert data["status_404_count"] == 1
    assert data["status_500_count"] == 0
    assert data["status_other_count"] == 0

    counted = (
        data["status_200_count"]
        + data["status_3xx_count"]
        + data["status_401_count"]
        + data["status_400_count"]
        + data["status_404_count"]
        + data["status_405_count"]
        + data["status_429_count"]
        + data["status_500_count"]
        + data["status_other_count"]
    )
    assert counted == data["total_requests"]
    assert any(point["status_code"] == 404 and point["count"] == 1 for point in data["status_breakdown"])
