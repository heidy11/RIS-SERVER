const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branch.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

// POST /api/branches - Crear una nueva sucursal
router.post('/', branchController.createBranch);

// GET /api/branches - Obtener todas las sucursales
router.get('/', branchController.getAllBranches);

// GET /api/branches/organization/:organizationId - Obtener sucursales por ID de Organización
router.get('/organization/:organizationId', branchController.getBranchesByOrganizationId);

// GET /api/branches/:id - Obtener una sucursal por ID de MongoDB
router.get('/:id', branchController.getBranchById); // Si lo necesitas, agrega la función al controlador

// PATCH /api/branches/:id - Actualizar una sucursal
router.patch('/:id', checkAdmin, branchController.updateBranch);

// DELETE /api/branches/:id - Eliminar una sucursal
router.delete('/:id', checkAdmin, branchController.deleteBranch);

module.exports = router;
