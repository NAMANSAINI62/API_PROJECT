# PulseGate

PulseGate is a full-stack API gateway and usage analytics platform built with
FastAPI, PostgreSQL, Redis, and React/Vite.

## What it does

- User authentication and project management
- Hashed API-key creation, revocation, and deletion
- API gateway authentication through `X-API-Key` or `Authorization`
- Redis-backed fixed-window rate limiting
- PostgreSQL request logging and usage analytics
- Status-code testing for successful, client-error, redirect, and server-error responses
- Responsive dashboard for overview metrics, logs, usage, projects, API keys, and Playground requests

The application currently handles requests synchronously in FastAPI. It does
not use Celery, a separate worker process, an event queue, or webhook delivery.

## Architecture

```text
React/Vite dashboard
        │ HTTP
        ▼
FastAPI application ───────► PostgreSQL
        │
        └───────────────────► Redis
                              (rate limiting)
```

### Technology choices

- **FastAPI/Uvicorn** handles the REST API and gateway routes.
- **PostgreSQL** stores users, projects, API keys, and request logs.
- **Redis** performs low-latency atomic counters and expiration for rate limiting.
- **React/Vite** provides the dashboard and interactive Playground.
- **Docker Compose** runs PostgreSQL, Redis, the backend, and the frontend locally.

## Repository layout

```text
backend/
  app/
    api/       API and gateway routes
    core/      configuration, database, Redis, and security helpers
    models/    SQLAlchemy models
    schemas/   Pydantic request and response schemas
    services/  rate-limiting service
  tests/       backend test suite
frontend/
  src/
    components/ shared layout and UI components
    pages/      dashboard pages
    services/   HTTP client services
docker-compose.yml
.env.example
```

## Configuration and secrets

Never commit `.env` or place real credentials in source files, README
examples, Dockerfiles, or frontend code. Use `.env.example` as a template and
provide real values through a local, ignored `.env` file or a deployment
secret manager.

Required production values include:

- A strong, unique `POSTGRES_PASSWORD`
- A strong, unique `REDIS_PASSWORD`
- A randomly generated `JWT_SECRET` of at least 32 characters
- HTTPS values for `SERVER_BASE_URL`, `FRONTEND_URL`, and `VITE_API_URL`

If a real credential is ever committed or shared, revoke and replace it
immediately; deleting the file alone does not invalidate the credential.

## Run with Docker Compose

1. Copy the template and fill in local or deployment-only values:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start the stack:

   ```powershell
   docker compose up --build
   ```

3. Open:

   - Frontend: `http://localhost:3000`
   - API documentation: `http://localhost:8000/docs`
   - Health check: `http://localhost:8000/health`

The Compose file binds development ports to localhost. PostgreSQL and Redis
are available to the application over the internal Compose network and are
not published as public host services.

## Run locally without the frontend container

Start infrastructure services:

```powershell
docker compose up -d postgres redis
```

Run the backend:

```powershell
Set-Location backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run the frontend in another terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

There is no worker command to run. No Celery or background-worker service is
part of the current implementation.

## Gateway examples

Create an API key in the dashboard, then use the raw key only in a local
shell or secret manager:

```powershell
curl.exe -H "X-API-Key: <your-api-key>" `
  http://localhost:8000/api/v1/test/users
```

The default rate limit is 5 requests per minute. The window duration remains
60 seconds, and each API key can have its own configured limit.

Gateway test routes include:

- `GET /api/v1/test/users`
- `GET /api/v1/test/users/{user_id}`
- `GET /api/v1/test/status/{status_code}`

Requests are logged to PostgreSQL and surfaced in the Logs and Usage pages.

## Testing

Run the backend suite:

```powershell
Set-Location backend
pytest
```

Build and lint the frontend:

```powershell
Set-Location frontend
npm run build
npm run lint
```

## GitHub Deployment & Repository Setup

To create a new GitHub repository and push this project:

1. Create an empty repository on GitHub (e.g. named `pulsegate` or `api-project`).
2. Initialize and push from your local repository:

```powershell
git add .
git commit -m "Initial commit: PulseGate API Gateway and Dashboard"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

## Interview summary

> PulseGate is a FastAPI API gateway with PostgreSQL for persistent data and
> Redis for real-time fixed-window rate limiting. The React/Vite dashboard
> provides project, API-key, log, usage, and Playground workflows. The current
> version is synchronous and does not use Celery or a separate worker. A
> background job system could be added later for webhook delivery, retries,
> email notifications, or report generation if those features are introduced.

