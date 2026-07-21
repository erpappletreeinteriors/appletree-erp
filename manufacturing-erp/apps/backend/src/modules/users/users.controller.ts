import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@appletree/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/request-user.interface';
import { extractRequestMeta } from '../auth/request-meta.util';
import { UsersService, PaginatedUsers, SafeUser } from './users.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: RequestUser): Promise<SafeUser> {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ): Promise<SafeUser> {
    return this.usersService.updateProfile(user.id, dto.fullName, extractRequestMeta(req));
  }

  @Get()
  @Roles(Role.ADMIN)
  async list(@Query() query: ListUsersQueryDto): Promise<PaginatedUsers> {
    return this.usersService.list(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  async findOne(@Param('id') id: string): Promise<SafeUser> {
    return this.usersService.findById(id);
  }
}
