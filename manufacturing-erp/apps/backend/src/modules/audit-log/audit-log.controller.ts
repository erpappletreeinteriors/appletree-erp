import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogEntry, PaginatedResult, Permission } from '@appletree/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_LOG_READ)
  async list(@Query() query: ListAuditLogsQueryDto): Promise<PaginatedResult<AuditLogEntry>> {
    return this.auditLogService.list(query);
  }
}
