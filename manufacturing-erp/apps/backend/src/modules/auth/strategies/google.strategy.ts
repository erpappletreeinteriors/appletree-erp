import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AppConfig } from '../../../config/configuration';

export interface GoogleProfile {
  googleId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      clientID: configService.get('google.clientId', { infer: true }),
      clientSecret: configService.get('google.clientSecret', { infer: true }),
      callbackURL: configService.get('google.callbackUrl', { infer: true }),
      scope: ['profile', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google account has no verified email'), false);
      return;
    }

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      fullName: profile.displayName || email,
    };

    done(null, googleProfile);
  }
}
