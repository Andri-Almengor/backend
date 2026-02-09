import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import xlsx from "xlsx";

import eventsRouter from "./routes/events.js";
import { authMiddleware, adminMiddleware } from "./middlewares/auth.js";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "cambia_esto";

// Multer para recibir archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ✅ ROUTER EVENTOS
app.use("/api/events", eventsRouter);

// =====================================================
// ✅ SELECT FIJO PARA PRODUCTOS (evita columna "existe")
// =====================================================
// Ajustá aquí si en tu Prisma tienes otros nombres.
const PRODUCTO_SELECT = {
  id: true,
  catGeneral: true,
  categoria1: true,
  fabricanteMarca: true,
  nombre: true,
  certifica: true,
  sello: true,
  atributo1: true,
  atributo2: true,
  atributo3: true,
  tienda: true,
  fotoProducto: true,
  fotoSello1: true,
  fotoSello2: true,

  // Si tu tabla tiene timestamps y los usas, podés activarlos:
  // creadoEn: true,
  // actualizadoEn: true,
};

// Sanitiza payload para NO mandar columnas inexistentes (como "existe")
function sanitizeProductoPayload(input) {
  if (!input || typeof input !== "object") return {};

  // Copia segura
  const p = { ...input };

  // ❌ elimina legacy / columnas que no existen en DB
  delete p.existe;

  // Si te llegan campos viejos del front (compatibilidad), podés mapearlos aquí:
  // if (p.categoria && !p.categoria1) p.categoria1 = p.categoria;
  // if (p.marca && !p.fabricanteMarca) p.fabricanteMarca = p.marca;

  return p;
}

// ========== SEED ADMIN POR DEFECTO ==========
async function ensureAdminUser() {
  try {
    console.log("🔐 Verificando rol y usuario administrador por defecto...");

    let rolAdmin = await prisma.Rol.findFirst({
      where: { nombre: "admin" },
    });

    if (!rolAdmin) {
      rolAdmin = await prisma.Rol.create({
        data: {
          nombre: "admin",
          descripcion: "Administrador del sistema",
        },
      });
      console.log("✅ Rol 'admin' creado con id:", rolAdmin.id);
    }

    const adminExistente = await prisma.Usuario.findFirst({
      where: { rolId: rolAdmin.id },
    });

    if (adminExistente) {
      console.log("✅ Ya existe un usuario administrador:", adminExistente.email);
      return;
    }

    const defaultName = process.env.DEFAULT_ADMIN_NAME || "Admin";
    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@kccr.com";
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!";

    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const nuevoAdmin = await prisma.Usuario.create({
      data: {
        nombre: defaultName,
        email: defaultEmail,
        passwordHash,
        rolId: rolAdmin.id,
      },
    });

    console.log("🚀 Usuario administrador creado por defecto:");
    console.log("   Email:   ", defaultEmail);
    console.log("   Password:", defaultPassword);
  } catch (err) {
    console.error("❌ Error en ensureAdminUser:", err);
  }
}

// ========== RUTA DE SALUD ==========
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend kccr funcionando" });
});

// ========== AUTH ==========
app.post("/api/auth/register", (req, res) => {
  return res.status(403).json({
    message:
      "El registro público está deshabilitado. Solo un administrador puede crear cuentas.",
  });
});

// Login solo para administradores
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const usuario = await prisma.Usuario.findUnique({
      where: { email },
      include: { rol: true },
    });

    if (!usuario) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const isValid = await bcrypt.compare(password, usuario.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const rolNombre = usuario.rol?.nombre ?? null;
    if (rolNombre !== "admin") {
      return res
        .status(403)
        .json({ message: "Solo usuarios administradores pueden iniciar sesión" });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        rolId: usuario.rolId,
        rol: rolNombre,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: rolNombre,
      },
    });
  } catch (err) {
    console.error("Error en /api/auth/login:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// ========== ADMIN: USUARIOS ==========
app.post("/api/admin/usuarios", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        message: "nombre, email y password son requeridos",
      });
    }

    const existing = await prisma.Usuario.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }

    const rolAdmin = await prisma.Rol.findFirst({ where: { nombre: "admin" } });
    if (!rolAdmin) {
      return res.status(500).json({ message: "No existe el rol 'admin' en la base de datos" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const nuevoAdmin = await prisma.Usuario.create({
      data: { nombre, email, passwordHash, rolId: rolAdmin.id },
      include: { rol: true },
    });

    res.status(201).json({
      message: "Administrador creado correctamente",
      usuario: {
        id: nuevoAdmin.id,
        nombre: nuevoAdmin.nombre,
        email: nuevoAdmin.email,
        rol: nuevoAdmin.rol?.nombre,
      },
    });
  } catch (err) {
    console.error("Error en POST /api/admin/usuarios:", err);
    res.status(500).json({ message: "Error en el servidor", detail: err.message });
  }
});

