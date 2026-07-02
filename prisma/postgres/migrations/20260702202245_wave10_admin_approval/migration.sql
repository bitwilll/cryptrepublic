-- Wave 10 — admin-mint override OFF-CHAIN INTENT columns (additive, nullable, no
-- backfill — safe for existing prod rows). Hand-authored (postgres dialect,
-- mirrors prisma/migrations/20260702202245_wave10_admin_approval); applied by
-- vercel-build's `prisma migrate deploy --schema prisma/postgres/schema.prisma`.

-- AlterTable
ALTER TABLE "CitizenshipApplication" ADD COLUMN "adminApprovedAt" TIMESTAMP(3);
ALTER TABLE "CitizenshipApplication" ADD COLUMN "adminApprovedBy" TEXT;
