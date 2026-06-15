const mongoose = require('mongoose');
// Definimos el esquema del modelo
const findActivateSchema = new mongoose.Schema({
  isActive: {
    type: Boolean,
    required: true,
    default: false, // Valor por defecto 'false'
  },
});

// Creamos el modelo
const FindActivate = mongoose.model('FindActivate', findActivateSchema);

// Aseguramos que exista un único documento en la colección
const ensureFindActivateExists = async () => {
  const findActivate = await FindActivate.findOne();
  if (!findActivate) {
    // Si no existe, lo creamos automáticamente con isActive: false
    await FindActivate.create({ isActive: false });
    console.log('Documento "FindActivate" creado automáticamente con isActive: false');
  }
};

// Llamamos a la función para crear el documento si no existe
ensureFindActivateExists();

module.exports = { FindActivate, ensureFindActivateExists };
