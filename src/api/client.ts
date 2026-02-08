import axios from 'axios';

// In dev: /api is proxied by Vite. In prod: set VITE_API_URL to your backend URL (e.g. https://api.yoursite.com).
const baseURL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : '');

if (!import.meta.env.DEV && !baseURL) {
  console.warn(
    '[SBI Admin] VITE_API_URL is not set. API calls will fail. Set it in your build environment (e.g. Coolify env vars).'
  );
}

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
