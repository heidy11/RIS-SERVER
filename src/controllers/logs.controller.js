// logs.controller.js
const Log = require('../models/logs.model');

const createLog = async (req, res, action) => {
  try {
    const logData = {
      ipAddress: req.ip,
      route: req.originalUrl,
      action: action,
      method: req.method,
      timestamp: Date.now(),
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user.id : null,
      userName: req.user ? req.user.nombre : null,
      userRole: req.user ? req.user.role : null,
    };
    // console.log(logData);
    await Log.create(logData);
  } catch (error) {
    console.error('Error al crear el log:', error);
  }
};
const getLogs = async (req, res) => {
  try {
    const { search, sortBy, order = 'desc', limit = 25, page = 1 } = req.query;

    // Filtro vacío por defecto
    let filter = {};

    // Verificamos si hay un término de búsqueda (por usuario o ruta)
    if (search) {
      // Convertimos a minúsculas para hacer la búsqueda insensible a mayúsculas/minúsculas
      const searchTerm = search.toLowerCase();

      // Filtro de búsqueda por ruta o por usuario
      filter = {
        $or: [
          { route: { $regex: searchTerm, $options: 'i' } }, // Buscar por ruta
          { userName: { $regex: searchTerm, $options: 'i' } }, // Buscar por ID de usuario (si es un ID)
        ],
      };
    }

    // Determinar el orden (ascendente o descendente)
    const sortOrder = order === 'asc' ? 1 : -1;

    // Convertir el limit y la página a enteros
    const pageLimit = parseInt(limit, 10);
    const pageNum = parseInt(page, 10);
    const skip = (pageNum - 1) * pageLimit;

    // Realizar la consulta con filtros, orden y paginación
    const logs = await Log.find(filter)
      .sort({ [sortBy || 'timestamp']: sortOrder }) // Cambiar 'createdAt' por 'timestamp' si quieres ordenar por fecha
      .skip(skip)
      .limit(pageLimit);

    // Obtener el total de logs para la paginación
    const totalLogs = await Log.countDocuments(filter);

    // Enviar la respuesta con los logs y la paginación
    res.json({
      logs,
      totalLogs,
      totalPages: Math.ceil(totalLogs / pageLimit),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error en el servidor');
  }
};

module.exports = { createLog, getLogs };
