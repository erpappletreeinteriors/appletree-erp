import { NotFoundException } from '@nestjs/common';
import { Role } from '@appletree/shared-types';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prisma: { user: { findUnique: jest.Mock; findMany: jest.Mock } };

  const user = {
    id: 'user-1',
    email: 'designer@appletreeinteriors.local',
    fullName: 'A Designer',
    role: Role.DESIGNER,
    isActive: true,
    passwordHash: 'hashed',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), findMany: jest.fn() } };
    usersService = new UsersService(prisma as unknown as PrismaService);
  });

  describe('findById', () => {
    it('returns the user without the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await usersService.findById(user.id);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe(user.email);
    });

    it('throws NotFoundException when no user matches', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(usersService.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns items without a nextCursor when there is no extra row', async () => {
      prisma.user.findMany.mockResolvedValue([user]);

      const result = await usersService.list({ take: 20, order: 'asc' });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor when more rows exist than the page size', async () => {
      const secondUser = { ...user, id: 'user-2' };
      prisma.user.findMany.mockResolvedValue([user, secondUser]);

      const result = await usersService.list({ take: 1, order: 'asc' });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(user.id);
    });
  });
});
