import path from "path";
import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 👉 Cambiá el nombre si tu archivo está en otra ruta
const EXCEL_PATH = path.resolve(process.cwd(), "BaseProductos_v2.0.xlsx");

// Convierte cualquier valor a string seguro (incluye números como 1820)
function toStr(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// Lee una columna con nombres alternativos (por si cambian encabezados)
function getAny(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  for (const k of keys) {
    const v = lower[String(k).toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

async function main() {
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    console.log("⚠️ El Excel no tiene filas");
    return;
  }

  // Para debug rápido si algo sale raro
  const headersDetectados = Object.keys(rows[0] || {});
  console.log("🧾 Headers detectados:", headersDetectados);

  const productos = rows
    .map((row) => {
      const catGeneral = toStr(
        getAny(row, ["Cat.General", "Cat General", "cat_general", "catGeneral", "Categoría General", "Categoria General"])
      );
      const categoria1 = toStr(
        getAny(row, ["Categoria 1", "Categoría 1", "categoria_1", "categoria1"])
      );
      const fabricanteMarca = toStr(
        getAny(row, ["Fabricante/Marca", "Fabricante", "Marca", "fabricante_marca", "fabricanteMarca"])
      );
      const nombre = toStr(getAny(row, ["Nombre", "nombre"]));
      const certifica = toStr(getAny(row, ["Certifica", "certifica"]));
      const sello = toStr(getAny(row, ["Sello", "sello"]));

      const atributo1 = toStr(getAny(row, ["Atributo 1", "atributo_1", "atributo1"]));
      const atributo2 = toStr(getAny(row, ["Atributo 2", "atributo_2", "atributo2"]));
      const atributo3 = toStr(getAny(row, ["Atributo 3", "atributo_3", "atributo3"]));

      const tienda = toStr(getAny(row, ["Tienda", "tienda", "Comercio"]));

      const fotoProducto = toStr(
        getAny(row, ["Fotografia Producto", "Fotografía Producto", "foto_producto", "fotoProducto", "Foto Producto", "Imagen"])
      );
      const fotoSello1 = toStr(
        getAny(row, ["Fotografia Sello 1", "Fotografía Sello 1", "foto_sello_1", "fotoSello1", "LogoSello1", "Logo Sello 1"])
      );
      const fotoSello2 = toStr(
        getAny(row, ["Fotografia Sello 2", "Fotografía Sello 2", "foto_sello_2", "fotoSello2", "LogoSello2", "Logo Sello 2"])
      );

      // ✅ fila válida: al menos fabricanteMarca + nombre
      if (!fabricanteMarca || !nombre) return null;

      return {
        catGeneral,
        categoria1,
        fabricanteMarca, // <-- YA SIEMPRE STRING
        nombre,
        certifica,
        sello,
        atributo1,
        atributo2,
        atributo3,
        tienda,
        fotoProducto,
        fotoSello1,
        fotoSello2,
      };
    })
    .filter(Boolean);

  console.log(`📦 Importando ${productos.length} productos...`);

  // 🔥 Import en chunks con createMany (mucho más rápido que create uno por uno)
  const chunkSize = 200;
  let totalInsertados = 0;

  for (let i = 0; i < productos.length; i += chunkSize) {
    const chunk = productos.slice(i, i + chunkSize);
    const result = await prisma.producto.createMany({
      data: chunk,
      skipDuplicates: true, // solo funciona si tenés unique index (si no, igual inserta)
    });
    totalInsertados += result.count ?? 0;
    console.log(`✅ Chunk ${i / chunkSize + 1}: insertados ${result.count ?? 0}`);
  }

  console.log(`🎉 Importación finalizada. Insertados: ${totalInsertados}`);
}

main()
  .catch((err) => {
    console.error("❌ Error importando:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
