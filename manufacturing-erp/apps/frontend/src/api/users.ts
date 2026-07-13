import { AuthUser } from '@appletree/shared-types';
import { apiRequest } from './client';

export function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', { accessToken });
}
