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

// ========== PRODUCTOS PÚBLICOS ==========
app.get("/api/productos", async (req, res) => {
  try {
    const productos = await prisma.Producto.findMany({
      orderBy: { marca: "asc" },
    });
    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/productos", err);
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

    // Si el admin intenta cambiar email, valida duplicado
    if (email) {
      const existing = await prisma.Usuario.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        return res.status(409).json({ message: "Ya existe un usuario con ese email" });
      }
    }

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (email !== undefined) data.email = email;

    // Si envían password, recalculamos hash
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


app.get("/api/productos/paged", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.Producto.findMany({ skip, take: pageSize, orderBy: { marca: "asc" } }),
      prisma.Producto.count(),
    ]);

    res.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("Error en GET /api/productos/paged", err);
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

    const producto = await prisma.Producto.findUnique({ where: { id } });
    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });

    res.json(producto);
  } catch (err) {
    console.error("Error en GET /api/productos/:id", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.get("/api/productos/search", async (req, res) => {
  try {
    const { categoria, marca, gf, tienda, pesaj } = req.query;

    const where = {};
    if (categoria) where.categoria = { contains: categoria, mode: "insensitive" };
    if (marca) where.marca = { contains: marca, mode: "insensitive" };
    if (gf) where.gf = { contains: gf, mode: "insensitive" };
    if (tienda) where.tienda = { contains: tienda, mode: "insensitive" };
    if (pesaj) where.pesaj = { contains: pesaj, mode: "insensitive" };

    const productos = await prisma.Producto.findMany({
      where,
      orderBy: { marca: "asc" },
    });

    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/productos/search:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// ========== ADMIN PRODUCTOS ==========
app.get("/api/admin/productos", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const productos = await prisma.Producto.findMany({ orderBy: { marca: "asc" } });
    res.json(productos);
  } catch (err) {
    console.error("Error en GET /api/admin/productos:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.post("/api/admin/productos", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const data = req.body;

    const payload = {
      ...data,
      pesaj:
        data.pesaj === undefined || data.pesaj === null || data.pesaj === ""
          ? null
          : String(data.pesaj),
    };

    const nuevo = await prisma.Producto.create({ data: payload });
    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /api/admin/productos:", err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

app.put("/api/admin/productos/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;

    const payload = {
      ...data,
      pesaj:
        data.pesaj === undefined || data.pesaj === null || data.pesaj === ""
          ? null
          : String(data.pesaj),
    };

    const actualizado = await prisma.Producto.update({ where: { id }, data: payload });
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

// Busca una columna por múltiples nombres posibles (incluye case-insensitive)
function getAny(row, keys) {
  // 1) Intento directo
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }

  // 2) Intento case-insensitive
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

      // Para debug: ver encabezados reales detectados
      const headersDetectados = Object.keys(rows[0] || {});

      const productos = rows.map((row) => {
        // ✅ Acepta tus headers (snake_case) y los anteriores
        const categoria = normalizeStr(
          getAny(row, ["categoria", "Producto", "Categoria", "Categoría"])
        );

        const marca = normalizeStr(getAny(row, ["marca", "Marca"]));

        const detalle = normalizeStr(
          getAny(row, ["detalle", "Presentacion", "Presentación", "Detalle"])
        );

        const imgProd = normalizeStr(
          getAny(row, ["img_prod", "imgProd", "ImgProducto", "Imagen", "imageUrl"])
        );

        const sello = normalizeStr(getAny(row, ["sello", "Sello"]));

        const certifica = normalizeStr(
          getAny(row, ["certifica", "Certifica", "Certificación", "Certificacion"])
        );

        const pol = normalizeStr(
          getAny(row, ["pol", "Pol", "Status", "Estado"])
        );

        const logoSello = normalizeStr(
          getAny(row, ["logo_sello", "logoSello", "LogoSello", "Logo Sello"])
        );

        const gf = normalizeStr(getAny(row, ["gf", "GF"]));

        const logoGf = normalizeStr(
          getAny(row, ["logo_gf", "logoGf", "LogoGF", "Logo GF"])
        );

        const tienda = normalizeStr(getAny(row, ["tienda", "Tienda", "Comercio"]));

        const pesaj = normalizeStr(getAny(row, ["pesaj", "Pesaj"]));

        // Normalización extra
        const pesajNorm =
          pesaj === "" ? null : String(pesaj);

        return {
          categoria: categoria || null,
          marca: marca || null,
          detalle: detalle || null,
          imgProd: imgProd || null,
          sello: sello || null,
          certifica: certifica || null,
          pol: pol || null,
          logoSello: logoSello || null,
          gf: gf || null,
          logoGf: logoGf || null,
          tienda: tienda || null,
          pesaj: pesajNorm,
        };
      });

      // ✅ Reglas de “fila válida”
      // Yo recomiendo exigir al menos categoria + marca (para no meter basura)
      const productosValidos = productos.filter((p) => {
        return Boolean(p.categoria) && Boolean(p.marca);
      });

      if (productosValidos.length === 0) {
        return res.status(400).json({
          message:
            "No se encontraron filas válidas. Asegúrate de que existan columnas 'categoria' y 'marca' (o 'Categoria' y 'Marca') y que tengan datos.",
          headersDetectados,
          ejemploFila: rows[0],
        });
      }

      // Insert en chunks
      const chunkSize = 200;
      let totalInsertados = 0;

      for (let i = 0; i < productosValidos.length; i += chunkSize) {
        const chunk = productosValidos.slice(i, i + chunkSize);

        const result = await prisma.Producto.createMany({
          data: chunk,
          // Si quieres evitar errores por duplicados necesitas un índice unique en DB.
          // Si no existe, puedes quitar esto, pero lo dejamos como lo tenías.
          skipDuplicates: true,
        });

        // createMany retorna { count }
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
    const { titulo, contenido, imageUrl, fileUrl } = req.body;

    if (!titulo) {
      return res.status(400).json({ message: "El título es obligatorio" });
    }

    const noticia = await prisma.Noticia.create({
      data: {
        titulo,
        contenido: contenido || null,
        imageUrl: imageUrl || null,
        fileUrl: fileUrl || null,
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
    const noticias = await prisma.Noticia.findMany({
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
    const { titulo, contenido, imageUrl, fileUrl } = req.body;

    const noticia = await prisma.Noticia.update({
      where: { id },
      data: {
        titulo,
        contenido,
        imageUrl,
        fileUrl,
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
