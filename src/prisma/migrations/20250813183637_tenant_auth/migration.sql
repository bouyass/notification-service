/*
  Warnings:

  - A unique constraint covering the columns `[issuer]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `alg` to the `Tenant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issuer` to the `Tenant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN     "alg" TEXT NOT NULL,
ADD COLUMN     "audience" TEXT,
ADD COLUMN     "hsSecret" TEXT,
ADD COLUMN     "issuer" TEXT NOT NULL,
ADD COLUMN     "jwksUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_issuer_key" ON "public"."Tenant"("issuer");
