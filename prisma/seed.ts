// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { generateKeyPair, exportJWK, exportPKCS8 } from "jose";

const prisma = new PrismaClient();
const dataPath = path.join(process.cwd(), "prisma", "apps.json");

type JsonTenant = {
  name: string;
  issuer: string;
  audience: string;
  alg?: "RS256" | "HS256";
  // deprecated fallback (évite en prod) :
  hsSecret?: string;
};
type JsonApp = { name: string; hsSecret?: string };
type JsonEntry = { tenant: JsonTenant; apps: JsonApp[] };

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function ensureRsKey(appId: string, kid: string) {
  const existing = await prisma.appKey.findUnique({ where: { appId_kid: { appId, kid } } });
  if (existing) return existing;

  const { publicKey, privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  (jwk as any).kid = kid;
  (jwk as any).alg = "RS256";
  (jwk as any).use = "sig";
  const pkcs8 = await exportPKCS8(privateKey);

  return prisma.appKey.create({
    data: {
      appId,
      kid,
      alg: "RS256",
      publicJwk: jwk,
      privatePkcs8: pkcs8,
      isActive: true,
      notBefore: new Date()
    }
  });
}

async function ensureHsKey(appId: string, kid: string, secret: string) {
  const existing = await prisma.appKey.findUnique({ where: { appId_kid: { appId, kid } } });
  if (existing) return existing;

  return prisma.appKey.create({
    data: {
      appId,
      kid,
      alg: "HS256",
      secret,
      isActive: true,
      notBefore: new Date()
    }
  });
}

async function main() {
  const entries: JsonEntry[] = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const defaultKid = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  for (const entry of entries) {
    const t = entry.tenant;
    const alg = t.alg ?? "RS256";

    // Tenant
    let tenant = await prisma.tenant.findUnique({ where: { issuer: t.issuer } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: t.name, issuer: t.issuer, audience: t.audience, alg }
      });
      console.log(`✅ Created tenant: ${tenant.name} (${tenant.alg})`);
    } else {
      if (tenant.alg !== alg || tenant.audience !== t.audience) {
        tenant = await prisma.tenant.update({
          where: { id: tenant.id },
          data: { alg, audience: t.audience }
        });
        console.log(`ℹ️ Updated tenant: ${tenant.name} (${tenant.alg})`);
      } else {
        console.log(`ℹ️ Tenant exists: ${tenant.name}`);
      }
    }

    // Apps
    for (const a of entry.apps) {
      let app = await prisma.app.findFirst({ where: { tenantId: tenant.id, name: a.name } });
      if (!app) {
        app = await prisma.app.create({ data: { tenantId: tenant.id, name: a.name } });
        console.log(`✅ Created app: ${a.name}`);
      } else {
        console.log(`ℹ️ App exists: ${a.name}`);
      }

      // Keys per app
      if (alg === "RS256") {
        await ensureRsKey(app.id, defaultKid);
        console.log(`🔑 RS256 key ensured for app ${a.name} kid=${defaultKid}`);
      } else {
        // HS256 – privilégie un secret fourni par app; fallback: génère un secret random si rien
        const secret = a.hsSecret ?? t.hsSecret ?? randomSecret();
        await ensureHsKey(app.id, defaultKid, secret);
        console.log(`🔑 HS256 key ensured for app ${a.name} kid=${defaultKid}`);
      }
    }
  }

  console.log("🌱 Seed completed");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
