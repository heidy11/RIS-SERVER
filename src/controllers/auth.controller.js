const AuthService = require('../services/auth.service.js');
const responseHandler = require('../utils/responseHandler.js');

// Registrar un usuario
exports.register = async (req, res) => {
  try {
    const newUser = await AuthService.register(req.body);
    responseHandler.success(res, 201, { user: newUser }, 'Usuario registrado exitosamente');
  } catch (error) {
    console.error('Error en el registro:', error);
    if (error.message === 'El correo ya está registrado.') {
        return responseHandler.error(res, 400, error.message);
    }
    responseHandler.error(res, 500, 'Error al registrar usuario', error);
  }
};

// Iniciar sesión
exports.login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;
    const result = await AuthService.login(correo, contrasena);

    responseHandler.success(res, 200, result, 'Login exitoso');
  } catch (error) {
    console.error('Error en el login:', error);
    if (error.message === 'Credenciales inválidas') {
        return responseHandler.error(res, 401, error.message);
    }
    responseHandler.error(res, 500, 'Error al iniciar sesión', error);
  }
};
