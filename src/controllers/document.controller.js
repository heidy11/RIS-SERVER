const { generateDocxFromHtml, generateDocxFromTemplate } = require('../utils/generateDocx.js');

const createDocument = async (req, res) => {
  const { paciente, descripcion, fecha, conclusion, medico, valueDicom } = req.body;
  try {
    if (!paciente || !descripcion) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    // const { filename } = await generateDocx({ nombre: paciente, descripcion, fecha });
    const { filename } = await generateDocxFromTemplate({
      nombre: paciente,
      estudio: req.body.plantilla || undefined,
      descripcion,
      conclusion,
      fecha,
      imagenBase64: req.body.firma || undefined,
      medico,
      rama: req.body.rama || undefined,
      qrImagen: req.body.firma || undefined,
      valueDicom,
    });
    return res.status(201).json({ message: 'Documento creado exitosamente', filename });
  } catch (error) {
    console.error('Error al generar el documento:', error);
    return res.status(500).json({ message: 'Error del servidor al generar el documento' });
  }
};

module.exports = { createDocument };
