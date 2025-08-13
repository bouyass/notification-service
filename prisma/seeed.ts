import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Load tenants/apps from JSON
const dataPath = path.join(__dirname, "apps.json");
const tenantsAndApps = JSON.parse(fs.readFileSync(dataPath, "utf8"));

async function main() {
  for (const entry of tenantsAndApps) {
    const { tenant: tenantData, apps } = entry;

    let tenant = await prisma.tenant.findUnique({
      where: { issuer: tenantData.issuer }
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: tenantData
      });
      console.log(`✅ Created tenant: ${tenant.name}`);
    } else {
      console.log(`ℹ️ Tenant already exists: ${tenant.name}`);
    }

    for (const app of apps) {
      const existingApp = await prisma.app.findFirst({
        where: { name: app.name, tenantId: tenant.id }
      });

      if (!existingApp) {
        await prisma.app.create({
          data: { name: app.name, tenantId: tenant.id }
        });
        console.log(`✅ Created app: ${app.name}`);
      } else {
        console.log(`ℹ️ App already exists: ${app.name}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log("🌱 Seed completed");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
