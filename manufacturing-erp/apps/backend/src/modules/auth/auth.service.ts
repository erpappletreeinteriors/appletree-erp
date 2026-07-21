import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import {
  AuthTokens,
  LoginResponse,
  Role,
  SessionSummary,
} from '@appletree/shared-types';
import { AppConfig } from '../../config/configuration';
import { AuditAction } from '../../common/constants/audit-actions';
import { hashToken, generateOpaqueToken, parseDurationToDate } from '../../common/utils/token.util';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../../../generated/prisma';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MailService, MAIL_SERVICE } from '../mail/mail.service.interface';
import { AccessTokenPayload } from './request-user.interface';
import { RequestMeta } from './request-meta.interface';
import { GoogleProfile } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly auditLog: AuditLogService,
    @Inject(MAIL_SERVICE) private readonly mailService: MailService,
  ) {}

  async validateCredentials(email: string, password: string, meta: RequestMeta): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive || !user.passwordHash) {
      await this.auditLog.record({
        userId: user?.id,
        action: AuditAction.LOGIN,
        success: false,
        ...meta,
        metadata: { email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await this.auditLog.record({
        userId: user.id,
        action: AuditAction.LOGIN,
        success: false,
        ...meta,
        metadata: { email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: User, meta: RequestMeta): Promise<LoginResponse> {
    const tokens = await this.issueTokens(user, meta);
    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.LOGIN,
      success: true,
      ...meta,
    });
    return { ...tokens, user: this.toAuthUser(user) };
  }

  async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(rawRefreshToken, {
        secret: this.configService.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has been revoked or expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user, meta);
    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.TOKEN_REFRESH,
      success: true,
      ...meta,
    });
    return tokens;
  }

  async logout(userId: string, rawRefreshToken: string, meta: RequestMeta): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditLog.record({
      userId,
      action: AuditAction.LOGOUT,
      success: true,
      ...meta,
    });
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always behave the same regardless of whether the account exists, so this
    // endpoint can't be used to enumerate registered email addresses.
    if (user && user.isActive && user.passwordHash) {
      const rawToken = generateOpaqueToken();
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(
            Date.now() + this.configService.get('passwordResetTokenTtlMs', { infer: true }),
          ),
        },
      });

      const resetUrl = `${this.configService.get('frontendUrl', { infer: true })}/reset-password?token=${rawToken}`;
      await this.mailService.send({
        to: user.email,
        subject: 'Reset your Appletree Manufacturing ERP password',
        text: `A password reset was requested for this account. If this was you, use the link below (valid for a limited time):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      });
    }

    await this.auditLog.record({
      userId: user?.id,
      action: AuditAction.FORGOT_PASSWORD_REQUESTED,
      success: true,
      ...meta,
      metadata: { email },
    });
  }

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findFirst({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('This password reset link is invalid or has expired');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditLog.record({
      userId: stored.userId,
      action: AuditAction.PASSWORD_RESET,
      success: true,
      ...meta,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new BadRequestException('This account does not use a password (signed in with Google)');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditLog.record({
      userId,
      action: AuditAction.PASSWORD_CHANGED,
      success: true,
      ...meta,
    });
  }

  /** Finds-or-creates the local User record for a Google profile and issues a one-time exchange code. */
  async startGoogleLogin(profile: GoogleProfile, meta: RequestMeta): Promise<string> {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: profile.googleId },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            fullName: profile.fullName,
            googleId: profile.googleId,
            authProvider: 'GOOGLE',
            role: Role.VIEWER,
          },
        });
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const code = generateOpaqueToken();
    await this.prisma.oAuthLoginTicket.create({
      data: {
        code,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + this.configService.get('oauthTicketTtlMs', { infer: true }),
        ),
      },
    });

    await this.auditLog.record({
      userId: user.id,
      action: AuditAction.LOGIN_GOOGLE,
      success: true,
      ...meta,
    });

    return code;
  }

  async exchangeGoogleTicket(code: string, meta: RequestMeta): Promise<LoginResponse> {
    const ticket = await this.prisma.oAuthLoginTicket.findUnique({ where: { code } });

    if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
      throw new UnauthorizedException('This sign-in link is invalid or has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: ticket.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    await this.prisma.oAuthLoginTicket.update({
      where: { id: ticket.id },
      data: { usedAt: new Date() },
    });

    const tokens = await this.issueTokens(user, meta);
    return { ...tokens, user: this.toAuthUser(user) };
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new BadRequestException('Session not found or already signed out');
    }

    await this.auditLog.record({
      userId,
      action: AuditAction.SESSION_REVOKED,
      success: true,
      ...meta,
      metadata: { sessionId },
    });
  }

  async revokeAllSessions(userId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditLog.record({
      userId,
      action: AuditAction.SESSIONS_REVOKED_ALL,
      success: true,
      ...meta,
    });
  }

  private async issueTokens(user: User, meta: RequestMeta): Promise<AuthTokens> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('jwt.accessSecret', { infer: true }),
      expiresIn: this.configService.get('jwt.accessExpiresIn', { infer: true }),
      jwtid: randomUUID(),
    });

    const refreshExpiresIn = this.configService.get('jwt.refreshExpiresIn', { infer: true });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('jwt.refreshSecret', { infer: true }),
      expiresIn: refreshExpiresIn,
      jwtid: randomUUID(),
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: parseDurationToDate(refreshExpiresIn),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    return { accessToken, refreshToken };
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = this.configService.get('bcryptSaltRounds', { infer: true });
    return bcrypt.hash(password, saltRounds);
  }

  private toAuthUser(user: User): LoginResponse['user'] {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      authProvider: user.authProvider,
    };
  }
}
