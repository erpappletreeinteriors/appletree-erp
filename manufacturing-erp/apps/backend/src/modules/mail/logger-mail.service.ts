import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { MailMessage, MailService } from './mail.service.interface';

/**
 * Real, working implementation of `MailService` that logs the message instead of
 * sending it over SMTP. There is no email provider configured for this
 * environment yet; swap this provider for an SMTP/SES/SendGrid-backed
 * implementation behind the same `MailService` interface once one exists — no
 * caller needs to change.
 */
@Injectable()
export class LoggerMailService implements MailService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggerMailService.name);
  }

  async send(message: MailMessage): Promise<void> {
    this.logger.info({ to: message.to, subject: message.subject }, 'Email (logged, not sent)');
    this.logger.debug({ body: message.text }, 'Email body');
  }
}
