// server/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller.js');
const { checkAdmin, verifyToken } = require('../middleware/auth.js');

// Crear usuario (todos)
router.post('/', userController.createUser);

// Obtener médicos (traumatología, radiología, etc)
router.get('/medicos', verifyToken, userController.getMedicalUsers);

// Obtener todos los usuarios (solo admin)
router.get('/', verifyToken, checkAdmin, userController.getAllUsers);

// Obtener un usuario por ID (admin o dueño de cuenta si implementas auth)
router.get('/:id', verifyToken, checkAdmin, userController.getUserById);

// Actualizar un usuario
router.put('/:id', verifyToken, checkAdmin, userController.updateUser);
// Actualizar un usuario
router.put('/pass/:id', verifyToken, checkAdmin, userController.updatePass);

// Actualización parcial
router.patch('/:id', verifyToken, checkAdmin, userController.partialUpdateUser);

// Eliminar un usuario
router.delete('/:id', verifyToken, checkAdmin, userController.deleteUser);

module.exports = router;
