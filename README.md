# ⚡ PulseGate - API Gateway & Developer Analytics

Hey there! 👋 **PulseGate** is a lightweight API Gateway and analytics dashboard built using **FastAPI**, **Redis**, **PostgreSQL**, and **React**. 

It handles the essential parts of managing APIs—like validating API keys, enforcing rate limits in real time, masking sensitive data in request logs, and giving developers an interactive playground to test endpoints.

---

## 🚀 What's New in the Latest Version?

Recently, PulseGate was updated with several key features and improvements:
- **Flexible JSON Payload Support**: The gateway now accepts and forwards arbitrary JSON bodies seamlessly across `GET`, `POST`, `PUT`, `DELETE`, and `PATCH` requests.
- **Smart Privacy & Data Redaction**: Sensitive headers and body fields (like passwords, auth tokens, and raw keys) are automatically sanitized and saved as `[REDACTED]` in logs to keep data safe.
- **Instant Key Sync & Auto-Expiration**: API keys automatically expire when their time limit passes, and status updates sync instantly between Redis and PostgreSQL.
- **Smoother UX & Request Tracking**: Automatic redirects after user registration, clean request tracking IDs (`req_xxxx`), and live response testing in the Playground.

---

## 🛠️ Core Features

- 🔑 **API Key Management**: Create project-isolated keys with custom rate limits and expiration dates. Keys are hashed securely using SHA-256 before storing.
- ⚡ **Redis Rate Limiting**: Lightning-fast Token Bucket rate limiting using Lua scripts to prevent request spikes and spam.
- 🔒 **Privacy-First Request Logging**: Tracks request method, path, latency, response code, and headers while redacting secret tokens.
- 🧪 **Interactive Playground**: Test endpoints directly from the browser dashboard, inspect status codes, and pass custom headers.
- 📊 **Analytics Dashboard**: Monitor usage trends, active keys, error rates, and detailed request logs in real time.

---

## 🏗️ System Architecture & Workflow

Here is how all the components fit together in PulseGate:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       CLIENT / DEVELOPER                                         │
│                                                                                                  │
│   • Dashboard User (React UI)              • API Consumer (cURL / Postman / SDK)                │
│     └─► JWT Auth Token                       └─► Header: X-API-Key or Bearer                     │
└─────────────────────────────────┬────────────────────────────────┬───────────────────────────────┘
                                  │                                │
                                  ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       FASTAPI GATEWAY SERVER                                     │
│                                                                                                  │
│  ┌────────────────────────┐    1. Validate Key Hash    ┌──────────────────────────────────────┐  │
│  │ API Key & Auth Handler ├───────────────────────────►│ PostgreSQL Database                  │  │
│  └───────────┬────────────┘                            │  • Users, Projects & API Keys        │  │
│              │ 2. Key Valid                            │  • Request Logs & Analytics History  │  │
│              ▼                                         └──────────────────▲───────────────────┘  │
│  ┌────────────────────────┐    3. Increment & Check Quota                 │                      │
│  │ Redis Rate Limiter     ├────────────────────────────┐                  │                      │
│  └───────────┬────────────┘                            │                  │                      │
│              │ 4. Under Limit                          ▼                  │                      │
│              ▼                                 ┌───────────────┐          │ 5. Save Log Record   │
│  ┌────────────────────────┐                    │  Redis Cache  │          │ (Redacted Payload &  │
│  │ Payload & Header       │                    └───────────────┘          │  Latency Metrics)    │
│  │ Redaction Engine       │                                               │                      │
│  └───────────┬────────────┘                                               │                      │
│              │                                                            │                      │
│              └────────────────────────────────────────────────────────────┘                      │
└─────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                  │ Response JSON + Rate-Limit Headers
                                                  ▼
                                ┌──────────────────────────────────┐
                                │ React Analytics & Developer UI   │
                                └──────────────────────────────────┘
