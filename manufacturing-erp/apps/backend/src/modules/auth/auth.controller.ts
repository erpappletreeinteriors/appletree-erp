import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthTokens, LoginResponse, SessionSummary } from '@appletree/shared-types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from './request-user.interface';
import { extractRequestMeta } from './request-meta.util';
import { GoogleProfile } from './strategies/google.strategy';
import { AppConfig } from '../../config/configuration';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    const meta = extractRequestMeta(req);
    const user = await this.authService.validateCredentials(dto.email, dto.password, meta);
    return this.authService.login(user, meta);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.refresh(dto.refreshToken, extractRequestMeta(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: RequestUser,
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.logout(user.id, dto.refreshToken, extractRequestMeta(req));
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.authService.forgotPassword(dto.email, extractRequestMeta(req));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.authService.resetPassword(dto.token, dto.newPassword, extractRequestMeta(req));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      extractRequestMeta(req),
    );
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // The 'google' guard intercepts the request and redirects to Google's
    // consent screen before this handler body ever runs.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfile;
    const code = await this.authService.startGoogleLogin(profile, extractRequestMeta(req));
    const frontendUrl = this.configService.get('frontendUrl', { infer: true });
    res.redirect(`${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}`);
  }

  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleExchange(
    @Body() dto: GoogleExchangeDto,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    return this.authService.exchangeGoogleTicket(dto.code, extractRequestMeta(req));
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async listSessions(@CurrentUser() user: RequestUser): Promise<SessionSummary[]> {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.revokeSession(user.id, sessionId, extractRequestMeta(req));
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async revokeAllSessions(@CurrentUser() user: RequestUser, @Req() req: Request): Promise<void> {
    await this.authService.revokeAllSessions(user.id, extractRequestMeta(req));
  }
}
