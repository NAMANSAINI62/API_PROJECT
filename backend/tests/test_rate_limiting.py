"""
Tests for API key rate limiting, expiration, and revocation.
Uses the FastAPI TestClient with a SQLite in-memory database.
"""
import time
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Patch database and Redis before importing app
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_pulsegate.db"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from app.core.database import Base, engine
from app.main import app
from app.services.rate_limiter import RateLimitService, RateLimitResult

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    """Re-create all tables before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def register_and_login():
    """Helper: register a user and return (token, user_id)."""
    client.post("/api/v1/auth/register", json={
        "name": "Test User",
        "email": f"test_{time.time_ns()}@example.com",
        "password": "password123"
    })
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
    """Helper: create a project and return project_id."""
    res = client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "environment": "production"},
        headers={"Authorization": f"Bearer {token}"}
    )
    return res.json()["id"]


def create_api_key(token, project_id, rate_limit=5, expiration_days=7):
    """Helper: create an API key and return (raw_key, key_id, response_json)."""
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
    assert res.status_code == 201, f"Key creation failed: {res.json()}"
    data = res.json()
    return data["raw_key"], data["id"], data


# ---------- Tests ----------

class TestAPIKeyCreation:
    def test_create_key_with_rate_limit(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        _, _, data = create_api_key(token, project_id, rate_limit=10)
        assert data["rate_limit_per_minute"] == 10

    def test_rate_limit_stored_correctly(self):
        token, _ = register_and_login()
        project_id = create_project(token)

        # Create two keys with different limits
        _, id_a, data_a = create_api_key(token, project_id, rate_limit=5)
        _, id_b, data_b = create_api_key(token, project_id, rate_limit=100)

        assert data_a["rate_limit_per_minute"] == 5
        assert data_b["rate_limit_per_minute"] == 100

    def test_invalid_rate_limit_rejected(self):
        token, _ = register_and_login()
        project_id = create_project(token)

        # Zero
        res = client.post(
            "/api/v1/keys",
            json={
                "project_id": project_id,
                "name": "Bad Key",
                "environment": "production",
                "rate_limit_per_minute": 0,
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 422

        # Negative
        res = client.post(
            "/api/v1/keys",
            json={
                "project_id": project_id,
                "name": "Bad Key",
                "environment": "production",
                "rate_limit_per_minute": -5,
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 422

        # Over 1000
        res = client.post(
            "/api/v1/keys",
            json={
                "project_id": project_id,
                "name": "Bad Key",
                "environment": "production",
                "rate_limit_per_minute": 9999,
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 422

    def test_secret_not_exposed_after_creation(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, key_id, _ = create_api_key(token, project_id)

        # GET list should NOT contain raw_key
        res = client.get(
            "/api/v1/keys",
            headers={"Authorization": f"Bearer {token}"}
        )
        keys = res.json()
        for k in keys:
            assert "raw_key" not in k


class TestGatewayRateLimiting:
    """Tests that use a mocked RateLimitService to simulate Redis behavior."""

    def test_request_under_limit_returns_200(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id, rate_limit=5)

        mock_result = RateLimitResult(is_limited=False, current_count=1, limit=5, ttl_remaining=55)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.get(
                "/api/v1/test/users",
                headers={"Authorization": f"Bearer {raw_key}"}
            )
            assert res.status_code == 200
            assert res.headers.get("X-RateLimit-Limit") == "5"
            assert res.headers.get("X-RateLimit-Remaining") == "4"

    def test_request_at_exact_limit_allowed(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id, rate_limit=5)

        mock_result = RateLimitResult(is_limited=False, current_count=5, limit=5, ttl_remaining=10)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.get(
                "/api/v1/test/users",
                headers={"Authorization": f"Bearer {raw_key}"}
            )
            assert res.status_code == 200
            assert res.headers.get("X-RateLimit-Remaining") == "0"

    def test_request_above_limit_returns_429(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, _, _ = create_api_key(token, project_id, rate_limit=5)

        mock_result = RateLimitResult(is_limited=True, current_count=6, limit=5, ttl_remaining=42)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            res = client.get(
                "/api/v1/test/users",
                headers={"Authorization": f"Bearer {raw_key}"}
            )
            assert res.status_code == 429
            body = res.json()
            assert "Rate limit exceeded" in body["detail"]
            assert "6/5" in body["detail"]
            assert res.headers.get("X-RateLimit-Limit") == "5"
            assert res.headers.get("X-RateLimit-Remaining") == "0"
            assert res.headers.get("Retry-After") == "42"

    def test_429_creates_log_entry(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, key_id, _ = create_api_key(token, project_id, rate_limit=5)

        mock_result = RateLimitResult(is_limited=True, current_count=6, limit=5, ttl_remaining=42)
        with patch.object(RateLimitService, 'check', return_value=mock_result):
            client.get(
                "/api/v1/test/users",
                headers={"Authorization": f"Bearer {raw_key}"}
            )

        # Check logs
        res = client.get(
            "/api/v1/logs",
            headers={"Authorization": f"Bearer {token}"}
        )
        logs = res.json()
        assert any(log["status_code"] == 429 for log in logs)

    def test_independent_counters_per_key(self):
        """Key A and Key B must have independent rate-limit counters."""
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key_a, id_a, _ = create_api_key(token, project_id, rate_limit=5)
        raw_key_b, id_b, _ = create_api_key(token, project_id, rate_limit=10)

        call_count = {"a": 0, "b": 0}

        def mock_check(api_key_id, limit_per_minute):
            if api_key_id == id_a:
                call_count["a"] += 1
                is_limited = call_count["a"] > 5
                return RateLimitResult(
                    is_limited=is_limited,
                    current_count=call_count["a"],
                    limit=5,
                    ttl_remaining=55
                )
            else:
                call_count["b"] += 1
                return RateLimitResult(
                    is_limited=False,
                    current_count=call_count["b"],
                    limit=10,
                    ttl_remaining=55
                )

        with patch.object(RateLimitService, 'check', side_effect=mock_check):
            # Exhaust Key A's limit
            for _ in range(5):
                res = client.get("/api/v1/test/users",
                                 headers={"Authorization": f"Bearer {raw_key_a}"})
                assert res.status_code == 200

            # Key A should be rate limited
            res = client.get("/api/v1/test/users",
                             headers={"Authorization": f"Bearer {raw_key_a}"})
            assert res.status_code == 429

            # Key B should still work
            res = client.get("/api/v1/test/users",
                             headers={"Authorization": f"Bearer {raw_key_b}"})
            assert res.status_code == 200


class TestExpiration:
    def test_expired_key_rejected(self):
        token, _ = register_and_login()
        project_id = create_project(token)

        # Create key with very short expiration, then manually expire it
        raw_key, key_id, _ = create_api_key(token, project_id, expiration_days=1)

        # Manually update the expires_at to the past
        from app.core.database import SessionLocal
        from app.models.all_models import APIKey
        from datetime import datetime, timedelta
        db = SessionLocal()
        key = db.query(APIKey).filter(APIKey.id == key_id).first()
        key.expires_at = datetime.utcnow() - timedelta(hours=1)
        db.commit()
        db.close()

        res = client.get(
            "/api/v1/test/users",
            headers={"Authorization": f"Bearer {raw_key}"}
        )
        assert res.status_code == 401
        assert "expired" in res.json()["detail"].lower()


class TestRevocation:
    def test_revoked_key_rejected(self):
        token, _ = register_and_login()
        project_id = create_project(token)
        raw_key, key_id, _ = create_api_key(token, project_id)

        # Revoke the key
        res = client.post(
            f"/api/v1/keys/{key_id}/revoke",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        assert res.json()["status"] == "revoked"

        # Try to use revoked key
        res = client.get(
            "/api/v1/test/users",
            headers={"Authorization": f"Bearer {raw_key}"}
        )
        assert res.status_code == 401
        assert "revoked" in res.json()["detail"].lower()
