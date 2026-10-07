import json
import sys
from unittest.mock import patch, MagicMock

# 1. Mock DB Engine to allow app to import without a real DB connection
import sqlalchemy
mock_engine = MagicMock()
sqlalchemy.create_engine = MagicMock(return_value=mock_engine)

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

# 2. Mock Redis client for Redis behavior
class MockRedis:
    queue = []
        
    @staticmethod
    def lpush(key, value):
        MockRedis.queue.insert(0, value)
        return len(MockRedis.queue)
        
    @staticmethod
    def rpop(key):
        if MockRedis.queue:
            return MockRedis.queue.pop()
        return None
        
    @staticmethod
    def rpush(key, value):
        MockRedis.queue.append(value)
        return len(MockRedis.queue)

mock_redis_instance = MockRedis()

# Now it's safe to import app and other modules
from app.main import app
from fastapi.testclient import TestClient
from app.api.gateway import REDIS_QUEUE_KEY

client = TestClient(app)

def run_tests():
    print("--- TESTING REDIS DB DOWN HANDLING ---")
    
    print("\n1. Simulating DB Down (Patching Session.query & Session.commit)")
    
    # We patch get_redis to return our MockRedis
    with patch("app.api.gateway.get_redis", return_value=mock_redis_instance):
        with patch.object(Session, 'query', side_effect=OperationalError("DB DOWN", None, None)):
            with patch.object(Session, 'commit', side_effect=OperationalError("DB DOWN", None, None)):
                response = client.get("/test/status/300", headers={"X-API-Key": "test_key_123"})
                
                print("Gateway Request Status:", response.status_code)
                if response.status_code == 503:
                    print("[OK] Gateway properly returns 503 with clear message.")
                else:
                    print("[FAIL] Expected 503, got:", response.status_code)

        print("\n2. Checking Redis fallback queue")
        if len(MockRedis.queue) == 1:
            entry = json.loads(MockRedis.queue[0])
            print("[OK] Log correctly appended to Redis queue!")
            print(f"     -> queued status_code: {entry.get('status_code')}")
            print(f"     -> queued created_at: {entry.get('created_at')}")
        else:
            print("[FAIL] Redis queue is empty or has wrong number of items:", len(MockRedis.queue))

        print("\n3. Testing Replay Functionality")
        from app.api.gateway import replay_fallback_logs
        
        # We will mock the DB so that the first replay succeeds
        # We'll just patch Session.commit to NOT raise an error this time.
        with patch.object(Session, 'commit', return_value=None):
            with patch.object(Session, 'query', return_value=MagicMock()):
                # Create a fake session
                db = Session(bind=mock_engine)
                replay_fallback_logs(db)
                
        if len(MockRedis.queue) == 0:
            print("[OK] Logs were successfully replayed and popped from Redis!")
        else:
            print("[FAIL] Redis queue still has items:", len(MockRedis.queue))

if __name__ == "__main__":
    run_tests()
