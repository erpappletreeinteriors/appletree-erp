import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '@appletree/shared-types';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  const baseUser = {
    id: 'user-1',
    email: 'cutting.master@appletreeinteriors.local',
    fullName: 'Cutting Master',
    role: Role.CUTTING_MASTER,
    isActive: true,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    baseUser.passwordHash = await bcrypt.hash('correct-password', 4);

    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token'), verifyAsync: jest.fn() };

    const configService = {
      get: (key: string) => {
        const values: Record<string, string> = {
          'jwt.accessSecret': 'access-secret',
          'jwt.accessExpiresIn': '15m',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.refreshExpiresIn': '7d',
        };
        return values[key];
      },
    } as unknown as ConfigService<AppConfig, true>;

    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService,
    );
  });

  describe('validateCredentials', () => {
    it('returns the user when credentials are correct', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await authService.validateCredentials(baseUser.email, 'correct-password');

      expect(result.id).toBe(baseUser.id);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        authService.validateCredentials(baseUser.email, 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.validateCredentials('nobody@example.com', 'anything'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(
        authService.validateCredentials(baseUser.email, 'correct-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('issues an access/refresh token pair and persists the refresh token hash', async () => {
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login(baseUser as never);

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.user.email).toBe(baseUser.email);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh', () => {
    it('rejects a refresh token that is not found in the database', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(authService.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a refresh token that has already been revoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      });

      await expect(authService.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates a valid refresh token and issues a new pair', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.refresh('some-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toBe('signed-token');
    });
  });
});
