const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { createDocument } = require('../controllers/document.controller.js');

const documentsDir = path.join(__dirname, '../..', 'documents/template');

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
  console.log('La carpeta fue creada exitosamente:', documentsDir);
} else {
  console.log('La carpeta ya existe:', documentsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, documentsDir);
  },
  filename: function (req, file, cb) {
    const fileExtension = path.extname(file.originalname);
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      cb(null, `${'template'}${fileExtension}`);
  },
});
const fileFilter = (req, file, cb) => {
  // Solo permitir archivos .docx
  if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // Rechazar el archivo sin lanzar errores en el sistema
    return cb(null, false); // Esto evita que el archivo se suba
  }
  cb(null, true); // Si el archivo es válido, acepta la carga
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.post('/generate-doc', createDocument);

router.post('/document/template', upload.single('file'), (req, res) => {
  console.log('Archivo recibido:', req.file);

  if (!req.file) {
    return res.status(400).send({
      message: 'No se subió ningún archivo. Asegúrate de seleccionar un archivo .docx para subir.',
    });
  }

  if (
    req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return res.status(400).send({
      message: 'Solo se permiten archivos .docx. Por favor, sube un archivo de tipo .docx.',
    });
  }
  res.status(200).send({
    message: 'Archivo subido exitosamente',
    filePath: `/documents/template/${req.file.filename}`,
  });
});

router.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../..', 'documents', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ message: 'Archivo no encontrado' });
  }
});
router.get('/download-template/', (req, res) => {
  const filePath = path.join(__dirname, '../..', 'public', 'template1.docx');

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ message: 'Archivo no encontrado' });
  }
});

module.exports = router;
