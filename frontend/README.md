# 🎨 PulseGate Dashboard Frontend

This directory contains the React + Vite frontend for **PulseGate**, built to give developers a clean interface to manage projects, create API keys, view live request logs, and test API endpoints interactively.

---

## 🚀 Features

- **Analytics Dashboard**: Overview of key metrics, total request counts, success rates, and active keys.
- **API Key Management**: Create, copy, and revoke hashed API keys instantly.
- **Live Logs**: Search, filter, and inspect detailed HTTP request logs (method, path, status, latency).
- **Interactive Playground**: Send test GET/POST requests directly against gateway endpoints to observe rate limits and response codes.
- **Projects & Settings**: Organization management and profile settings.

---

## 🛠️ Getting Started

### Installation

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The frontend will run locally on `http://localhost:3000` (or `http://localhost:5173` if running outside Docker).

### Environment Configuration

Create a `.env` file in this directory if you need to point to a custom backend URL:

```env
VITE_API_URL=http://localhost:8000
```

---

## 🏗️ Scripts

- `npm run dev`: Runs the app in development mode with HMR.
- `npm run build`: Bundles production-ready assets into the `dist/` folder.
- `npm run preview`: Previews the local production build.
- `npm run lint`: Runs ESLint / Oxlint rules across source files.
