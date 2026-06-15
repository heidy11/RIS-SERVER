const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-supersegura';

// Middleware para verificar el token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'Token no proporcionado' });

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
    req.user = decoded; // Establecer el usuario decodificado en req.user
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido' });
  }
};

const verifyTokenToLog = (req, res, next) => {
  const token = req.headers['authorization'];
  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
    req.user = decoded; // Establecer el usuario decodificado en req.user
    next();
  } catch (error) {
    next();
    // return res.status(401).json({ message: 'Token inválido' });
  }
};
// Middleware para verificar si es admin
const checkAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado: requiere permisos de administrador' });
  }
  next();
};

// Middleware para verificar si tiene acceso a una vista
const checkVista = vista => {
  return (req, res, next) => {
    if (!req.user || !req.user.vistas || !req.user.vistas.includes(vista)) {
      return res.status(403).json({ message: 'Acceso denegado: vista no permitida' });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  verifyTokenToLog,
  checkAdmin,
  checkVista,
};
