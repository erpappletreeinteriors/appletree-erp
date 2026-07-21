import { Role } from './role';

export const AuthProvider = {
  LOCAL: 'LOCAL',
  GOOGLE: 'GOOGLE',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  authProvider: AuthProvider;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  fullName: string;
}

export interface GoogleExchangeRequest {
  code: string;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}
