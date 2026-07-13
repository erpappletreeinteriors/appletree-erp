import { Role } from '@appletree/shared-types';

export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}
