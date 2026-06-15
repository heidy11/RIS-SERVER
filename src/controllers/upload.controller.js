const path = require('path');
const fs = require('fs');
const Files = require('../models/upload.model.js');

const uploadFile = async (req, res) => {
  const paciente = req.body.paciente;

  if (!req.file || !paciente) {
    return res.status(400).json({ message: 'Faltan datos o archivo' });
  }

  const uploadsDir = path.join(__dirname, '../..', 'uploads');
  const oldPath = path.join(uploadsDir, req.file.filename);

  // Extraer solo la extensión
  const ext = path.extname(req.file.originalname);
  const newFileName = `${paciente}${ext}`;
  const newPath = path.join(uploadsDir, newFileName);

  try {
    await fs.promises.rename(oldPath, newPath);

    // Reemplazar el documento si ya existe
    await Files.updateOne(
      { archivo: newFileName },
      {
        $set: {
          nombre: req.file.originalname,
          archivo: newFileName,
        },
      },
      { upsert: true }
    );

    res.status(200).json({
      message: 'Archivo subido y renombrado correctamente',
      filename: newFileName,
      path: path.join('uploads', newFileName),
    });
  } catch (err) {
    console.error('Error al renombrar o guardar en DB:', err);
    res.status(500).json({ message: 'Error al procesar el archivo' });
  }
};

module.exports = { uploadFile };
