# ⚡ PulseGate

PulseGate is an API Gateway and developer analytics dashboard I built to handle API key management, rate limiting, and request monitoring in one place.

It combines a **FastAPI** backend with **Redis** for fast, atomic rate-limiting and **PostgreSQL** for persistent request logging, paired with a modern **React + Vite** frontend dashboard.

---

## 🛠️ Key Features

- **Authentication & Project Isolation**: Create projects and generate secure, hashed API keys (`X-API-Key` or `Authorization: Bearer`).
- **Real-Time Rate Limiting**: Powered by Redis fixed-window counters to enforce custom per-key request limits seamlessly.
- **Request Logging & Analytics**: Tracks method, status code, latency, and endpoints directly in PostgreSQL.
- **Interactive Developer Playground**: Test endpoints, custom headers, and inspect live response codes right from the browser.
- **Clean Analytics Dashboard**: Monitor usage trends, key status, log history, and error rates.

---

## 🏗️ Architecture Overview

```text
       ┌────────────────────────┐
       │   React Dashboard UI   │
       └───────────┬────────────┘
                   │ HTTP
                   ▼
       ┌────────────────────────┐
       │   FastAPI Gateway      │
       └─────┬────────────┬─────┘
             │            │
  (Auth/Logs)│            │(Rate Limits)
             ▼            ▼
      ┌────────────┐ ┌──────────┐
      │ PostgreSQL │ │  Redis   │
      └────────────┘ └──────────┘
```

---

## 📁 Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── api/          # Gateway routes, auth, logs, and analytics endpoints
│   │   ├── core/         # DB connection, Redis client, security & auth logic
│   │   ├── models/       # SQLAlchemy ORM database models
│   │   ├── schemas/      # Pydantic validation schemas
│   │   └── services/     # Redis rate limiting service logic
│   └── tests/            # Pytest suite for gateway endpoints & rate limits
│
├── frontend/
│   ├── src/
│   │   ├── components/   # UI components, layout, and sidebar
│   │   ├── context/      # Auth state management
│   │   ├── pages/        # Dashboard pages (Overview, Keys, Logs, Playground)
│   │   └── services/     # Axios API client setup
│   └── vite.config.js
│
├── docker-compose.yml     # Complete stack container setup
└── README.md
```

---

## 🚀 Quick Start (Using Docker Compose)

The easiest way to get everything up and running locally is with Docker:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/NAMANSAINI62/API_PROJECT.git
   cd API_PROJECT
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Spin up the full stack**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   - 🌐 **Dashboard UI**: `http://localhost:3000`
   - ⚡ **API Documentation**: `http://localhost:8000/docs`
   - 🩺 **Health Check**: `http://localhost:8000/health`

---

## 💻 Manual Local Setup

If you prefer running services outside Docker containers:

### 1. Backend Setup

```bash
# Spin up Postgres & Redis background services
docker compose up -d postgres redis

# Navigate to backend and create virtual env
cd backend
python -m venv venv

# Activate venv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install requirements & start server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Running Tests

### Backend Unit & Integration Tests
```bash
cd backend
pytest
```

### Frontend Build & Lint Checks
```bash
cd frontend
npm run build
npm run lint
```

---

## 📌 Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic v2
- **Database**: PostgreSQL, Redis
- **Frontend**: React 18, Vite, TailwindCSS, Lucide Icons
- **DevOps**: Docker, Docker Compose

---

## 📝 Author & Repository

- **GitHub Repository**: [NAMANSAINI62/API_PROJECT](https://github.com/NAMANSAINI62/API_PROJECT)
