const jwt = require('jsonwebtoken');
const Token = require('../models/token.model');

const JWT_SECRET = 'tu_clave_secreta';

const createToken = async (req, res) => {
  const { maxAccess } = req.body;
  if (!maxAccess) {
    return res
      .status(400)
      .json({ message: 'Se requiere la cantidad de días de validez del token.' });
  }

  try {
    const expirationDate = new Date(Date.now() + maxAccess * 24 * 60 * 60 * 1000);
    const token = jwt.sign({ exp: Math.floor(expirationDate.getTime() / 1000) }, JWT_SECRET);

    const newToken = new Token({
      token,
      expiracion: expirationDate,
    });
    await newToken.save();

    res.json({
      token,
      message: `Token creado exitosamente, válido por ${maxAccess} días.`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el token.', error: error.message });
  }
};

const verifyToken = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ message: 'Se requiere un token para la verificación.' });
  }

  try {
    const storedToken = await Token.findOne({ token });

    if (!storedToken) {
      return res.status(404).json({ message: 'Token no encontrado en la base de datos.' });
    }

    const currentDate = new Date();
    if (currentDate > storedToken.expiracion) {
      await Token.deleteOne({ token });

      return res.status(401).json({ message: 'El token ha expirado y ha sido eliminado.' });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: 'Token inválido.' });
      }
      res.json({
        message: 'Token válido.',
        decoded,
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar el token.', error: error.message });
  }
};

module.exports = { createToken, verifyToken };
