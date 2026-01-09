import express from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware, adminMiddleware } from "../middlewares/auth.js";

const prisma = new PrismaClient();
const router = express.Router();

/**
 * PUBLICO: listar eventos
 * Query opcional: ?from=2026-01-01&to=2026-12-31
 */
router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;

    const where = {};
    if (from || to) {
      where.inicio = {};
      if (from) where.inicio.gte = new Date(from);
      if (to) where.inicio.lte = new Date(to);
    }

    const events = await prisma.Evento.findMany({
      where,
      orderBy: { inicio: "asc" },
    });

    res.json(events);
  } catch (err) {
    console.error("Error listando eventos:", err);
    res.status(500).json({ message: "Error listando eventos" });
  }
});

/** PUBLICO: obtener por id */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const event = await prisma.Evento.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ message: "No existe" });
    res.json(event);
  } catch (err) {
    console.error("Error obteniendo evento:", err);
    res.status(500).json({ message: "Error obteniendo evento" });
  }
});

/** ADMIN: crear */
router.post("/admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titulo, descripcion, ubicacion, inicio, fin, todoElDia } = req.body;

    if (!titulo || !inicio) {
      return res.status(400).json({ message: "titulo e inicio son requeridos" });
    }

    const created = await prisma.Evento.create({
      data: {
        titulo,
        descripcion: descripcion ?? null,
        ubicacion: ubicacion ?? null,
        inicio: new Date(inicio),
        fin: fin ? new Date(fin) : null,
        todoElDia: Boolean(todoElDia),
        creadoPorId: req.user?.id ?? null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("Error creando evento:", err);
    res.status(500).json({ message: "Error creando evento" });
  }
});

/** ADMIN: editar */
router.put("/admin/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { titulo, descripcion, ubicacion, inicio, fin, todoElDia } = req.body;

    const updated = await prisma.Evento.update({
      where: { id },
      data: {
        titulo,
        descripcion: descripcion ?? null,
        ubicacion: ubicacion ?? null,
        inicio: inicio ? new Date(inicio) : undefined,
        fin: fin === null ? null : fin ? new Date(fin) : undefined,
        todoElDia: typeof todoElDia === "boolean" ? todoElDia : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("Error actualizando evento:", err);
    res.status(500).json({ message: "Error actualizando evento" });
  }
});

/** ADMIN: eliminar */
router.delete("/admin/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.Evento.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error eliminando evento:", err);
    res.status(500).json({ message: "Error eliminando evento" });
  }
});

export default router;
