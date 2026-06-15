const express = require('express');
const router = express.Router();
const risController = require('../controllers/ris.controller');
const { verifyToken } = require('../middleware/auth.js');

// Protect all RIS routes
router.use(verifyToken);

// Model: Patient
router.get('/patients', risController.getPatients);
router.post('/patients', risController.createPatient);
router.put('/patients/:id', risController.updatePatient);
router.delete('/patients/:id', risController.deletePatient);

// Model: Order
router.get('/orders', risController.getOrders);
router.post('/orders', risController.createOrder);
router.put('/orders/:id', risController.updateOrder);
router.delete('/orders/:id', risController.deleteOrder);
router.patch('/orders/:id/status', risController.updateOrderStatus);

// Model: Report
router.get('/reports/:studyInstanceUid', risController.getReportByStudyId);
router.post('/reports', risController.saveReport);

// Model: Modality
router.get('/modalities', risController.getModalities);
router.post('/modalities', risController.createModality);
router.put('/modalities/:id', risController.updateModality);
router.delete('/modalities/:id', risController.deleteModality);

// Model: Equipment
router.get('/equipment', risController.getEquipment);
router.post('/equipment', risController.createEquipment);
router.put('/equipment/:id', risController.updateEquipment);
router.delete('/equipment/:id', risController.deleteEquipment);

// Model: Service (Procedure)
router.get('/services', risController.getServices);
router.post('/services', risController.createService);
router.put('/services/:id', risController.updateService);
router.delete('/services/:id', risController.deleteService);

// Model: Branch
router.get('/branches', risController.getBranches);
router.post('/branches', risController.createBranch);
router.put('/branches/:id', risController.updateBranch);
router.delete('/branches/:id', risController.deleteBranch);

// Model: Reports (Full list)
router.get('/reports', risController.getAllReports);

// Analytics
router.get('/analytics/stats', risController.getAnalytics);

// Model: Templates
router.get('/templates', risController.getTemplates);
router.post('/templates', risController.createTemplate);
router.put('/templates/:id', risController.updateTemplate);
router.delete('/templates/:id', risController.deleteTemplate);

// Model: Inventory
router.get('/inventory', risController.getInventory);
router.post('/inventory', risController.createInventory);
router.put('/inventory/:id', risController.updateInventory);
router.delete('/inventory/:id', risController.deleteInventory);

// Model: Cash Register
router.get('/cash-register', risController.getCashRegisters);
router.post('/cash-register/open', risController.openCashRegister);
router.put('/cash-register/:id/close', risController.closeCashRegister);

// Equipment Maintenance
router.post('/equipment/:id/maintenance', risController.addMaintenanceRecord);

// Totem / Kiosk Self-check-in
router.patch('/orders/:id/totem-arrival', risController.totemArrival);

// Teaching Files
router.patch('/reports/:id/teaching', risController.toggleTeachingFile);
router.get('/teaching-files', risController.getTeachingFiles);

// Teleradiology: Radiologist Workload
router.get('/teleradiology/workload', risController.getRadiologistWorkload);

// Model: Company (Empleadores / Empresas con Seguro)
router.post('/companies/seed', risController.seedCompanies);
router.get('/companies', risController.getCompanies);
router.post('/companies', risController.createCompany);
router.put('/companies/:id', risController.updateCompany);
router.delete('/companies/:id', risController.deleteCompany);

module.exports = router;
