/*
  Warnings:

  - You are about to drop the column `categoria` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `detalle` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `gf` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `img_prod` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `logo_gf` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `logo_sello` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `marca` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `pesaj` on the `productos` table. All the data in the column will be lost.
  - You are about to drop the column `pol` on the `productos` table. All the data in the column will be lost.
  - Added the required column `cat_general` to the `productos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoria_1` to the `productos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fabricante_marca` to the `productos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nombre` to the `productos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "foro_hilos" ALTER COLUMN "es_cerrado" DROP NOT NULL;

-- AlterTable
ALTER TABLE "productos" DROP COLUMN "categoria",
DROP COLUMN "detalle",
DROP COLUMN "gf",
DROP COLUMN "img_prod",
DROP COLUMN "logo_gf",
DROP COLUMN "logo_sello",
DROP COLUMN "marca",
DROP COLUMN "pesaj",
DROP COLUMN "pol",
ADD COLUMN     "atributo_1" TEXT,
ADD COLUMN     "atributo_2" TEXT,
ADD COLUMN     "atributo_3" TEXT,
ADD COLUMN     "cat_general" TEXT NOT NULL,
ADD COLUMN     "categoria_1" TEXT NOT NULL,
ADD COLUMN     "fabricante_marca" TEXT NOT NULL,
ADD COLUMN     "foto_producto" TEXT,
ADD COLUMN     "foto_sello_1" TEXT,
ADD COLUMN     "foto_sello_2" TEXT,
ADD COLUMN     "nombre" TEXT NOT NULL,
ALTER COLUMN "actualizado_en" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "productos_cat_general_idx" ON "productos"("cat_general");

-- CreateIndex
CREATE INDEX "productos_categoria_1_idx" ON "productos"("categoria_1");

-- CreateIndex
CREATE INDEX "productos_fabricante_marca_idx" ON "productos"("fabricante_marca");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos"("nombre");
