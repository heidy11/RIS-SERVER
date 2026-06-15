const RisPatient = require('../models/RisPatient');
const RisOrder = require('../models/RisOrder');
const RisReport = require('../models/RisReport');
const Modality = require('../models/modality.model');
const Equipment = require('../models/equipment.model');
const Service = require('../models/service.model');
const Branch = require('../models/branch.model');
const RisTemplate = require('../models/RisTemplate');
const RisInventory = require('../models/RisInventory');
const RisCashRegister = require('../models/RisCashRegister');
const RisCompany = require('../models/RisCompany');

const risController = {
  // --- Pacientes ---
  getPatients: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) {
        query.branch = req.user.branch;
      }
      const patients = await RisPatient.find(query).sort({ createdAt: -1 });
      res.json(patients);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createPatient: async (req, res) => {
    try {
      const patientData = { ...req.body };
      // Only auto-assign branch if NOT admin. Admins can specify branch in body.
      if (req.user && req.user.role !== 'admin' && req.user.branch) {
        patientData.branch = req.user.branch;
      }
      const patient = new RisPatient(patientData);
      await patient.save();
      res.status(201).json(patient);
    } catch (error) {
      if (error.code === 11000) return res.status(400).json({ error: 'Patient ID ya existe' });
      res.status(400).json({ error: error.message });
    }
  },
  updatePatient: async (req, res) => {
    try {
      const { id } = req.params;
      const patient = await RisPatient.findByIdAndUpdate(id, req.body, { new: true });
      if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
      res.json(patient);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deletePatient: async (req, res) => {
    try {
      const { id } = req.params;
      const patient = await RisPatient.findByIdAndDelete(id);
      if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
      res.json({ message: 'Paciente eliminado correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Órdenes (Citas) ---
  getOrders: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) {
        query.branch = req.user.branch;
      }
      const orders = await RisOrder.find(query).populate('patient').sort({ scheduledDate: 1 });
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createOrder: async (req, res) => {
    try {
      const orderData = { ...req.body };
      // Only auto-assign branch if NOT admin. Admins can specify branch in body.
      if (req.user && req.user.role !== 'admin' && req.user.branch) {
        orderData.branch = req.user.branch;
      }
      const order = new RisOrder(orderData);
      await order.save();
      res.status(201).json(order);
    } catch (error) {
      if (error.code === 11000)
        return res.status(400).json({ error: 'Accession Number ya existe' });
      res.status(400).json({ error: error.message });
    }
  },
  updateOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const order = await RisOrder.findByIdAndUpdate(id, req.body, { new: true });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const order = await RisOrder.findByIdAndDelete(id);
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json({ message: 'Orden eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateOrderStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const order = await RisOrder.findByIdAndUpdate(id, { status }, { new: true });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Informes Radiológicos ---
  getReportByStudyId: async (req, res) => {
    try {
      const { studyInstanceUid } = req.params;
      const report = await RisReport.findOne({ studyInstanceUid }).populate({
        path: 'order',
        populate: { path: 'patient' },
      });
      if (!report) {
        return res.json(null); // Válido si aún no tiene reporte redactado.
      }
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  saveReport: async (req, res) => {
    try {
      const { studyInstanceUid, contentHtml, status, radiologist, orderId } = req.body;

      let report = await RisReport.findOne({ studyInstanceUid });
      if (report) {
        if (report.status === 'SIGNED' && req.body.revertStatus !== true) {
          return res
            .status(400)
            .json({ error: 'El reporte ya está firmado y no puede ser modificado' });
        }
        if (contentHtml !== undefined) report.contentHtml = contentHtml;
        if (status) report.status = status;
        if (status === 'SIGNED') report.signedAt = new Date();

        await report.save();
      } else {
        const payload = { studyInstanceUid, contentHtml, status, radiologist };
        if (orderId) payload.order = orderId;
        if (status === 'SIGNED') payload.signedAt = new Date();

        report = new RisReport(payload);
        await report.save();
      }

      // Si el reporte pasa a SIGNED, enviar HL7 ORU
      if (status === 'SIGNED') {
        try {
          // Poblar para sacar datos
          await report.populate({ path: 'order', populate: { path: 'patient' } });
          const hl7Service = require('../services/hl7.service');

          const hl7Date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
          const accession = report.order?.accessionNumber || 'UNKNOWN';
          const patientId = report.order?.patient?.patientId || 'UNKNOWN';
          const lastName = report.order?.patient?.lastName || 'UNKNOWN';
          const firstName = report.order?.patient?.firstName || 'UNKNOWN';
          const procDesc = report.order?.procedureDescription || 'ESTUDIO';

          // Construir mensaje HL7 básico ORU^R01
          const msh = `MSH|^~\\&|RIS|OHIF|HIS|HCP|${hl7Date}||ORU^R01|MSG${Date.now()}|P|2.3`;
          const pid = `PID|1||${patientId}||${lastName}^${firstName}|||U`;
          const obr = `OBR|1||${accession}|${procDesc}||||||||||||||||||||||F`;
          const obx = `OBX|1|TX|REPORT||${(contentHtml || '').replace(/[\r\n]+/g, ' ')}||||||F`;

          const hl7Message = [msh, pid, obr, obx].join('\r') + '\r';

          const host = process.env.HIS_HL7_HOST || '127.0.0.1';
          const port = parseInt(process.env.HIS_HL7_PORT || '2576');

          console.log(`[RIS] Enviando ORU^R01 a ${host}:${port}...`);
          // Lo enviamos en fire-and-forget para no bloquear el request http si falla
          hl7Service.sendHL7Message(host, port, hl7Message).catch(err => {
            console.error('[RIS] Error enviando reporte por HL7:', err.message);
          });
        } catch (e) {
          console.error('[RIS] Error al construir el mensaje HL7 ORU:', e.message);
        }
      }

      res.json(report);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Modalidades ---
  getModalities: async (req, res) => {
    try {
      const modalities = await Modality.find().sort({ name: 1 });
      res.json(modalities);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createModality: async (req, res) => {
    try {
      const modality = new Modality(req.body);
      await modality.save();
      res.status(201).json(modality);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateModality: async (req, res) => {
    try {
      const { id } = req.params;
      const modality = await Modality.findByIdAndUpdate(id, req.body, { new: true });
      if (!modality) return res.status(404).json({ error: 'Modalidad no encontrada' });
      res.json(modality);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteModality: async (req, res) => {
    try {
      const { id } = req.params;
      const modality = await Modality.findByIdAndDelete(id);
      if (!modality) return res.status(404).json({ error: 'Modalidad no encontrada' });
      res.json({ message: 'Modalidad eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Equipos ---
  getEquipment: async (req, res) => {
    try {
      const equipment = await Equipment.find().sort({ name: 1 });
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createEquipment: async (req, res) => {
    try {
      const equipment = new Equipment(req.body);
      await equipment.save();
      res.status(201).json(equipment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateEquipment: async (req, res) => {
    try {
      const { id } = req.params;
      const equipment = await Equipment.findByIdAndUpdate(id, req.body, { new: true });
      if (!equipment) return res.status(404).json({ error: 'Equipo no encontrado' });
      res.json(equipment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteEquipment: async (req, res) => {
    try {
      const { id } = req.params;
      const equipment = await Equipment.findByIdAndDelete(id);
      if (!equipment) return res.status(404).json({ error: 'Equipo no encontrado' });
      res.json({ message: 'Equipo eliminado correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Servicios (Procedimientos) ---
  getServices: async (req, res) => {
    try {
      const services = await Service.find()
        .populate('fk_modality')
        .populate('fk_branch')
        .populate('fk_equipments')
        .sort({ name: 1 });
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createService: async (req, res) => {
    try {
      const service = new Service(req.body);
      await service.save();
      res.status(201).json(service);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateService: async (req, res) => {
    try {
      const { id } = req.params;
      const service = await Service.findByIdAndUpdate(id, req.body, { new: true });
      if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
      res.json(service);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteService: async (req, res) => {
    try {
      const { id } = req.params;
      const service = await Service.findByIdAndDelete(id);
      if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
      res.json({ message: 'Servicio eliminado correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Sucursales ---
  getBranches: async (req, res) => {
    try {
      const branches = await Branch.find().sort({ name: 1 });
      res.json(branches);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createBranch: async (req, res) => {
    try {
      const branch = new Branch(req.body);
      await branch.save();
      res.status(201).json(branch);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateBranch: async (req, res) => {
    try {
      const { id } = req.params;
      const branch = await Branch.findByIdAndUpdate(id, req.body, { new: true });
      if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
      res.json(branch);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteBranch: async (req, res) => {
    try {
      const { id } = req.params;
      const branch = await Branch.findByIdAndDelete(id);
      if (!branch) return res.status(404).json({ error: 'Sucursal no encontrada' });
      res.json({ message: 'Sucursal eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Listado de Informes ---
  getAllReports: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) {
        query.branch = req.user.branch;
      }
      const reports = await RisReport.find(query)
        .populate({
          path: 'order',
          populate: { path: 'patient' },
        })
        .sort({ createdAt: -1 });
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // --- Analíticas y Estadísticas ---
  getAnalytics: async (req, res) => {
    try {
      const totalPatients = await RisPatient.countDocuments();
      const totalOrders = await RisOrder.countDocuments();
      const totalReports = await RisReport.countDocuments();

      // Today boundaries
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Orders today
      const ordersToday = await RisOrder.countDocuments({
        scheduledDate: { $gte: todayStart, $lte: todayEnd },
      });

      // Revenue totals (only PAID orders)
      const revenueAgg = await RisOrder.aggregate([
        { $match: { paymentStatus: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]);
      const revenue = revenueAgg[0]?.total || 0;

      // Revenue today
      const revenueTodayAgg = await RisOrder.aggregate([
        { $match: { paymentStatus: 'PAID', scheduledDate: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]);
      const revenueToday = revenueTodayAgg[0]?.total || 0;

      // Estudios por Modalidad
      const ordersByModality = await RisOrder.aggregate([
        { $group: { _id: '$modality', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);

      // Órdenes por Estado
      const ordersByStatus = await RisOrder.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      // Informes por Estado
      const reportsByStatus = await RisReport.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      // Orders by day (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      const ordersByDay = await RisOrder.aggregate([
        { $match: { scheduledDate: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledDate' } },
            count: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, '$totalAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Revenue by payment method
      const revenueByMethod = await RisOrder.aggregate([
        { $match: { paymentStatus: 'PAID', paymentMethod: { $ne: '' } } },
        { $group: { _id: '$paymentMethod', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]);

      // Low stock inventory items (below 5 units)
      const lowStockItems = await RisInventory.find({ stockQuantity: { $lte: 5 } })
        .sort({ stockQuantity: 1 })
        .limit(10)
        .lean();

      res.json({
        summary: {
          patients: totalPatients,
          orders: totalOrders,
          reports: totalReports,
          ordersToday,
          revenue,
          revenueToday,
        },
        charts: {
          modalities: ordersByModality,
          orderStatuses: ordersByStatus,
          reportStatuses: reportsByStatus,
          ordersByDay,
          revenueByMethod,
        },
        alerts: {
          lowStockItems,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // --- Plantillas de Informes (Templates) ---
  getTemplates: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) query.branch = req.user.branch;
      const templates = await RisTemplate.find(query).sort({ name: 1 });
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createTemplate: async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.user && req.user.role !== 'admin' && req.user.branch) data.branch = req.user.branch;
      const template = new RisTemplate(data);
      await template.save();
      res.status(201).json(template);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateTemplate: async (req, res) => {
    try {
      const { id } = req.params;
      const template = await RisTemplate.findByIdAndUpdate(id, req.body, { new: true });
      if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' });
      res.json(template);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteTemplate: async (req, res) => {
    try {
      const { id } = req.params;
      const template = await RisTemplate.findByIdAndDelete(id);
      if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' });
      res.json({ message: 'Plantilla eliminada' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Inventario (Consumables) ---
  getInventory: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) query.branch = req.user.branch;
      const inventory = await RisInventory.find(query).sort({ itemName: 1 });
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createInventory: async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.user && req.user.role !== 'admin' && req.user.branch) data.branch = req.user.branch;
      const item = new RisInventory(data);
      await item.save();
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  updateInventory: async (req, res) => {
    try {
      const { id } = req.params;
      const item = await RisInventory.findByIdAndUpdate(id, req.body, { new: true });
      if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteInventory: async (req, res) => {
    try {
      const { id } = req.params;
      const item = await RisInventory.findByIdAndDelete(id);
      if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });
      res.json({ message: 'Ítem eliminado' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Caja (Cash Register) ---
  getCashRegisters: async (req, res) => {
    try {
      const query = {};
      if (req.user && req.user.role !== 'admin' && req.user.branch) query.branch = req.user.branch;
      const registers = await RisCashRegister.find(query).sort({ openedAt: -1 });
      res.json(registers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  openCashRegister: async (req, res) => {
    try {
      const data = { ...req.body, openedAt: new Date(), status: 'OPEN' };
      if (req.user) data.user = req.user.username || req.user.name;
      if (req.user && req.user.role !== 'admin' && req.user.branch) data.branch = req.user.branch;
      const register = new RisCashRegister(data);
      await register.save();
      res.status(201).json(register);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  closeCashRegister: async (req, res) => {
    try {
      const { id } = req.params;
      const register = await RisCashRegister.findById(id);
      if (!register) return res.status(404).json({ error: 'Caja no encontrada' });
      if (register.status === 'CLOSED') return res.status(400).json({ error: 'La caja ya está cerrada' });
      
      register.closedAt = new Date();
      register.status = 'CLOSED';
      if (req.body.actualCash !== undefined) register.actualCash = req.body.actualCash;
      if (req.body.expectedCash !== undefined) register.expectedCash = req.body.expectedCash;
      if (req.body.notes !== undefined) register.notes = req.body.notes;
      
      await register.save();
      res.json(register);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Equipment Maintenance ---
  addMaintenanceRecord: async (req, res) => {
    try {
      const { id } = req.params;
      const { date, description, technician, cost, nextMaintenanceDate } = req.body;
      const equipment = await Equipment.findById(id);
      if (!equipment) return res.status(404).json({ error: 'Equipo no encontrado' });

      equipment.maintenanceHistory.push({ date: date || new Date(), description, technician, cost });
      equipment.lastMaintenanceDate = date || new Date();
      if (nextMaintenanceDate) {
        equipment.nextMaintenanceDate = nextMaintenanceDate;
      } else if (equipment.maintenanceIntervalDays) {
        const next = new Date(equipment.lastMaintenanceDate);
        next.setDate(next.getDate() + equipment.maintenanceIntervalDays);
        equipment.nextMaintenanceDate = next;
      }
      await equipment.save();
      res.json(equipment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Totem / Kiosk: Patient self-check-in ---
  totemArrival: async (req, res) => {
    try {
      const { id } = req.params;
      const { consentSignature } = req.body;
      const order = await RisOrder.findById(id);
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

      order.status = 'ARRIVED';
      order.arrivedAt = new Date();
      if (consentSignature) {
        order.consentSignature = consentSignature;
        order.consentSignedAt = new Date();
      }
      await order.save();
      res.json(order);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // --- Teaching File: Toggle report/order for docencia ---
  toggleTeachingFile: async (req, res) => {
    try {
      const { id } = req.params;
      const { isTeachingFile, teachingKeywords, teachingNotes } = req.body;
      const report = await RisReport.findById(id);
      if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

      report.isTeachingFile = isTeachingFile !== undefined ? isTeachingFile : !report.isTeachingFile;
      if (teachingKeywords) report.teachingKeywords = teachingKeywords;
      if (teachingNotes !== undefined) report.teachingNotes = teachingNotes;
      await report.save();
      res.json(report);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  getTeachingFiles: async (req, res) => {
    try {
      const reports = await RisReport.find({ isTeachingFile: true })
        .populate({ path: 'order', populate: { path: 'patient' } })
        .sort({ createdAt: -1 });
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // --- Teleradiology: Radiologist workload for load-balancing ---
  getRadiologistWorkload: async (req, res) => {
    try {
      const User = require('../models/user.model');
      // Get all medical users (radiólogos and dictation room doctors)
      const radiologists = await User.find({
        $or: [
          { role: 'radiologia' },
          { role: 'radiologiaTecnico' },
          { role: 'radiologiaInterno' },
          { role: 'sala de dictados rayos x' },
          { role: 'sala de dictados tomografia' },
          { role: 'medico general' },
          { role: 'medicoExterno' },
        ]
      }).lean();

      // Count pending/active reports per radiologist
      const workload = await Promise.all(
        radiologists.map(async (r) => {
          const pendingReports = await RisReport.countDocuments({
            radiologist: r.nombre,
            status: 'DRAFT',
          });
          const signedToday = await RisReport.countDocuments({
            radiologist: r.nombre,
            status: 'SIGNED',
            signedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          });
          const totalSigned = await RisReport.countDocuments({
            radiologist: r.nombre,
            status: 'SIGNED',
          });
          return {
            _id: r._id,
            nombre: r.nombre,
            role: r.role,
            pendingReports,
            signedToday,
            totalSigned,
          };
        })
      );
      res.json(workload.sort((a, b) => a.pendingReports - b.pendingReports));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // --- Empresas / Empleadores ---
  seedCompanies: async (req, res) => {
    try {
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
          created++;
        }
      }

      res.json({ message: `Migración completada. Se insertaron ${created} empresas por defecto.` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  getCompanies: async (req, res) => {
    try {
      const companies = await RisCompany.find().sort({ name: 1 });
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  createCompany: async (req, res) => {
    try {
      const company = new RisCompany(req.body);
      await company.save();
      res.status(201).json(company);
    } catch (error) {
      if (error.code === 11000)
        return res.status(400).json({ error: 'Ya existe una empresa con ese nombre' });
      res.status(400).json({ error: error.message });
    }
  },
  updateCompany: async (req, res) => {
    try {
      const { id } = req.params;
      const company = await RisCompany.findByIdAndUpdate(id, req.body, { new: true });
      if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
      res.json(company);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  deleteCompany: async (req, res) => {
    try {
      const { id } = req.params;
      const company = await RisCompany.findByIdAndDelete(id);
      if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
      res.json({ message: 'Empresa eliminada correctamente' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = risController;
