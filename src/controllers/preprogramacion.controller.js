const RisPreprogramacion = require('../models/RisPreprogramacion');

// Exámenes de la hoja "Registro diario de programación de pacientes" (CNS - CVT REGPRG-001)
const EXAMENES_LAB = [
  'HTO', 'HB', 'HEMOGRAMA', 'QMC_SANGUINEA', 'SEROLOGIA', 'EGO', 'COPROLOGIA', 'H_PYLORI_SANGRE_OCULTA',
  'HORMONAS', 'PBAS_TRANSFERENCIA', 'COVID_ANTIGENO', 'COVID_ANTICUERPOS', 'COVID_QUIMIO',
];
const DIA = /^\d{4}-\d{2}-\d{2}$/;

// Solo los campos que se pueden escribir desde el formulario
function limpiar(body) {
  const campos = [
    'fechaExamen', 'nombreCompleto', 'matricula', 'celular', 'examenes', 'entregado', 'estado', 'paciente',
  ];
  const datos = {};
  for (const c of campos) if (body[c] !== undefined) datos[c] = body[c];
  if (datos.examenes) datos.examenes = [].concat(datos.examenes).filter((e) => EXAMENES_LAB.includes(e));
  if (typeof datos.celular === 'string') datos.celular = datos.celular.replace(/\s+/g, '');
  for (const c of ['nombreCompleto', 'matricula']) {
    if (typeof datos[c] === 'string') datos[c] = datos[c].trim().toUpperCase();
  }
  return datos;
}

const preprogramacionController = {
  // GET /api/ris/preprogramacion?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
  listar: async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      if (!DIA.test(desde || '') || !DIA.test(hasta || '')) {
        return res.status(400).json({ error: 'Indique desde y hasta con formato AAAA-MM-DD' });
      }
      const query = { fechaExamen: { $gte: desde, $lte: hasta } };
      if (req.user && req.user.role !== 'admin' && req.user.branch) query.branch = req.user.branch;
      const filas = await RisPreprogramacion.find(query).sort({ fechaExamen: 1, createdAt: 1 }).lean();
      res.json(filas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  crear: async (req, res) => {
    try {
      const datos = limpiar(req.body);
      if (!DIA.test(datos.fechaExamen || '')) return res.status(400).json({ error: 'Falta el día del examen' });
      if (!datos.nombreCompleto) return res.status(400).json({ error: 'Falta el nombre y apellido' });
      if (!datos.matricula) return res.status(400).json({ error: 'Falta la matrícula' });
      if (!datos.celular) return res.status(400).json({ error: 'Falta el celular' });
      if (!datos.examenes?.length) return res.status(400).json({ error: 'Marque al menos un examen' });
      const fila = await RisPreprogramacion.create({
        ...datos,
        estado: 'PROGRAMADO',
        branch: req.user?.branch,
        creadoPor: req.user?.nombre || req.user?.correo,
      });
      res.status(201).json(fila);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  actualizar: async (req, res) => {
    try {
      const datos = limpiar(req.body);
      if (datos.fechaExamen !== undefined && !DIA.test(datos.fechaExamen)) {
        return res.status(400).json({ error: 'Fecha de examen inválida' });
      }
      // Firma entrega: se guarda quién y cuándo entregó los resultados
      if (datos.entregado === true) Object.assign(datos, { entregadoEl: new Date(), entregadoPor: req.user?.nombre || req.user?.correo });
      if (datos.entregado === false) Object.assign(datos, { entregadoEl: null, entregadoPor: null });
      const fila = await RisPreprogramacion.findByIdAndUpdate(req.params.id, datos, { new: true, runValidators: true });
      if (!fila) return res.status(404).json({ error: 'No existe esa preprogramación' });
      res.json(fila);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  eliminar: async (req, res) => {
    try {
      const fila = await RisPreprogramacion.findByIdAndDelete(req.params.id);
      if (!fila) return res.status(404).json({ error: 'No existe esa preprogramación' });
      res.json({ message: 'Preprogramación eliminada' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = { ...preprogramacionController, EXAMENES_LAB };
