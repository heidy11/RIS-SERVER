const User = require('../models/user.model.js');
const bcrypt = require('bcryptjs');

class UserService {
  async createUser(data) {
    const { nombre, correo, contraseña, role, vistas, branch } = data;
    const hashedPassword = await bcrypt.hash(contraseña, 10);

    const newUser = new User({
      nombre,
      correo,
      contraseña: hashedPassword,
      role: role || 'user',
      vistas: vistas || ['profile'],
      branch: branch || undefined,
    });

    return await newUser.save();
  }

  async getAllUsers(query = {}) {
    return await User.find(query).populate('branch');
  }

  async getMedicalUsers(branchId = null) {
    const medicalRoles = [
      'traumatologia',
      'radiologia',
      'pediatria',
      'medico general',
      'medicoExterno',
      'sala de dictados rayos x',
      'sala de dictados tomografia',
    ];
    const query = { role: { $in: medicalRoles } };
    if (branchId) {
      query.branch = branchId;
    }
    return await User.find(query).select('nombre correo role branch');
  }

  async getUserById(id) {
    return await User.findById(id).populate('branch');
  }

  async updateUser(id, data) {
    const { nombre, correo, contraseña, role, vistas, branch } = data;
    let updatedData = { nombre, correo, role, vistas, branch };

    if (contraseña) {
      updatedData.contraseña = await bcrypt.hash(contraseña, 10);
    }

    return await User.findByIdAndUpdate(id, updatedData, { new: true }).populate('branch');
  }

  async updatePassword(id, password, newpassword, newpasswordConfirmate) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const match = await bcrypt.compare(password, user.contraseña);
    if (!match) {
      throw new Error('La contraseña anterior es incorrecta');
    }

    if (newpassword !== newpasswordConfirmate) {
      throw new Error('La nueva contraseña y la confirmación no coinciden');
    }

    const hashedPassword = await bcrypt.hash(newpassword, 10);
    user.contraseña = hashedPassword;

    await user.save();
    return true;
  }

  async deleteUser(id) {
    return await User.findByIdAndDelete(id);
  }

  async partialUpdateUser(id, data) {
    const { nombre, correo, role, vistas, branch } = data;
    let updatedData = {};
    if (nombre) updatedData.nombre = nombre;
    if (correo) updatedData.correo = correo;
    if (role) updatedData.role = role;
    if (vistas) updatedData.vistas = vistas;
    if (branch) updatedData.branch = branch;

    return await User.findByIdAndUpdate(id, updatedData, { new: true }).populate('branch');
  }
}

module.exports = new UserService();
