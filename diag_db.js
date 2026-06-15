const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server/.env') });

const RisReport = require('./server/src/models/RisReport');
const RisOrder = require('./server/src/models/RisOrder');

async function run() {
  try {
    console.log('Connecting to:', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);

    const reports = await RisReport.find().populate('order');
    console.log(`Found ${reports.length} reports.`);

    reports.slice(0, 3).forEach(r => {
      console.log(`Report ID: ${r._id}`);
      console.log(`  StudyInstanceUID: ${r.studyInstanceUid}`);
      console.log(`  Order Linked: ${r.order ? 'YES (' + r.order._id + ')' : 'NO'}`);
      if (r.order) {
        console.log(`  Order Accession: ${r.order.accessionNumber}`);
      }
    });

    const orders = await RisOrder.find();
    console.log(`Found ${orders.length} orders.`);
    orders.slice(0, 3).forEach(o => {
      console.log(`Order ID: ${o._id}`);
      console.log(`  Accession: ${o.accessionNumber}`);
      console.log(`  StudyInstanceUID: ${o.studyInstanceUid || 'MISSING'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
