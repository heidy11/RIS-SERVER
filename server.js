const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./src/config/db.js');
const fileUpload = require('express-fileupload');
const startLoginProcess = require('./src/utils/puppeteerLogin.js');
const apiRoutes = require('./src/routes/index.js');
const logsRoutes = require('./src/routes/logs.route.js');

// Configurar variables de entorno
dotenv.config();
const shouldAutoLogin = process.env.AUTO_LOGIN === 'true';

// Conectar a MongoDB
connectDB();

// Crear servidor Express
const app = express();
// Litmite de envio de archivos
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // o más si lo necesitas
// logs
app.use(logsRoutes);

// Rutas
app.use('/api', apiRoutes);

// Initialize WhatsApp Service
const whatsappService = require('./src/services/whatsapp.service.js');
whatsappService.initialize();

// Initialize HL7 Service
const hl7Service = require('./src/services/hl7.service.js');
hl7Service.initialize();

// Permitir acceso a archivos en la carpeta "documents"
const path = require('path');
app.use('/documents', express.static(path.join(__dirname, 'documents')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Iniciar el proceso de envio automatico
if (shouldAutoLogin) {
  console.log('Auto-login activado. Iniciando el proceso...');
  startLoginProcess(); // Esto inicia el proceso de login y la verificación periódica
} else {
  console.log('Auto-login desactivado. El proceso no se ejecutará.');
}

// Iniciar proceso de envio automatico DICOM
const shouldAutoEnvio = process.env.AUTO_ENVIO === 'true';
const dicomLocalSend = require('./src/controllers/dicomLocalSend.controller.js');

if (shouldAutoEnvio) {
  console.log('🚀 Envío automático DICOM activado (Robust Sync). Iniciando ciclo...');

  // Ejecutar inmediatamente al inicio
  dicomLocalSend
    .syncStudies()
    .catch(err => console.error('❌ Error en sincronización inicial:', err.message));

  // Programar ejecución periódica
  const INTERVAL_MS = process.env.SYNC_INTERVAL
    ? parseInt(process.env.SYNC_INTERVAL)
    : 5 * 60 * 1000;

  dicomLocalSend._syncState.nextSyncTime = Date.now() + INTERVAL_MS;

  setInterval(() => {
    console.log('⏰ Ejecutando sincronización programada...');
    dicomLocalSend
      .syncStudies()
      .catch(err => console.error('❌ Error en sincronización programada:', err.message))
      .finally(() => {
        dicomLocalSend._syncState.nextSyncTime = Date.now() + INTERVAL_MS;
      });
  }, INTERVAL_MS);
} else {
  console.log('⏸ Envío automático DICOM desactivado (AUTO_ENVIO != true).');
}

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
