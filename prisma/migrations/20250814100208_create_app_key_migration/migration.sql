-- CreateTable
CREATE TABLE "public"."AppKey" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "alg" TEXT NOT NULL DEFAULT 'RS256',
    "publicJwk" JSONB,
    "privatePkcs8" TEXT,
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notBefore" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AppKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppKey_appId_kid_key" ON "public"."AppKey"("appId", "kid");

-- AddForeignKey
ALTER TABLE "public"."AppKey" ADD CONSTRAINT "AppKey_appId_fkey" FOREIGN KEY ("appId") REFERENCES "public"."App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
