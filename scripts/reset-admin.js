// Pone al administrador la contraseña que figura en el .env (ADMIN_EMAIL / ADMIN_PASSWORD).
// El backend crea el administrador una sola vez, en el primer arranque: si después se
// cambia la contraseña en el .env, la de la base de datos no cambia y el login la rechaza.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/user.model');

async function main() {
  const correo = process.env.ADMIN_EMAIL && String(process.env.ADMIN_EMAIL).trim();
  const contrasena = process.env.ADMIN_PASSWORD;
  if (!correo || !contrasena) {
    console.error('Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el .env.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const usuario = await User.findOne({ correo });
  if (usuario) {
    usuario.contraseña = await bcrypt.hash(contrasena, 10);
    await usuario.save();
    console.log(`Listo: el administrador ${correo} ahora entra con la contraseña del .env.`);
  } else {
    // El correo distingue mayúsculas: mostrar los que existen ayuda a detectar la diferencia.
    const admins = await User.find({ role: 'admin' }).select('correo').lean();
    console.log(`No existe ningún usuario con el correo ${correo}.`);
    console.log(admins.length
      ? `Administradores registrados: ${admins.map(a => a.correo).join(', ')}`
      : 'No hay administradores registrados.');
    console.log('Si el correo del .env es el correcto, reiniciar el backend: lo crea solo al arrancar.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(`No se pudo restablecer el administrador: ${err.message}`);
  process.exit(1);
});
