import path from "path";
import fs from "fs";
import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  const excelPath = path.join(__dirname, "../data/BaseProductos_v2.0.xlsx");

  if (!fs.existsSync(excelPath)) {
    throw new Error("❌ No se encontró BaseProductos_v2.0.xlsx");
  }

  const workbook = xlsx.readFile(excelPath);
  const sheetName =
    workbook.Sheets["Final_02-26"]
      ? "Final_02-26"
      : workbook.SheetNames[0];

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  console.log(`📦 Importando ${rows.length} productos...`);

  for (const r of rows) {
    await prisma.producto.create({
      data: {
        catGeneral: r["Cat.General"] ?? "N/A",
        categoria1: r["Categoria 1"] ?? "N/A",
        fabricanteMarca: r["Fabricante/Marca"] ?? "N/A",
        nombre: r["Nombre"] ?? "N/A",
        certifica: r["Certifica"] ?? null,
        sello: r["Sello"] ?? null,
        atributo1: r["Atributo 1"] ?? null,
        atributo2: r["Atributo 2"] ?? null,
        atributo3: r["Atributo 3"] ?? null,
        tienda: r["Tienda"] ?? null,
        fotoProducto: r["Fotografia Producto"] ?? null,
        fotoSello1: r["Fotografia Sello 1"] ?? null,
        fotoSello2: r["Fotografia Sello 2"] ?? null,
      },
    });
  }

  console.log("✅ Importación completada");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
