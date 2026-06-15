const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const RisPatientSchema = new mongoose.Schema({}, { strict: false, collection: 'rispatients' });
const RisPatient = mongoose.model('RisPatient', RisPatientSchema);

async function exportData() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ohif-db');
    const patients = await RisPatient.find({}).lean();
    
    fs.writeFileSync(path.join(__dirname, 'pacientes.json'), JSON.stringify(patients, null, 2));
    console.log(`Exito! ${patients.length} pacientes exportados a pacientes.json`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

exportData();
