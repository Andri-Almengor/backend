// Backend/scripts/importProductosKCcr.js
const path = require("path");
const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Limpia valores: null para vacío
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// Limpia y recorta a un máximo de caracteres
function cleanLimit(value, max) {
  const v = clean(value);
  if (v == null) return null;
  if (v.length > max) {
    return v.slice(0, max);
  }
  return v;
}

async function main() {
  const filePath = path.join(__dirname, "..", "data", "BaseProductosKCcr.xlsx");
  console.log("Leyendo archivo:", filePath);

  const workbook = xlsx.readFile(filePath);
  const sheetName = "items"; // hoja del Excel
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`No se encontró la hoja "${sheetName}" en el Excel.`);
  }

  const rows = xlsx.utils.sheet_to_json(worksheet);
  console.log("Filas leídas:", rows.length);

  const productos = rows
    .map((row, index) => {
      // Mapeo por nombre de columna del Excel
      const categoria = cleanLimit(row["Producto"], 190);      // B
      const marca = cleanLimit(row["Marca"], 190);             // C
      const detalle = cleanLimit(row["Presentacion"], 255);    // D

      // Si falta marca y detalle, no tiene sentido guardar
      if (!marca && !detalle) {
        // console.warn(`Fila ${index + 2}: sin marca ni detalle, se omite.`);
        return null;
      }

      const imgProd = cleanLimit(row["Foto"], 255);            // E (URL)
      const sello = cleanLimit(row["Con/Sin sello"], 100);     // F
      const certifica = cleanLimit(row["Certificado"], 255);   // G
      const pol = cleanLimit(row["Status"], 255);              // H
      const logoSello = cleanLimit(row["Unnamed: 8"], 255);    // I (URL)
      const gf = cleanLimit(row["GF"], 100);                   // J
      const logoGf = cleanLimit(row["Unnamed: 10"], 255);      // K (URL)
      const tienda = cleanLimit(row["Establecimiento"], 255);  // L
      const pesaj = cleanLimit(row["Unnamed: 12"], 100);       // M

      return {
        // En tu schema, categoria y marca son String (no opcionales)
        categoria: categoria || "",
        marca: marca || "",
        detalle,
        imgProd,
        sello,
        certifica,
        pol,
        logoSello,
        gf,
        logoGf,
        tienda,
        pesaj,
      };
    })
    .filter(Boolean);

  console.log("Productos a insertar:", productos.length);

  // ⚠️ OPCIONAL: si quieres limpiar la tabla antes de importar, descomenta esto:
  // console.log("Borrando todos los productos existentes...");
  // await prisma.Producto.deleteMany({});

  const chunkSize = 200;
  for (let i = 0; i < productos.length; i += chunkSize) {
    const chunk = productos.slice(i, i + chunkSize);
    console.log(`Insertando productos ${i + 1} - ${i + chunk.length} ...`);

    await prisma.Producto.createMany({
      data: chunk,
      // skipDuplicates: true, // sólo funciona si tienes algún campo UNIQUE definido
    });
  }

  console.log("✅ Importación completada.");
}

main()
  .catch((e) => {
    console.error("❌ Error en importación:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
