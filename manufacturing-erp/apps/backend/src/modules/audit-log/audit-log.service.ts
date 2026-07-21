import { Injectable } from '@nestjs/common';
import { AuditLogEntry, PaginatedResult } from '@appletree/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface RecordAuditLogInput {
  userId?: string | null;
  action: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        success: input.success,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async list(query: ListAuditLogsQueryDto): Promise<PaginatedResult<AuditLogEntry>> {
    const take = query.take ?? 20;
    const entries = await this.prisma.auditLog.findMany({
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      ...(query.action ? { where: { action: query.action } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });

    const hasMore = entries.length > take;
    const page = hasMore ? entries.slice(0, take) : entries;

    return {
      items: page.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        userEmail: entry.user?.email ?? null,
        action: entry.action,
        success: entry.success,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
