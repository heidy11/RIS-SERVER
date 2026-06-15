const Server = require('../models/server.model.js');

// Obtener todos los servidores
exports.getServers = async (req, res) => {
  try {
    const servers = await Server.find();
    res.status(200).json(servers);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener servidores', error });
  }
};

// Crear un nuevo servidor
exports.postServer = async (req, res) => {
  const { host, port, calledAET, callingAET = 'MAYU', isDefault } = req.body;

  if (!host || !port || !calledAET) {
    return res.status(400).json({ message: 'Todos los campos son requeridos' });
  }

  try {
    if (isDefault) {
      await Server.updateMany({ isDefault: true }, { isDefault: false });
    }

    const newServer = new Server({ host, port, calledAET, callingAET, isDefault: !!isDefault });
    await newServer.save();
    res.status(201).json(newServer);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear servidor', error });
  }
};

// Eliminar servidor
exports.deleteServer = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedServer = await Server.findByIdAndDelete(id);
    if (!deletedServer) {
      return res.status(404).json({ message: 'Servidor no encontrado' });
    }
    res.status(200).json({ message: 'Servidor eliminado', deletedServer });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar servidor', error });
  }
};

// Actualizar servidor
exports.patch = async (req, res) => {
  const { _id, ...updates } = req.body;
  const id = _id;
  if (!id) {
    return res.status(400).json({ message: 'ID requerido para actualizar' });
  }

  try {
    if (updates.isDefault) {
      await Server.updateMany({ isDefault: true }, { isDefault: false });
    }

    const updatedServer = await Server.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedServer) {
      return res.status(404).json({ message: 'Servidor no encontrado' });
    }

    res.status(200).json(updatedServer);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar servidor', error });
  }
};

// Establecer como servidor por defecto
exports.setDefaultServer = async (req, res) => {
  const { id } = req.params;

  try {
    const server = await Server.findById(id);
    if (!server) {
      return res.status(404).json({ message: 'Servidor no encontrado' });
    }

    await Server.updateMany({ isDefault: true }, { isDefault: false });

    server.isDefault = true;
    await server.save();

    res.status(200).json({ message: 'Servidor establecido como predeterminado', server });
  } catch (error) {
    res.status(500).json({ message: 'Error al establecer como predeterminado', error });
  }
};
