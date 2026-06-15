// server/config/db.js
const mongoose = require('mongoose');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const crearUsuarioAdmin = async () => {
  try {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    // Verificamos si el usuario admin ya existe
    const usuarioExistente = await User.findOne({ correo: String(process.env.ADMIN_EMAIL) });
    if (usuarioExistente) {
      console.log('El usuario administrador ya existe');
      return;
    }
    // Si no existe, creamos el usuario admin
    const nuevoUsuario = new User({
      nombre: 'Usuario Administrador',
      correo: String(process.env.ADMIN_EMAIL),
      contraseña: hashedPassword,
      role: 'admin',
      vistas: [
        'MAMOGRAFIA',
        'TOMOGRAFIA',
        'RESONANCIA',
        'ULTRASONIDO',
        'RAYOS X',
        'DOC',
        'INFORMES',
        'LINK DE ENVIO',
        'DESCARGA DE SERIES',
        'SEND DICOM',
        'MPR ADVANCED',
        'VISTA COMMON',
      ],
      fechaCreacion: new Date('2025-08-12T20:00:27.989Z'),
    });

    await nuevoUsuario.save();
    console.log('Usuario administrador creado automáticamente');
  } catch (error) {
    console.error('Error creando usuario admin:', error);
  }
};
const Modality = require('../models/modality.model');

const seedModalities = async () => {
  const defaultModalities = [
    { dicom_code: 'CT', name: 'Tomografía Computada', description: 'Computed Tomography' },
    { dicom_code: 'MR', name: 'Resonancia Magnética', description: 'Magnetic Resonance' },
    { dicom_code: 'DX', name: 'Radiología Digital', description: 'Digital Radiography' },
    { dicom_code: 'CR', name: 'Radiografía Computada', description: 'Computed Radiography' },
    { dicom_code: 'US', name: 'Ecografía', description: 'Ultrasound' },
    { dicom_code: 'MG', name: 'Mamografía', description: 'Mammography' },
    { dicom_code: 'PT', name: 'PET', description: 'Positron Emission Tomography' },
    { dicom_code: 'XA', name: 'Angiografía', description: 'X-Ray Angiography' },
  ];

  try {
    for (const mod of defaultModalities) {
      const existing = await Modality.findOne({ dicom_code: mod.dicom_code });
      if (!existing) {
        await new Modality(mod).save();
        console.log(`Modalidad creada: ${mod.dicom_code}`);
      }
    }
  } catch (error) {
    console.error('Error al poblar modalidades:', error);
  }
};

const Organization = require('../models/organization.model');
const Branch = require('../models/branch.model');
const Service = require('../models/service.model');
const { usServices, densServices, mgServices, rxServices, ctServices } = require('./seedData');

const seedOrganizationAndBranch = async () => {
  try {
    let org = await Organization.findOne({ oid: '1.2.3.4.5' });
    if (!org) {
      org = await new Organization({
        name: 'Organización Principal por Defecto',
        short_name: 'ORG-DEF',
        oid: '1.2.3.4.5',
        country_code: 'BO',
        structure_id: 'ORG01',
        suffix: 'DEF',
      }).save();
      console.log('Organización por defecto creada');
    }

    let branch = await Branch.findOne({ oid: '1.2.3.4.5.1' });
    if (!branch) {
      branch = await new Branch({
        fk_organization: org._id,
        name: 'Sucursal Central por Defecto',
        short_name: 'SUC-CEN',
        oid: '1.2.3.4.5.1',
        country_code: 'BO',
        structure_id: 'SUC01',
        suffix: 'CEN',
      }).save();
      console.log('Sucursal por defecto creada');
    }

    return branch._id;
  } catch (error) {
    console.error('Error al poblar organizacion y sucursal:', error);
    return null;
  }
};

const seedServices = async (branchId) => {
  if (!branchId) return;
  try {
    const createServicesForModality = async (dicomCode, servicesArray) => {
      const modality = await Modality.findOne({ dicom_code: dicomCode });
      if (!modality) return;
      for (const svc of servicesArray) {
        const existing = await Service.findOne({ name: svc.name, fk_branch: branchId });
        if (!existing) {
          await new Service({
            fk_branch: branchId,
            fk_modality: modality._id,
            name: svc.name,
            price: svc.price,
          }).save();
        }
      }
    };

    await createServicesForModality('US', usServices);
    await createServicesForModality('DX', densServices); // Densitometria commonly mapped to DX if DENS not available
    await createServicesForModality('MG', mgServices);
    await createServicesForModality('CR', rxServices); // Assuming Rayos X as CR or DX
    await createServicesForModality('CT', ctServices);
    
    console.log('Servicios poblanos correctamente.');
  } catch (error) {
    console.error('Error al poblar servicios:', error);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
    });
    console.log('MongoDB Conectado...');
    await crearUsuarioAdmin();
    await seedModalities();
    const defaultBranchId = await seedOrganizationAndBranch();
    await seedServices(defaultBranchId);
  } catch (error) {
    console.error('Error al conectar con MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
