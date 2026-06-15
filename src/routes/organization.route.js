const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organization.controller.js');
const { verifyToken, checkAdmin } = require('../middleware/auth.js');

// router.use(verifyToken);

// POST /api/organizations - Crear una nueva organización (Solo Admin)
router.post('/',  organizationController.createOrganization);

// GET /api/organizations - Obtener todas las organizaciones (Solo Admin)
router.get('/', organizationController.getAllOrganizations);

// GET /api/organizations/:id - Obtener una organización por ID
// Accesible para usuarios autenticados (podría restringirse más si es necesario)
router.get('/:id', organizationController.getOrganizationById);

// PATCH /api/organizations/:id - Actualizar una organización (Solo Admin)
router.patch('/:id', organizationController.updateOrganization);

// DELETE /api/organizations/:id - Eliminar una organización (Solo Admin)
router.delete('/:id', organizationController.deleteOrganization);

module.exports = router;
