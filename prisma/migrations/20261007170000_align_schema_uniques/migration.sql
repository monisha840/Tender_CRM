-- Project.tenderId stays a plain unique index: Prisma needs a real unique key to model the 1:1 Tender -> Project relation
-- (a partial index is reported as drift). All other business-unique keys remain partial (see hardening).
DROP INDEX IF EXISTS "Project_tenderId_key";
CREATE UNIQUE INDEX "Project_tenderId_key" ON "Project"("tenderId");
