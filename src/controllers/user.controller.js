const UserService = require('../services/user.service.js');
const responseHandler = require('../utils/responseHandler.js');

// Crear un nuevo usuario
exports.createUser = async (req, res) => {
  try {
    const newUser = await UserService.createUser(req.body);
    responseHandler.success(res, 201, { user: newUser }, 'Usuario creado exitosamente');
  } catch (error) {
    console.error('Error al crear usuario:', error);
    responseHandler.error(res, 500, 'Error al crear usuario', error);
  }
};
const path = require('path');

// Obtener todos los usuarios
// exports.getAllUsers = async (req, res) => {
//   try {
//     // 1. Obtener los parámetros de la query
//     const { search, page = 1, limit = 10 } = req.query; // Page por defecto a 1, limit por defecto a 10

//     // 2. Configurar la consulta
//     const query = {};

//     // Si hay un parámetro de búsqueda, filtramos por nombre o correo
//     if (search) {
//       const searchRegex = new RegExp(search, 'i'); // i para que sea insensible a mayúsculas y minúsculas
//       query.$or = [
//         { nombre: { $regex: searchRegex } },
//         { correo: { $regex: searchRegex } },
//       ];
//     }

//     // 3. Obtener los usuarios con paginación
//     const users = await User.find(query)
//       .skip((page - 1) * limit)  // Saltar los primeros (page - 1) * limit usuarios
//       .limit(Number(limit));     // Limitar a 'limit' usuarios

//     // 4. Obtener el total de usuarios para saber cuántas páginas existen
//     const totalUsers = await User.countDocuments(query);

//     // 5. Responder con los usuarios y la información de paginación
//     res.status(200).json({
//       users,
//       totalUsers,
//       totalPages: Math.ceil(totalUsers / limit),
//       currentPage: page,
//     });
//   } catch (error) {
//     console.error('Error al obtener usuarios:', error);
//     res.status(500).json({ message: 'Error al obtener usuarios' });
//   }
// };

exports.getAllUsers = async (req, res) => {
  try {
    const users = await UserService.getAllUsers();
    // Mantener el formato de respuesta original que era un array directo
    res.status(200).json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    responseHandler.error(res, 500, 'Error al obtener usuarios', error);
  }
};

// Obtener un usuario por ID
exports.getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await UserService.getUserById(id);
    if (!user) {
      return responseHandler.error(res, 404, 'Usuario no encontrado');
    }
    // Mantener formato original
    res.status(200).json(user);
  } catch (error) {
    console.error('Error al obtener el usuario especifico:', error);
    responseHandler.error(res, 500, 'Error al obtener el usuario', error);
  }
};

// Actualizar un usuario (PUT)
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  try {
    const updatedUser = await UserService.updateUser(id, req.body);

    if (!updatedUser) {
      return responseHandler.error(res, 404, 'Usuario no encontrado');
    }

    responseHandler.success(res, 200, { user: updatedUser }, 'Usuario actualizado exitosamente');
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    responseHandler.error(res, 500, 'Error al actualizar usuario', error);
  }
};

// Actualizar contraseña
exports.updatePass = async (req, res) => {
  const { id } = req.params;
  const { password, newpassword, newpasswordConfirmate } = req.body;
  try {
    await UserService.updatePassword(id, password, newpassword, newpasswordConfirmate);
    responseHandler.success(res, 200, {}, 'Contraseña actualizada exitosamente');
  } catch (error) {
    console.error('Error al actualizar la contraseña:', error);
    if (error.message === 'Usuario no encontrado') {
      return responseHandler.error(res, 404, error.message);
    }
    if (
      error.message === 'La contraseña anterior es incorrecta' ||
      error.message === 'La nueva contraseña y la confirmación no coinciden'
    ) {
      return responseHandler.error(res, 400, error.message);
    }
    responseHandler.error(res, 500, 'Error al actualizar la contraseña', error);
  }
};

// Eliminar un usuario (DELETE)
exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedUser = await UserService.deleteUser(id);

    if (!deletedUser) {
      return responseHandler.error(res, 404, 'Usuario no encontrado');
    }

    responseHandler.success(res, 200, { user: deletedUser }, 'Usuario eliminado exitosamente');
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    responseHandler.error(res, 500, 'Error al eliminar usuario', error);
  }
};

// Actualizar parcialmente un usuario (PATCH)
exports.partialUpdateUser = async (req, res) => {
  const { id } = req.params;
  try {
    const updatedUser = await UserService.partialUpdateUser(id, req.body);

    if (!updatedUser) {
      return responseHandler.error(res, 404, 'Usuario no encontrado');
    }

    responseHandler.success(res, 200, { user: updatedUser }, 'Usuario parcialmente actualizado');
  } catch (error) {
    console.error('Error al actualizar usuario parcialmente:', error);
    responseHandler.error(res, 500, 'Error al actualizar usuario parcialmente', error);
  }
};
exports.getMedicalUsers = async (req, res) => {
  try {
    const branchId = req.user && req.user.role !== 'admin' ? req.user.branch : null;
    const users = await UserService.getMedicalUsers(branchId);
    res.status(200).json(users);
  } catch (error) {
    console.error('Error al obtener médicos:', error);
    responseHandler.error(res, 500, 'Error al obtener médicos', error);
  }
};
