import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    'Content-Type': 'application/json',
  },
});

let csrfRequest: Promise<void> | null = null;

api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();
  if (method && !['get', 'head', 'options'].includes(method) && !document.cookie.includes('XSRF-TOKEN=')) {
    csrfRequest ??= api.get('/auth/csrf').then(() => undefined).finally(() => {
      csrfRequest = null;
    });
    await csrfRequest;
  }
  return config;
});

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export function normalizeError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body && typeof body === 'object' && 'title' in body) {
      const errorBody = body as Record<string, unknown>;
      return {
        type: typeof errorBody.type === 'string' ? errorBody.type : 'about:blank',
        title: typeof errorBody.title === 'string' ? errorBody.title : err.message,
        status: err.response?.status ?? 0,
        detail: typeof errorBody.detail === 'string' ? errorBody.detail : undefined,
        instance: typeof errorBody.instance === 'string' ? errorBody.instance : undefined,
      };
    }
    return {
      type: 'about:blank',
      title: err.message || 'Network error',
      status: err.response?.status ?? 0,
    };
  }
  return {
    type: 'about:blank',
    title: err instanceof Error ? err.message : 'An unexpected error occurred',
    status: 0,
  };
}
