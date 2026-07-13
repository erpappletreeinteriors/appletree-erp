import { PrismaClient, Role } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@appletreeinteriors.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-on-first-login';
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed: admin user ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'System Administrator',
      role: Role.ADMIN,
    },
  });

  console.log(`Seed: created admin user ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
