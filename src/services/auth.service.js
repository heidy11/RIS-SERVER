const User = require('../models/user.model.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-supersegura';

class AuthService {
  async register(data) {
    const { nombre, correo, contraseña, role, vistas } = data;
    console.log(data);
    const existingUser = await User.findOne({ correo });
    if (existingUser) {
      throw new Error('El correo ya está registrado.');
    }

    const hashedPassword = await bcrypt.hash(contraseña, 10);

    const newUser = new User({
      nombre,
      correo,
      contraseña: hashedPassword,
      role: role || 'user',
      vistas: vistas || ['profile'],
    });

    return await newUser.save();
  }

  async login(correo, contrasena) {
    console.log(correo, contrasena);
    const startDb = Date.now();
    const user = await User.findOne({ correo });
    console.log(`[Auth Performance] DB Find User: ${Date.now() - startDb}ms`);

    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const startBcrypt = Date.now();
    const passwordMatch = await bcrypt.compare(contrasena, user.contraseña);
    console.log(`[Auth Performance] Bcrypt Compare: ${Date.now() - startBcrypt}ms`);

    if (!passwordMatch) {
      throw new Error('Credenciales inválidas');
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, nombre: user.nombre, correo: user.correo },
      JWT_SECRET,
      {
        expiresIn: '1d',
      }
    );

    return {
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        correo: user.correo,
        role: user.role,
        vistas: user.vistas,
      },
    };
  }
}

module.exports = new AuthService();
