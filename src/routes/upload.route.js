const archiver = require('archiver');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('../controllers/upload.controller.js');

const router = express.Router();

// Configurar multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const { paciente } = req.body;
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Ruta para subir un archivo
router.post('/upload', upload.single('file'), uploadFile);
router.get('/upload/:filename', (req, res) => {
  const requestedName = req.params.filename;
  const uploadsDir = path.join(__dirname, '../..', 'uploads');

  // Leer todos los archivos del directorio "uploads"
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Error al leer el directorio' });
    }

    const matchedFiles = files.filter(file => path.parse(file).name === requestedName);
    if (matchedFiles.length > 0) {
      // Si hay más de 2 archivos, los comprimimos en un ZIP
      if (matchedFiles.length > 1) {
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Nivel de compresión
        });

        // Establecer encabezados para la respuesta HTTP
        res.attachment(`${requestedName}_archivos.zip`);

        // Pipe el archivo ZIP a la respuesta
        archive.pipe(res);

        // Agregar todos los archivos coincidentes al ZIP
        matchedFiles.forEach(file => {
          const filePath = path.join(uploadsDir, file);
          archive.file(filePath, { name: file });
        });

        // Finalizar el archivo ZIP
        archive.finalize();
      } else {
        // Si son 1 o 2 archivos, solo enviamos el primero
        const filePath = path.join(uploadsDir, matchedFiles[0]);
        res.sendFile(filePath);
      }
    } else {
      res.status(404).json({ message: 'No se encontraron archivos con ese nombre' });
    }
  });
});
router.get('/documents/:filename', (req, res) => {
  const requestedName = req.params.filename;
  const uploadsDir = path.join(__dirname, '../..', 'documents');

  // Leer todos los archivos del directorio "uploads"
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Error al leer el directorio' });
    }

    const matchedFiles = files.filter(file => path.parse(file).name === requestedName);
    if (matchedFiles.length > 0) {
      // Si hay más de 2 archivos, los comprimimos en un ZIP
      if (matchedFiles.length > 1) {
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Nivel de compresión
        });

        // Establecer encabezados para la respuesta HTTP
        res.attachment(`${requestedName}_archivos.zip`);

        // Pipe el archivo ZIP a la respuesta
        archive.pipe(res);

        // Agregar todos los archivos coincidentes al ZIP
        matchedFiles.forEach(file => {
          const filePath = path.join(uploadsDir, file);
          archive.file(filePath, { name: file });
        });

        // Finalizar el archivo ZIP
        archive.finalize();
      } else {
        // Si son 1 o 2 archivos, solo enviamos el primero
        const filePath = path.join(uploadsDir, matchedFiles[0]);
        res.sendFile(filePath);
      }
    } else {
      res.status(404).json({ message: 'No se encontraron archivos con ese nombre' });
    }
  });
});
// --- Listar archivos de un paciente ---
router.get('/files/:paciente', (req, res) => {
  const requestedName = req.params.paciente;
  const uploadsDir = path.join(__dirname, '../..', 'uploads');

  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: 'Error al leer el directorio' });
    }

    const matchedFiles = files
      .filter(file => path.parse(file).name === requestedName)
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        let stats = {};
        try {
          const s = fs.statSync(filePath);
          stats = { size: s.size, uploadedAt: s.mtime };
        } catch (_) {}
        return {
          filename: file,
          ext: path.extname(file).replace('.', '').toLowerCase(),
          ...stats,
        };
      });

    res.json(matchedFiles);
  });
});

// --- Descargar un archivo específico por nombre completo ---
router.get('/files/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../..', 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }

  res.download(filePath);
});

// --- Eliminar un archivo específico ---
router.delete('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../..', 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ message: 'Archivo eliminado correctamente', filename });
  } catch (err) {
    console.error('Error al eliminar archivo:', err);
    res.status(500).json({ message: 'Error al eliminar el archivo' });
  }
});

module.exports = router;
