import { ReactNode, useCallback, useMemo, useState } from 'react';
import { AuthUser } from '@appletree/shared-types';
import * as authApi from '../api/auth';
import { AuthContext, AuthContextValue } from './auth-context';

const STORAGE_KEY = 'appletree.auth.refreshToken';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.login({ email, password });
      setUser(response.user);
      setAccessToken(response.accessToken);
      localStorage.setItem(STORAGE_KEY, response.refreshToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = localStorage.getItem(STORAGE_KEY);
    if (accessToken && refreshToken) {
      try {
        await authApi.logout(accessToken, refreshToken);
      } catch {
        // Best-effort revoke — proceed with clearing local state regardless.
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setAccessToken(null);
  }, [accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isLoading, error, signIn, signOut }),
    [user, accessToken, isLoading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
