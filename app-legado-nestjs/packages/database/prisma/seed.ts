import { PrismaClient, ServiceCategory } from "@prisma/client";
import { withTenantContext } from "../src/index";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Funilaria de exemplo (tenant de dev)
  const shop = await prisma.shop.upsert({
    where: { slug: "sunshine-auto" },
    update: {},
    create: {
      name: "Sunshine Auto Body",
      slug: "sunshine-auto",
      email: "contact@sunshineauto.com",
      phone: "+1 (555) 123-4567",
      address: "1234 Main St",
      city: "Miami",
      state: "FL",
      country: "US",
      zip_code: "33101",
      timezone: "America/New_York",
      default_locale: "en",
      is_active: true,
      is_verified: true,
    },
  });

  console.log(`✓ Shop criada: ${shop.name} (${shop.id})`);

  // Usuário admin da funilaria
  const user = await prisma.shopUser.upsert({
    where: { clerk_id: "dev_clerk_owner_001" },
    update: {},
    create: {
      shop_id: shop.id,
      clerk_id: "dev_clerk_owner_001",
      email: "owner@sunshineauto.com",
      name: "John Smith",
      role: "OWNER",
      is_active: true,
    },
  });

  console.log(`✓ Usuário criado: ${user.name}`);

  // Serviços da funilaria
  const services: { category: ServiceCategory; name: string }[] = [
    { category: "COLLISION_REPAIR", name: "Collision Repair" },
    { category: "PAINT_JOB", name: "Full Paint Job" },
    { category: "PAINT_JOB", name: "Partial Paint Job" },
    { category: "DENT_REMOVAL", name: "Paintless Dent Repair (PDR)" },
    { category: "POLISHING", name: "Full Detail & Polish" },
  ];

  for (const [i, svc] of services.entries()) {
    await prisma.shopService.upsert({
      where: {
        id: `seed-service-${i}`,
      },
      update: {},
      create: {
        id: `seed-service-${i}`,
        shop_id: shop.id,
        category: svc.category,
        name: svc.name,
        is_active: true,
        sort_order: i,
      },
    });
  }

  console.log(`✓ ${services.length} serviços criados`);

  // Disponibilidade (Seg-Sex 8h-18h, Sáb 8h-14h)
  const availability = [
    { day: 1, open: "08:00", close: "18:00" }, // Mon
    { day: 2, open: "08:00", close: "18:00" }, // Tue
    { day: 3, open: "08:00", close: "18:00" }, // Wed
    { day: 4, open: "08:00", close: "18:00" }, // Thu
    { day: 5, open: "08:00", close: "18:00" }, // Fri
    { day: 6, open: "08:00", close: "14:00" }, // Sat
  ];

  for (const av of availability) {
    await prisma.shopAvailability.create({
      data: {
        shop_id: shop.id,
        day_of_week: av.day,
        open_time: av.open,
        close_time: av.close,
        is_active: true,
      },
    });
  }

  console.log(`✓ Disponibilidade configurada`);

  // Cliente final de exemplo
  const customer = await prisma.customer.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      email: "customer@example.com",
      name: "Jane Doe",
      phone: "+1 (555) 987-6543",
      locale: "en",
    },
  });

  console.log(`✓ Cliente criado: ${customer.name}`);

  // Quote de exemplo
  const quote = await prisma.quote.create({
    data: {
      shop_id: shop.id,
      customer_id: customer.id,
      status: "PENDING",
      reference_code: "BQ-DEV-00001",
      vehicle_make: "Toyota",
      vehicle_model: "Camry",
      vehicle_year: 2021,
      vehicle_color: "Silver",
      service_category: "COLLISION_REPAIR",
      damage_description:
        "Front bumper damage after minor collision. Left headlight cracked.",
    },
  });

  console.log(`✓ Quote de exemplo criada: ${quote.reference_code}`);
  console.log("\n✅ Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
