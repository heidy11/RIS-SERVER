const RisInformeLab = require('../models/RisInformeLab');

const ESTADOS = ['BORRADOR', 'COMPLETADO', 'FIRMADO'];
const quien = (req) => req.user?.nombre || req.user?.correo || 'Usuario';
const esAdmin = (req) => req.user?.role === 'admin';

// El frontend trabaja con `id`; en la base se llama `informeId` (el _id de Mongo no se expone)
const aCliente = (doc) => {
  if (!doc) return doc;
  const { _id, __v, informeId, ...resto } = doc;
  return { ...resto, id: informeId };
};

// Solo lo que manda el frontend: lo que pone el servidor no se puede sobrescribir
function limpiar(body) {
  const { _id, __v, id, informeId, origen, branch, creadoPor, modificadoPor, createdAt, updatedAt, ...datos } = body || {};
  if (datos.estado !== undefined && !ESTADOS.includes(datos.estado)) delete datos.estado;
  return datos;
}

const informeLabController = {
  // GET /api/ris/informes-lab?cod=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
  listar: async (req, res) => {
    try {
      const { cod, desde, hasta } = req.query;
      const query = {};
      if (cod) query.cod = cod;
      if (desde || hasta) query.fecha = { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) };
      if (req.user && !esAdmin(req) && req.user.branch) query.$or = [{ branch: req.user.branch }, { branch: null }];
      const filas = await RisInformeLab.find(query).sort({ fecha: -1, createdAt: -1 }).lean();
      res.json(filas.map(aCliente));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // PUT /api/ris/informes-lab/:id  (crea o actualiza; el id lo arma el frontend)
  guardar: async (req, res) => {
    try {
      const informeId = req.params.id;
      const datos = limpiar(req.body);
      const actual = await RisInformeLab.findOne({ informeId }).lean();

      // Un informe FIRMADO por el médico solo lo corrige el superusuario (administrador)
      if (actual?.estado === 'FIRMADO' && !esAdmin(req)) {
        return res.status(403).json({ error: 'Este informe está FIRMADO: solo el administrador puede corregirlo.' });
      }

      if (actual) {
        const fila = await RisInformeLab.findOneAndUpdate(
          { informeId },
          { $set: { ...datos, modificadoPor: quien(req) } },
          { new: true, runValidators: true }
        ).lean();
        return res.json(aCliente(fila));
      }
      const fila = await RisInformeLab.create({ ...datos, informeId, branch: req.user?.branch, creadoPor: quien(req) });
      res.status(201).json(aCliente(fila.toObject()));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // DELETE /api/ris/informes-lab/:id  (un informe FIRMADO no se elimina)
  eliminar: async (req, res) => {
    try {
      const actual = await RisInformeLab.findOne({ informeId: req.params.id }).lean();
      if (!actual) return res.status(404).json({ error: 'No existe ese informe' });
      if (actual.estado === 'FIRMADO') return res.status(403).json({ error: 'Un informe FIRMADO no se puede eliminar.' });
      await RisInformeLab.deleteOne({ informeId: req.params.id });
      res.json({ message: 'Informe eliminado' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // POST /api/ris/informes-lab/migrar  { informes: [...] }
  // Sube los informes que estaban solo en el navegador. Nunca reemplaza uno que ya existe.
  migrar: async (req, res) => {
    try {
      const informes = Array.isArray(req.body?.informes) ? req.body.informes : [];
      let creados = 0;
      for (const inf of informes) {
        if (!inf?.id) continue;
        const r = await RisInformeLab.updateOne(
          { informeId: String(inf.id) },
          { $setOnInsert: { ...limpiar(inf), informeId: String(inf.id), branch: req.user?.branch, creadoPor: quien(req) } },
          { upsert: true }
        );
        if (r.upsertedCount) creados++;
      }
      res.json({ recibidos: informes.length, creados });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = informeLabController;
