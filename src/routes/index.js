const express = require('express');
const router = express.Router();

// ──────────────────────────────────────────────
// Importación de módulos de rutas
// ──────────────────────────────────────────────

const userRoutes = require('./user.route.js');             // Gestión de usuarios (CRUD)
const documentRoutes = require('./document.route.js');     // Gestión de documentos médicos
const uploadRoutes = require('./upload.route.js');         // Subida de archivos al servidor
const authRoutes = require('./auth.route.js');             // Autenticación (login, logout, registro)
const patientRoutes = require('./patient.route.js');       // Gestión de pacientes
const dicomRoutes = require('./dicom.route.js');           // Operaciones con imágenes DICOM
const appointmentRoutes = require('./appointment.routes.js'); // Gestión de citas médicas
const logsRoutes = require('./logs.route.js');             // Registro de logs del sistema
const serverRoutes = require('./server.route.js');         // Estado y configuración del servidor
const tokenRoutes = require('./generateToken.js');         // Generación de tokens JWT/acceso
const organizationRoutes = require('./organization.route.js'); // Gestión de organizaciones
const branchRoutes = require('./branch.routes.js');        // Gestión de sucursales
const serviceRoutes = require('./service.routes.js');      // Gestión de servicios médicos
const modalityRoutes = require('./modality.routes.js');    // Gestión de modalidades de imagen (RX, CT, MR, etc.)
const equipmentRoutes = require('./equipment.routes.js');  // Gestión de equipos médicos
const slotRoutes = require('./slot.routes.js');            // Gestión de slots de disponibilidad para citas
const settingsRoutes = require('./settings.routes.js');    // Configuración general del sistema
const whatsappRoutes = require('./whatsapp.route.js');     // Integración con WhatsApp (notificaciones/mensajes)
const risRoutes = require('./ris.route.js');               // RIS (Radiology Information System)

// ──────────────────────────────────────────────
// Registro de rutas en el router principal
// Todas estas rutas quedan bajo el prefijo /api
// cuando este router se monta en server.js
// ──────────────────────────────────────────────

router.use('/server', serverRoutes);           // GET /api/server      → Estado del servidor
router.use('/dicom', dicomRoutes);             // *   /api/dicom       → Operaciones DICOM
router.use('/ris', risRoutes);                 // *   /api/ris         → Sistema de información radiológica
router.use('/auth', authRoutes);               // POST /api/auth       → Autenticación de usuarios
router.use('/usuarios', userRoutes);           // *   /api/usuarios    → CRUD de usuarios
router.use('/pacientes', patientRoutes);       // *   /api/pacientes   → CRUD de pacientes
router.use('/organizations', organizationRoutes); // * /api/organizations → Gestión de organizaciones
router.use('/documentos', documentRoutes);     // *   /api/documentos  → Gestión de documentos médicos
router.use('/subida', uploadRoutes);           // POST /api/subida     → Subida de archivos
router.use('/appointments', appointmentRoutes); // * /api/appointments → Gestión de citas
router.use('/branches', branchRoutes);         // *   /api/branches    → Gestión de sucursales
router.use('/services', serviceRoutes);        // *   /api/services    → Gestión de servicios
router.use('/modalities', modalityRoutes);     // *   /api/modalities  → Gestión de modalidades
router.use('/equipments', equipmentRoutes);    // *   /api/equipments  → Gestión de equipos
router.use('/slots', slotRoutes);              // *   /api/slots       → Disponibilidad de turnos
router.use('/settings', settingsRoutes);       // *   /api/settings    → Configuración del sistema
router.use('/whatsapp', whatsappRoutes);       // *   /api/whatsapp    → Mensajería WhatsApp

// Ruta de generación de token montada en la raíz relativa de este router.
// Como este router se monta en /api en server.js, la ruta resultante es:
// POST /api/token
router.use('/', tokenRoutes);

module.exports = router;
