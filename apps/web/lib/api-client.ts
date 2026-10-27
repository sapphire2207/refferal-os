/**
 * Production-Grade API Client for Heals on Wheels
 * Integrates with apps/api NestJS backend at /api/v1
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('heals_access_token');
      this.refreshToken = localStorage.getItem('heals_refresh_token');
    }
  }

  setTokens(accessToken: string | null, refreshToken: string | null) {
    this.token = accessToken;
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      if (accessToken) {
        localStorage.setItem('heals_access_token', accessToken);
      } else {
        localStorage.removeItem('heals_access_token');
      }

      if (refreshToken) {
        localStorage.setItem('heals_refresh_token', refreshToken);
      } else {
        localStorage.removeItem('heals_refresh_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  clearTokens() {
    this.setTokens(null, null);
  }

  private onTokenRefreshed(token: string) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  async request<T>(
    endpoint: string,
    options: RequestInit & { requiresAuth?: boolean; idempotencyKey?: string } = {},
  ): Promise<T> {
    const { requiresAuth = true, idempotencyKey, headers: customHeaders, ...rest } = options;

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(customHeaders as Record<string, string>),
    };

    if (idempotencyKey) {
      headers['x-idempotency-key'] = idempotencyKey;
    }

    if (requiresAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...rest,
      headers,
    });

    // Handle 401 Unauthorized by attempting Refresh Token Rotation
    if (response.status === 401 && requiresAuth && this.refreshToken && !endpoint.includes('/auth/refresh')) {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            this.setTokens(data.accessToken, data.refreshToken);
            this.isRefreshing = false;
            this.onTokenRefreshed(data.accessToken);
          } else {
            this.clearTokens();
            this.isRefreshing = false;
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
              window.location.href = '/login';
            }
            throw new ApiError(401, 'Session expired. Please log in again.');
          }
        } catch (err) {
          this.clearTokens();
          this.isRefreshing = false;
          throw err;
        }
      }

      // Wait for the new token
      return new Promise<T>((resolve, reject) => {
        this.addRefreshSubscriber(async (newToken: string) => {
          try {
            headers['Authorization'] = `Bearer ${newToken}`;
            const retryRes = await fetch(url, { ...rest, headers });
            if (!retryRes.ok) {
              const errorData = await retryRes.json().catch(() => ({}));
              reject(new ApiError(retryRes.status, errorData.message || 'Request failed', errorData));
            } else {
              resolve((await retryRes.json()) as T);
            }
          } catch (retryErr) {
            reject(retryErr);
          }
        });
      });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || response.statusText || 'Request failed';
      throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Convenience methods
  get<T>(endpoint: string, options?: RequestInit & { requiresAuth?: boolean }) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestInit & { requiresAuth?: boolean; idempotencyKey?: string }) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: any, options?: RequestInit & { requiresAuth?: boolean; idempotencyKey?: string }) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestInit & { requiresAuth?: boolean }) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errorData.message || 'Upload failed', errorData);
    }

    return res.json();
  }
}

export const apiClient = new ApiClient();

/**
 * Normalizes API response structures into a guaranteed array of items.
 * Handles { data: T[] }, { items: T[] }, T[], or undefined.
 */
export function extractApiList<T>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.items)) return res.items;
  return [];
}
