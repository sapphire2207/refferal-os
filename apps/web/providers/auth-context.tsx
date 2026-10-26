'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '@heals/types';
import { apiClient } from '@/lib/api-client';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean; sessionToken?: string }>;
  verifyMfa: (email: string, token: string, sessionToken: string) => Promise<void>;
  logout: () => Promise<void>;
  switchDemoRole?: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({}),
  verifyMfa: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadCurrentUser = useCallback(async () => {
    const token = apiClient.getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await apiClient.get<{ user: User }>('/auth/me');
      if (data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
        apiClient.clearTokens();
      }
    } catch (err: any) {
      console.warn('Failed to fetch current user:', err);
      // If error is 401 or user suspended, clear state
      if (err?.status === 401 || err?.status === 403) {
        apiClient.clearTokens();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post<{
        user?: User;
        accessToken?: string;
        refreshToken?: string;
        mfaRequired?: boolean;
        sessionToken?: string;
      }>('/auth/login', { email, password }, { requiresAuth: false });

      if (res.mfaRequired) {
        setIsLoading(false);
        return { mfaRequired: true, sessionToken: res.sessionToken };
      }

      if (res.accessToken && res.refreshToken && res.user) {
        apiClient.setTokens(res.accessToken, res.refreshToken);
        setUser(res.user);
        toast.success(`Welcome back, ${res.user.firstName}!`);
        router.push('/dashboard');
      }

      return {};
    } catch (err: any) {
      toast.error('Authentication Failed', {
        description: err.message || 'Invalid credentials or account suspended.',
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyMfa = async (email: string, token: string, sessionToken: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>('/auth/mfa/verify', { email, token, sessionToken }, { requiresAuth: false });

      if (res.accessToken && res.refreshToken && res.user) {
        apiClient.setTokens(res.accessToken, res.refreshToken);
        setUser(res.user);
        toast.success(`MFA Verified! Welcome, ${res.user.firstName}!`);
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error('MFA Verification Failed', {
        description: err.message || 'Invalid authentication code.',
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const refreshToken = apiClient.getRefreshToken();
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
      }
    } finally {
      apiClient.clearTokens();
      setUser(null);
      toast.info('Logged out securely');
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        verifyMfa,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
