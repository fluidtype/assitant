/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function tomorrowAt(hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  // 1) Tenant demo
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant-aurora' },
    update: {},
    create: {
      id: 'demo-tenant-aurora',
      name: 'Demo Ristorante Aurora',
      timezone: 'Europe/Rome',
      config: {
        openingHours: {
          tue: ['19:00-23:00'],
          wed: ['19:00-23:00'],
          thu: ['19:00-23:00'],
          fri: ['19:00-23:00'],
          sat: ['19:00-23:00'],
        },
        capacity: 50,
        rules: { maxPeople: 8, minAdvanceMinutes: 60 },
      },
      features: { vertical: 'restaurant' },
    },
  });

  // 2) User demo
  const user = await prisma.user.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: '+393491234567' } },
    update: { name: 'Marco Rossi' },
    create: {
      tenantId: tenant.id,
      phone: '+393491234567',
      name: 'Marco Rossi',
    },
  });

  // 3) Booking demo (domani 20:00–22:00)
  const startAt = tomorrowAt(20, 0);
  const endAt = tomorrowAt(22, 0);

  await prisma.booking.create({
    data: {
      tenantId: tenant.id,
      userPhone: user.phone,
      name: 'Marco Rossi',
      people: 4,
      startAt,
      endAt,
      status: 'confirmed',
    },
  });

  // 4) Conversation demo
  await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      userPhone: user.phone,
      flow: 'IDLE',
      context: {},
    },
  });

  console.log('✅ Seed complete: 1 tenant, 1 user, 1 booking, 1 conversation');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
