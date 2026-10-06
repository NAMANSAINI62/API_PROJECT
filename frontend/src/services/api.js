import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors globally (only for dashboard/auth endpoints, NOT gateway requests)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If the 401 error came from an internal dashboard route (not a gateway test request with X-API-Key), log out
    const isGatewayRequest = Boolean(error.config?.headers?.['X-API-Key']);
    if (error.response?.status === 401 && !isGatewayRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

export const formatDateIST = (dateStr) => {
  if (!dateStr) return '—';
  let safeDateStr = dateStr;
  if (!safeDateStr.endsWith('Z') && !safeDateStr.includes('+') && safeDateStr.includes('T')) {
    safeDateStr += 'Z'; // Force UTC parsing
  }
  const d = new Date(safeDateStr);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTimeIST = (dateStr) => {
  if (!dateStr) return '—';
  let safeDateStr = dateStr;
  if (!safeDateStr.endsWith('Z') && !safeDateStr.includes('+') && safeDateStr.includes('T')) {
    safeDateStr += 'Z'; // Force UTC parsing
  }
  const d = new Date(safeDateStr);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
};

export const formatTimeIST = (dateStr) => {
  if (!dateStr) return '—';
  let safeDateStr = dateStr;
  if (!safeDateStr.endsWith('Z') && !safeDateStr.includes('+') && safeDateStr.includes('T')) {
    safeDateStr += 'Z'; // Force UTC parsing
  }
  const d = new Date(safeDateStr);
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
};

// ── Auth Service ─────────────────────────────────────────────────────────────

export const authService = {
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

// ── Project Service ──────────────────────────────────────────────────────────

export const projectService = {
  getAll: async () => {
    const res = await api.get('/projects');
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/projects', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.patch(`/projects/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/projects/${id}`);
    return res.data;
  },
};

// ── API Key Service ──────────────────────────────────────────────────────────

export const apiKeyService = {
  getAll: async (projectId = '', status = '', environment = '', search = '') => {
    const params = typeof projectId === 'object'
      ? { ...projectId }
      : {};
    if (typeof projectId !== 'object') {
      if (projectId) params.project_id = projectId;
      if (status) params.status = status;
      if (environment) params.environment = environment;
      if (search) params.search = search;
    }
    const res = await api.get('/keys', { params });
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/keys', data);
    return res.data;
  },
  revoke: async (id) => {
    const res = await api.patch(`/keys/${id}/revoke`);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/keys/${id}`);
    return res.data;
  },
};

// ── Log Service ──────────────────────────────────────────────────────────────

export const logService = {
  getAll: async (params = {}) => {
    const res = await api.get('/logs', { params });
    return res.data;
  },
};

// ── Usage Service ────────────────────────────────────────────────────────────

export const usageService = {
  getStats: async (projectId = '', days = 7) => {
    const params = typeof projectId === 'object'
      ? { ...projectId }
      : { days };
    if (typeof projectId !== 'object' && projectId) params.project_id = projectId;
    if (typeof projectId === 'object' && params.days === undefined) params.days = days;
    const res = await api.get('/usage', { params });
    return res.data;
  },
};

// ── Gateway Service ──────────────────────────────────────────────────────────

export const gatewayService = {
  executeRealRequest: async ({ apiKey, method, endpoint, queryParams = {}, headers = {}, body = null }) => {
    const normalizedEndpoint = endpoint.startsWith('/api/v1')
      ? endpoint.slice('/api/v1'.length)
      : endpoint;
    const gatewayBaseURL = API_URL.replace(/\/api\/v1\/?$/, '');
    const requestConfig = {
      method,
      baseURL: gatewayBaseURL,
      url: normalizedEndpoint,
      params: queryParams,
      headers: {
        ...headers,
        'X-API-Key': apiKey,
      },
    };
    if (body !== null && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      requestConfig.data = body;
    }
    return api.request(requestConfig);
  },
};