app.get("/api/admin/usuarios", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const usuarios = await prisma.Usuario.findMany({
      include: { rol: true },
      orderBy: { id: "asc" },
    });

    res.json(
      usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol?.nombre,
      }))
    );
  } catch (err) {
    console.error("Error en GET /api/admin/usuarios:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.delete("/api/admin/usuarios/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (id === req.user.id) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    await prisma.Usuario.delete({ where: { id } });
    res.json({ message: "Usuario eliminado" });
  } catch (err) {
    console.error("Error en DELETE /api/admin/usuarios/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// ✅ EDITAR ADMIN (UPDATE)
app.put("/api/admin/usuarios/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, email, password } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    if (email) {
      const existing = await prisma.Usuario.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        return res.status(409).json({ message: "Ya existe un usuario con ese email" });
      }
    }

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (email !== undefined) data.email = email;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      data.passwordHash = passwordHash;
    }

    const updated = await prisma.Usuario.update({
      where: { id },
      data,
      include: { rol: true },
    });

    res.json({
      id: updated.id,
      nombre: updated.nombre,
      email: updated.email,
      rol: updated.rol?.nombre,
    });
  } catch (err) {
    console.error("Error en PUT /api/admin/usuarios/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// =====================================================
// ========== PRODUCTOS PÚBLICOS (con select fijo) ======
// =====================================================
app.get("/api/productos", async (req, res) => {
  try {
    const productos = await prisma.Producto.findMany({
      select: PRODUCTO_SELECT,
      orderBy: [{ fabricanteMarca: "asc" }, { nombre: "asc" }],
    });
    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/productos", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});


// ✅ EXPORTAR PRODUCTOS A EXCEL (PÚBLICO)
app.get("/api/productos/export/excel", async (req, res) => {
  try {
    const productos = await prisma.Producto.findMany({
      select: PRODUCTO_SELECT,
      orderBy: [{ fabricanteMarca: "asc" }, { nombre: "asc" }],
    });

    const ws = xlsx.utils.json_to_sheet(productos);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Productos");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="productos.xlsx"');
    return res.send(buffer);
  } catch (err) {
    console.error("Error en GET /api/productos/export/excel:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.get("/api/productos/paged", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.Producto.findMany({
        select: PRODUCTO_SELECT,
        skip,
        take: pageSize,
        orderBy: [{ fabricanteMarca: "asc" }, { nombre: "asc" }],
      }),
      prisma.Producto.count(),
    ]);

    res.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("Error en GET /api/productos/paged", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.get("/api/productos/search", async (req, res) => {
  try {
    const {
      catGeneral,
      categoria1,
      fabricanteMarca,
      nombre,
      certifica,
      sello,
      atributo,
      tienda,
      q,

      // compatibilidad legacy
      categoria,
      marca,
      gf,
      pesaj,
    } = req.query;

    const where = {};

    if (categoria) {
      where.OR = [
        { catGeneral: { contains: categoria, mode: "insensitive" } },
        { categoria1: { contains: categoria, mode: "insensitive" } },
      ];
    }

    if (catGeneral) where.catGeneral = { contains: catGeneral, mode: "insensitive" };
    if (categoria1) where.categoria1 = { contains: categoria1, mode: "insensitive" };

    const fab = fabricanteMarca || marca;
    if (fab) where.fabricanteMarca = { contains: fab, mode: "insensitive" };

    if (nombre) where.nombre = { contains: nombre, mode: "insensitive" };
    if (certifica) where.certifica = { contains: certifica, mode: "insensitive" };
    if (sello) where.sello = { contains: sello, mode: "insensitive" };
    if (tienda) where.tienda = { contains: tienda, mode: "insensitive" };

    if (atributo) {
      where.AND = (where.AND || []).concat([
        {
          OR: [
            { atributo1: { contains: atributo, mode: "insensitive" } },
            { atributo2: { contains: atributo, mode: "insensitive" } },
            { atributo3: { contains: atributo, mode: "insensitive" } },
          ],
        },
      ]);
    }

    if (q) {
      where.AND = (where.AND || []).concat([
        {
          OR: [
            { catGeneral: { contains: q, mode: "insensitive" } },
            { categoria1: { contains: q, mode: "insensitive" } },
            { fabricanteMarca: { contains: q, mode: "insensitive" } },
            { nombre: { contains: q, mode: "insensitive" } },
            { certifica: { contains: q, mode: "insensitive" } },
            { sello: { contains: q, mode: "insensitive" } },
            { atributo1: { contains: q, mode: "insensitive" } },
            { atributo2: { contains: q, mode: "insensitive" } },
            { atributo3: { contains: q, mode: "insensitive" } },
            { tienda: { contains: q, mode: "insensitive" } },
          ],
        },
      ]);
    }

    if (gf || pesaj) {
      console.warn("⚠️ Se recibieron filtros legacy (gf/pesaj) pero el esquema v2.0 ya no los usa.");
    }

    const productos = await prisma.Producto.findMany({
      where,
      select: PRODUCTO_SELECT,
      orderBy: [{ fabricanteMarca: "asc" }, { nombre: "asc" }],
    });

    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/productos/search:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.get("/api/productos/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);

    if (!rawId || !Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const producto = await prisma.Producto.findUnique({
      where: { id },
      select: PRODUCTO_SELECT,
    });
    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });

    res.json(producto);
  } catch (err) {
    console.error("Error en GET /api/productos/:id", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});


// =====================================================
// ========== ADMIN PRODUCTOS (con select fijo) =========
// =====================================================
app.get("/api/admin/productos", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const productos = await prisma.Producto.findMany({
      select: PRODUCTO_SELECT,
      orderBy: [{ fabricanteMarca: "asc" }, { nombre: "asc" }],
    });
    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/admin/productos:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.post("/api/admin/productos", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const payload = sanitizeProductoPayload(req.body);
    const nuevo = await prisma.Producto.create({
      data: payload,
      select: PRODUCTO_SELECT,
    });
    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /api/admin/productos:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.put("/api/admin/productos/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = sanitizeProductoPayload(req.body);

    const actualizado = await prisma.Producto.update({
      where: { id },
      data: payload,
      select: PRODUCTO_SELECT,
    });
    res.json(actualizado);
  } catch (err) {
    console.error("Error en PUT /api/admin/productos/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.delete("/api/admin/productos/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.Producto.delete({ where: { id } });
    res.json({ message: "Producto eliminado" });
  } catch (err) {
    console.error("Error en DELETE /api/admin/productos/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// ========== IMPORTAR PRODUCTOS DESDE EXCEL ==========
function normalizeStr(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getAny(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }

  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).toLowerCase(), v])
  );

  for (const k of keys) {
    const v = lower[String(k).toLowerCase()];
    if (v !== undefined) return v;
  }

  return "";
}

app.post(
  "/api/admin/productos/import-excel",
  authMiddleware,
  adminMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Archivo no recibido (campo 'file')" });
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        return res.status(400).json({ message: "El Excel no tiene filas" });
      }

      const headersDetectados = Object.keys(rows[0] || {});

      const productos = rows.map((row) => {
        const catGeneral = normalizeStr(
          getAny(row, ["Cat.General", "Cat General", "cat_general", "catGeneral", "Categoria General", "Categoría General"])
        );

        const categoria1 = normalizeStr(
          getAny(row, ["Categoria 1", "Categoría 1", "categoria_1", "categoria1"])
        );

        const fabricanteMarca = normalizeStr(
          getAny(row, ["Fabricante/Marca", "Fabricante", "Marca", "fabricante_marca", "fabricanteMarca"])
        );

        const nombre = normalizeStr(getAny(row, ["Nombre", "nombre"]));
        const certifica = normalizeStr(getAny(row, ["Certifica", "certifica"]));
        const sello = normalizeStr(getAny(row, ["Sello", "sello"]));

        const atributo1 = normalizeStr(getAny(row, ["Atributo 1", "atributo_1", "atributo1"]));
        const atributo2 = normalizeStr(getAny(row, ["Atributo 2", "atributo_2", "atributo2"]));
        const atributo3 = normalizeStr(getAny(row, ["Atributo 3", "atributo_3", "atributo3"]));

        const tienda = normalizeStr(getAny(row, ["Tienda", "tienda", "Comercio"]));

        const fotoProducto = normalizeStr(
          getAny(row, ["Fotografia Producto", "Fotografía Producto", "foto_producto", "fotoProducto", "Foto Producto", "Imagen"])
        );

        const fotoSello1 = normalizeStr(
          getAny(row, ["Fotografia Sello 1", "Fotografía Sello 1", "foto_sello_1", "fotoSello1", "LogoSello1", "Logo Sello 1"])
        );

        const fotoSello2 = normalizeStr(
          getAny(row, ["Fotografia Sello 2", "Fotografía Sello 2", "foto_sello_2", "fotoSello2", "LogoSello2", "Logo Sello 2"])
        );

        return sanitizeProductoPayload({
          catGeneral: catGeneral || null,
          categoria1: categoria1 || null,
          fabricanteMarca: fabricanteMarca || null,
          nombre: nombre || null,
          certifica: certifica || null,
          sello: sello || null,
          atributo1: atributo1 || null,
          atributo2: atributo2 || null,
          atributo3: atributo3 || null,
          tienda: tienda || null,
          fotoProducto: fotoProducto || null,
          fotoSello1: fotoSello1 || null,
          fotoSello2: fotoSello2 || null,
        });
      });

      const productosValidos = productos.filter((p) => Boolean(p.fabricanteMarca) && Boolean(p.nombre));

      if (productosValidos.length === 0) {
        return res.status(400).json({
          message:
            "No se encontraron filas válidas. Asegúrate de que existan columnas 'Fabricante/Marca' y 'Nombre' (o equivalentes) y que tengan datos.",
          headersDetectados,
          ejemploFila: rows[0],
        });
      }

      const chunkSize = 200;
      let totalInsertados = 0;

      for (let i = 0; i < productosValidos.length; i += chunkSize) {
        const chunk = productosValidos.slice(i, i + chunkSize);

        const result = await prisma.Producto.createMany({
          data: chunk,
          skipDuplicates: true,
        });

        totalInsertados += result.count ?? 0;
      }

      res.json({
        message: "Importación completada",
        totalFilas: rows.length,
        totalValidas: productosValidos.length,
        totalInsertados,
        headersDetectados,
      });
    } catch (err) {
      console.error("❌ Error en importación:", err);
      res.status(500).json({
        message: "Error importando productos desde Excel",
        detail: err.message,
      });
    }
  }
);

// ========== NOTICIAS ==========
app.post("/api/admin/noticias", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titulo, contenido, imageUrl, fileUrl, destino } = req.body;

    if (!titulo) {
      return res.status(400).json({ message: "El título es obligatorio" });
    }

    const noticia = await prisma.Noticia.create({
      data: {
        titulo,
        contenido: contenido || null,
        imageUrl: imageUrl || null,
        fileUrl: fileUrl || null,
        destino: destino || "NOVEDADES",
        autorId: req.user.id,
      },
    });

    res.status(201).json(noticia);
  } catch (err) {
    console.error("Error en POST /api/admin/noticias:", err);
    res.status(500).json({ message: "Error en el servidor", detail: err.message });
  }
});

app.get("/api/noticias", async (req, res) => {
  try {
    const { destino } = req.query;

    const where = {};
    if (destino) where.destino = destino; // "NOVEDADES" | "ANUNCIANTES"

    const noticias = await prisma.Noticia.findMany({
      where,
      orderBy: { creadoEn: "desc" },
    });
    res.json(noticias);
  } catch (err) {
    console.error("Error en GET /api/noticias:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});


app.get("/api/noticias/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const noticia = await prisma.Noticia.findUnique({ where: { id } });

    if (!noticia) {
      return res.status(404).json({ message: "Noticia no encontrada" });
    }

    res.json(noticia);
  } catch (err) {
    console.error("Error en GET /api/noticias/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.put("/api/admin/noticias/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { titulo, contenido, imageUrl, fileUrl, destino } = req.body;

    const noticia = await prisma.Noticia.update({
      where: { id },
      data: {
        titulo,
        contenido,
        imageUrl,
        fileUrl,
        ...(destino ? { destino } : {}),
        actualizadoEn: new Date(),
      },
    });

    res.json(noticia);
  } catch (err) {
    console.error("Error en PUT /api/admin/noticias/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.delete("/api/admin/noticias/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.Noticia.delete({ where: { id } });
    res.json({ message: "Noticia eliminada" });
  } catch (err) {
    console.error("Error en DELETE /api/admin/noticias/:id:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// ========== ARRANCAR SERVIDOR ==========
ensureAdminUser()
  .then(() => {
    console.log("✔ Verificación de admin completada");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error al verificar/crear admin:", err);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
    });
  });
