import { AuthTokens, LoginRequest, LoginResponse } from '@appletree/shared-types';
import { apiRequest } from './client';

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: credentials });
}

export function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken } });
}

export function logout(accessToken: string, refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    accessToken,
  });
}
