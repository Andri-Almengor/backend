-- CreateEnum
CREATE TYPE "NoticiaDestino" AS ENUM ('NOVEDADES', 'ANUNCIANTES');

-- AlterTable
ALTER TABLE "noticias" ADD COLUMN     "destino" "NoticiaDestino" NOT NULL DEFAULT 'NOVEDADES';

-- CreateIndex
CREATE INDEX "noticias_destino_idx" ON "noticias"("destino");
