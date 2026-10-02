import time
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

import os
os.environ["DATABASE_URL"] = "sqlite:///./test_pulsegate.db"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from app.core.database import Base, engine, SessionLocal
from app.main import app
from app.services.rate_limiter import RateLimitService, RateLimitResult
from app.models.all_models import APIKey, TestUser

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def register_and_login():
    email = f"test_{time.time_ns()}@example.com"
    client.post("/api/v1/auth/register", json={
        "name": "Test User",
        "email": email,
        "password": "password123"
    })
    res = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "password123"
    })
    data = res.json()
    return data["access_token"], data["user"]["id"]


def create_project(token):
    res = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "environment": "production"},
        headers={"Authorization": f"Bearer {token}"}
    )
    return res.json()["id"]


def create_api_key(token, project_id, rate_limit=5, expiration_days=7):
    res = client.post(
        "/api/v1/keys",
        json={
            "project_id": project_id,
            "name": f"Test Key {time.time_ns()}",
            "environment": "production",
            "expiration_days": expiration_days,
            "rate_limit_per_minute": rate_limit,
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 201
    data = res.json()
    return data["raw_key"], data["id"], data


class TestRealGatewayPlayground:

    def test_get_users_collection_200(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.get(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key}
            )
            assert res.status_code == 200
            assert res.headers.get("X-Request-ID").startswith("req_")
            data = res.json()
            assert data["status"] == "success"
            assert isinstance(data["data"], list)

    def test_post_users_collection_201(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.post(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key},
                json={"name": "John Doe", "email": "john@example.com", "role": "admin"}
            )
            assert res.status_code == 201
            data = res.json()
            assert data["status"] == "created"
            assert data["data"]["name"] == "John Doe"
            created_id = data["data"]["id"]

            # GET to verify DB persistence
            res_get = client.get(
                f"/api/v1/test/users/{created_id}",
                headers={"X-API-Key": raw_key}
            )
            assert res_get.status_code == 200
            assert res_get.json()["data"]["name"] == "John Doe"

    def test_put_user_item_200(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            # Create user
            res_create = client.post(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key},
                json={"name": "Alice", "email": "alice@example.com"}
            )
            user_id = res_create.json()["data"]["id"]

            # Full PUT replacement
            res_put = client.put(
                f"/api/v1/test/users/{user_id}",
                headers={"X-API-Key": raw_key},
                json={"name": "Alice Updated", "email": "alice_new@example.com", "role": "lead"}
            )
            assert res_put.status_code == 200
            assert res_put.json()["data"]["name"] == "Alice Updated"

    def test_patch_user_item_200(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res_create = client.post(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key},
                json={"name": "Bob", "email": "bob@example.com"}
            )
            user_id = res_create.json()["data"]["id"]

            # Partial PATCH update
            res_patch = client.patch(
                f"/api/v1/test/users/{user_id}",
                headers={"X-API-Key": raw_key},
                json={"name": "Bob Patched"}
            )
            assert res_patch.status_code == 200
            assert res_patch.json()["data"]["name"] == "Bob Patched"

    def test_delete_user_item_204(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res_create = client.post(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key},
                json={"name": "Charlie", "email": "charlie@example.com"}
            )
            user_id = res_create.json()["data"]["id"]

            # DELETE
            res_del = client.delete(
                f"/api/v1/test/users/{user_id}",
                headers={"X-API-Key": raw_key}
            )
            assert res_del.status_code == 204

            # GET should now return 404
            res_get = client.get(
                f"/api/v1/test/users/{user_id}",
                headers={"X-API-Key": raw_key}
            )
            assert res_get.status_code == 404

    def test_unsupported_method_returns_405(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            # PUT on collection endpoint /test/users is not allowed -> 405
            res = client.put(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key},
                json={"name": "Test"}
            )
            assert res.status_code == 405

    def test_invalid_api_key_returns_401(self):
        res = client.get(
            "/api/v1/test/users",
            headers={"X-API-Key": "invalid_key_12345"}
        )
        assert res.status_code == 401
        assert "Invalid API key" in res.json()["detail"]

    def test_rate_limit_exceeded_returns_429(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id, rate_limit=5)

        mock_result = RateLimitResult(is_limited=True, current_count=6, limit=5, ttl_remaining=42)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.get(
                "/api/v1/test/users",
                headers={"X-API-Key": raw_key}
            )
            assert res.status_code == 429
            assert res.headers.get("Retry-After") == "42"

    def test_request_logging_captures_all_events(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            client.get("/api/v1/test/users", headers={"X-API-Key": raw_key})
            client.post("/api/v1/test/users", headers={"X-API-Key": raw_key}, json={"name": "LogUser", "email": "log@test.com"})

        # Fetch logs via dashboard API
        res_logs = client.get("/api/v1/logs", headers={"Authorization": f"Bearer {token}"})
        assert res_logs.status_code == 200
        logs = res_logs.json()
        methods = [l["method"] for l in logs]
        assert "GET" in methods
        assert "POST" in methods
