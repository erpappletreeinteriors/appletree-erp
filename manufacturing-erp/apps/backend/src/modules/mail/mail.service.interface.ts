export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailService {
  send(message: MailMessage): Promise<void>;
}
