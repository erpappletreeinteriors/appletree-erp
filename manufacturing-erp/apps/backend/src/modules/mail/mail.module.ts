import { Module } from '@nestjs/common';
import { MAIL_SERVICE } from './mail.service.interface';
import { LoggerMailService } from './logger-mail.service';

@Module({
  providers: [{ provide: MAIL_SERVICE, useClass: LoggerMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