```

### 🔄 Request Lifecycle: How It Works Step-by-Step

1. **Incoming Request Extraction**:
   - Client sends a request to the Gateway route (`/api/v1/gateway/*`).
   - The Gateway inspects request headers for `X-API-Key` or `Authorization: Bearer <key>`.

2. **Secure Authentication & Hash Lookup**:
   - PulseGate never stores plain-text API keys. The Gateway computes a **SHA-256 hash** of the incoming key.
   - It checks **PostgreSQL** to verify that the key exists, is marked `active`, and has not reached its `expires_at` timestamp.

3. **Fast In-Memory Rate Limiting**:
   - The Gateway queries **Redis** using a highly-efficient **Token Bucket algorithm** via Lua scripting.
   - If the request count exceeds the bucket's allowed limit, the Gateway immediately halts processing and returns an `HTTP 429 Too Many Requests` status with standard `Retry-After` headers.

4. **Payload Processing & Redaction Pipeline**:
   - If rate limits pass, the Gateway parses the request headers and JSON payload.
   - Any sensitive fields (e.g., `password`, `token`, `authorization`, `api_key`, `secret`) are automatically redacted into `[REDACTED]` to ensure secrets are never stored in log histories.

5. **Request Execution & Latency Calculation**:
   - The Gateway executes the intended target endpoint/proxy handler and records precise execution latency in milliseconds (`ms`).

6. **Log Recording & Metric Aggregation**:
   - A unique request tracking ID (e.g., `req_a1b2c3d4e5f6`) is generated.
   - The request log (containing HTTP method, path, status code, latency, redacted payload, and client IP) is committed to **PostgreSQL**.

7. **Response Delivery**:
   - The client receives the HTTP response payload along with gateway tracking headers (`X-Request-ID`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`).

---

## 📁 Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── api/          # Gateway proxy routes, auth, keys, and analytics endpoints
│   │   ├── core/         # DB connection, Redis setup, security & auth logic
│   │   ├── models/       # SQLAlchemy ORM models (User, Project, APIKey, Logs)
│   │   ├── schemas/      # Pydantic validation schemas
│   │   └── services/     # Redis rate limiting logic
│   └── tests/            # Pytest test suite
│
├── frontend/
│   ├── src/
│   │   ├── components/   # Navbar, Sidebar, and UI components
│   │   ├── context/      # Auth state management
│   │   ├── pages/        # Dashboard (Overview, Keys, Logs, Playground)
│   │   └── services/     # Axios client setup
│   └── vite.config.js
│
├── docker-compose.yml     # Full stack container setup (Postgres, Redis, Backend, Frontend)
└── README.md
```

---

## 💻 How to Run It Locally

### Option 1: Using Docker (Recommended)

Make sure Docker is installed on your machine, then run:

```bash
# 1. Clone the repository
git clone https://github.com/NAMANSAINI62/API_PROJECT.git
cd API_PROJECT

# 2. Copy environment variables file
cp .env.example .env

# 3. Spin up the full stack
docker compose up --build
```

Once started, access the apps at:
- 🌐 **Dashboard UI**: `http://localhost:3000`
- ⚡ **Swagger API Docs**: `http://localhost:8000/docs`
- 🩺 **Health Check**: `http://localhost:8000/health`

---

### Option 2: Running Manually

If you prefer running services directly:

#### 1. Start Database & Redis Services
```bash
docker compose up -d postgres redis
```

#### 2. Backend Setup (Python)
```bash
cd backend
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Linux / macOS
source venv/bin/activate

# Install dependencies and start FastAPI server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 3. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing

### Run Backend Tests
```bash
cd backend
pytest
```

### Build & Check Frontend
```bash
cd frontend
npm run build
npm run lint
```

---

## 📌 Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, Pydantic, Pytest
- **Database & Cache**: PostgreSQL, Redis
- **Frontend**: React 18, Vite, TailwindCSS, Axios, Lucide Icons
- **DevOps**: Docker, Docker Compose

---

## 📝 Author & Repository

- **Author**: Naman ([@NAMANSAINI62](https://github.com/NAMANSAINI62))
- **Repository**: [NAMANSAINI62/API_PROJECT](https://github.com/NAMANSAINI62/API_PROJECT)
\