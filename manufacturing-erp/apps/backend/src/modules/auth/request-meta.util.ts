import { Request } from 'express';
import { RequestMeta } from './request-meta.interface';

export function extractRequestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
