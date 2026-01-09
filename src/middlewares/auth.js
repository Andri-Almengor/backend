import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "cambia_esto";

// Verifica token e inyecta req.user
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, rolId, rol }
    next();
  } catch (err) {
    console.error("Error verificando token:", err);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

// Solo permite admins
export function adminMiddleware(req, res, next) {
  if (!req.user || req.user.rol !== "admin") {
    return res
      .status(403)
      .json({ message: "Acceso solo para administradores" });
  }
  next();
}
