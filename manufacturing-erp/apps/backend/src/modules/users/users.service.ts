import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../../../generated/prisma';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface PaginatedUsers {
  items: SafeUser[];
  nextCursor: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toSafeUser(user);
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const take = query.take ?? 20;
    const users = await this.prisma.user.findMany({
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: query.order ?? 'asc' },
    });

    const hasMore = users.length > take;
    const page = hasMore ? users.slice(0, take) : users;

    return {
      items: page.map((user) => this.toSafeUser(user)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  private toSafeUser(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
