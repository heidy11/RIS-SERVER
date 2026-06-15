const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../src/config/db');
const RisCompany = require('../src/models/RisCompany');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const seedCompanies = async () => {
  try {
    await connectDB();
    console.log('MongoDB connected. Inserción de empresas por defecto iniciada...');

    const companies = [
      { name: 'PARTICULAR', hasInsurance: false },
      { name: 'ALIANZA', hasInsurance: true, insuranceName: 'ALIANZA' },
      { name: 'BISA', hasInsurance: true, insuranceName: 'BISA' },
      { name: 'CAF', hasInsurance: true, insuranceName: 'CAF' },
      { name: 'CSBP', hasInsurance: true, insuranceName: 'CSBP' },
      { name: 'CPS', hasInsurance: true, insuranceName: 'CPS' },
      { name: 'COBEE', hasInsurance: true, insuranceName: 'COBEE' },
      { name: 'COMIBOL', hasInsurance: true, insuranceName: 'COMIBOL' },
      { name: 'EEC', hasInsurance: true, insuranceName: 'EEC' },
      { name: 'ILLAPA', hasInsurance: true, insuranceName: 'ILLAPA' },
      { name: 'JICA', hasInsurance: true, insuranceName: 'JICA' },
      { name: 'MSC', hasInsurance: true, insuranceName: 'MSC' },
      { name: 'NACIONAL', hasInsurance: true, insuranceName: 'NACIONAL' },
      { name: 'PROVIDA', hasInsurance: true, insuranceName: 'PROVIDA' },
      { name: 'SW', hasInsurance: true, insuranceName: 'SW' },
      { name: 'CIES', hasInsurance: true, insuranceName: 'CIES' },
      { name: 'INTI RAYMI', hasInsurance: true, insuranceName: 'INTI RAYMI' },
      { name: 'SOBOCE', hasInsurance: true, insuranceName: 'SOBOCE' },
      { name: 'CORDES', hasInsurance: true, insuranceName: 'CORDES' },
      { name: 'CEMES', hasInsurance: true, insuranceName: 'CEMES' }
    ];

    let created = 0;
    for (const comp of companies) {
      const exists = await RisCompany.findOne({ name: comp.name });
      if (!exists) {
        await RisCompany.create(comp);
        console.log(`+ Empresa creada: ${comp.name}`);
        created++;
      } else {
        console.log(`- Empresa ya existe: ${comp.name}`);
      }
    }

    console.log(`\nMigración completada. Se insertaron ${created} empresas por defecto.`);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

seedCompanies();
