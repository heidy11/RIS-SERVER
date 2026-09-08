/**
 * Endpoints de operacion del RIS-PACS Adapter.
 *
 * Corresponden al contrato de la seccion 6.2 del documento, adaptado: como el
 * adapter vive dentro del RIS, no hacen falta los endpoints de alta/baja de
 * ordenes (eso ya lo hace /api/ris/orders). Lo que si hace falta es todo lo
 * que el equipo de soporte necesita para diagnosticar por que un paciente no
 * aparecio en la consola del equipo.
 */

const RisOrder = require('../models/RisOrder');
const MwlOutbox = require('../models/MwlOutbox');
const MwlAuditLog = require('../models/MwlAuditLog');
const config = require('../services/mwl/mwl.config');
const client = require('../services/mwl/dcm4chee.client');
const worker = require('../services/mwl/mwlSync.worker');
const outbox = require('../services/mwl/mwlOutbox.service');
const mpps = require('../services/mwl/mppsSync.service');
const echo = require('../services/mwl/dicomEcho.service');
const Equipment = require('../models/equipment.model');
const { mapOrderToMwl } = require('../services/mwl/dicomMwl.mapper');

const mwlController = {
  /**
   * GET /api/mwl/health
   * Estado del adapter: conectividad con DCM4CHEE, tamano de la cola y
   * metricas del worker. Devuelve 503 si el archivo no responde, para que un
   * monitor externo lo detecte sin leer el cuerpo.
   */
  health: async (req, res) => {
    try {
      const [archive, pending, errored] = await Promise.all([
        client.healthCheck(),
        MwlOutbox.countDocuments({ status: 'PENDING' }),
        MwlOutbox.countDocuments({ status: 'ERROR' }),
      ]);

      const body = {
        enabled: config.enabled,
        archive,
        queue: { pending, error: errored },
        worker: worker.stats,
        mpps: { enabled: config.mppsEnabled, ...mpps.stats },
        stationAet: config.stationAet,
      };

      res.status(archive.ok ? 200 : 503).json(body);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/mwl/orders/:accessionNumber/status
   * Estado de sincronizacion de una orden concreta, con el ultimo error y el
   * historial de intentos.
   */
  orderStatus: async (req, res) => {
    try {
      const { accessionNumber } = req.params;
      const order = await RisOrder.findOne({ accessionNumber }).select(
        'accessionNumber modality stationAet scheduledDate status studyInstanceUid mwlSyncStatus mwlSyncedAt mwlLastError'
      );
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

      const [entries, audit] = await Promise.all([
        MwlOutbox.find({ order: order._id }).sort({ createdAt: -1 }).limit(10),
        MwlAuditLog.find({ accessionNumber }).sort({ occurredAt: -1 }).limit(20),
      ]);

      res.json({
        accessionNumber: order.accessionNumber,
        modality: order.modality,
        stationAet: config.resolveStationAet(order),
        scheduledDate: order.scheduledDate,
        orderStatus: order.status,
        studyInstanceUid: order.studyInstanceUid,
        mwlSyncStatus: order.mwlSyncStatus,
        mwlSyncedAt: order.mwlSyncedAt,
        lastError: order.mwlLastError || null,
        attempts: entries.length ? entries[0].attempts : 0,
        outbox: entries,
        audit,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/mwl/orders/:accessionNumber/retry
   * Reintento manual, para cuando soporte ya corrigio la causa (un AE Title
   * mal configurado, el PACS que volvio) y no quiere esperar al proximo ciclo.
   */
  retry: async (req, res) => {
    try {
      const result = await outbox.retryOrder(req.params.accessionNumber);
      if (!result.found) return res.status(404).json({ error: 'Orden no encontrada' });
      if (!result.queued) {
        return res.status(409).json({
          error: 'No se pudo encolar. Revisar GET /api/mwl/orders/:accessionNumber/status',
        });
      }
      res.status(202).json({ accessionNumber: req.params.accessionNumber, queued: result.operation });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/mwl/preview/:accessionNumber
   * Devuelve el DICOM JSON exacto que se le enviaria a DCM4CHEE, sin enviarlo.
   *
   * Es la herramienta mas util para depurar el caso clasico: la orden dice
   * SYNCED pero el equipo no la ve. Permite comparar tag por tag contra el
   * DICOM Conformance Statement del equipo antes de tocar nada.
   */
  preview: async (req, res) => {
    try {
      const order = await RisOrder.findOne({
        accessionNumber: req.params.accessionNumber,
      }).populate('patient');
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

      const mapped = mapOrderToMwl(order);
      res.json({
        target: `${config.rsBase}/mwlitems`,
        contentType: 'application/dicom+json',
        studyInstanceUid: mapped.studyInstanceUid,
        spsId: mapped.spsId,
        dataset: mapped.dataset,
      });
    } catch (error) {
      // Un mapeo invalido es un 422: la orden existe pero le falta informacion.
      res.status(422).json({ error: error.message });
    }
  },

  /**
   * GET /api/mwl/worklist
   * Lo que DCM4CHEE tiene realmente en la worklist ahora mismo. Es la vista
   * "desde el lado del equipo": si algo no sale aca, tampoco sale en la consola.
   */
  worklist: async (req, res) => {
    try {
      const params = {};
      if (req.query.modality) params['00400100.00080060'] = req.query.modality;
      if (req.query.aet) params['00400100.00400001'] = req.query.aet;
      if (req.query.date) params['00400100.00400002'] = req.query.date;

      const items = await client.searchMwlItems(params, parseInt(req.query.limit || '100', 10));
      res.json({ count: items.length, items });
    } catch (error) {
      res.status(502).json({ error: `DCM4CHEE no respondio: ${error.message}` });
    }
  },

  /**
   * POST /api/mwl/reconcile
   * Dispara la reconciliacion a mano en vez de esperar al cron.
   */
  reconcile: async (req, res) => {
    try {
      const result = await worker.runReconciliation();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/mwl/mpps/sync
   * Consulta ya mismo el estado que reportaron los equipos, sin esperar al
   * proximo ciclo. Util en la puesta en marcha y para soporte.
   */
  syncMpps: async (req, res) => {
    try {
      const result = await mpps.sincronizarEstados();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/mwl/mpps
   * Lo que el PACS tiene registrado sobre estudios iniciados y terminados.
   * Es la vista cruda, para diagnosticar por que una orden no cambio de estado.
   */
  listMpps: async (req, res) => {
    try {
      const items = await client.searchMpps({}, parseInt(req.query.limit || '100', 10));
      res.json({
        count: items.length,
        items: items.map(item => {
          const ref = mpps.referenciasDeLaOrden(item);
          return {
            accessionNumber: ref.accessionNumber,
            studyInstanceUid: ref.studyInstanceUid,
            mppsStatus:
              item['00400252'] && item['00400252'].Value ? item['00400252'].Value[0] : null,
            modality: item['00080060'] && item['00080060'].Value ? item['00080060'].Value[0] : null,
          };
        }),
      });
    } catch (error) {
      res.status(502).json({ error: `DCM4CHEE no respondio: ${error.message}` });
    }
  },

  /**
   * POST /api/mwl/equipment/:id/echo
   * Verifica por DICOM si el equipo responde (C-ECHO).
   *
   * Es el primer paso de la puesta en marcha de cada equipo: antes de pelearse
   * con la worklist hay que saber si el equipo contesta y si acepta el AE Title
   * con el que el RIS se presenta.
   */
  echoEquipment: async (req, res) => {
    try {
      const equipo = await Equipment.findById(req.params.id);
      if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' });

      const resultado = await echo.probarEquipo(equipo);
      // Siempre 200: que el equipo este apagado es una respuesta valida del
      // diagnostico, no un fallo de la peticion.
      res.json(resultado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * POST /api/mwl/equipment/echo-all
   * Prueba todos los equipos activos de una vez, mas el propio PACS.
   * Pensado para la puesta en marcha: una pasada y se ve quien contesta.
   */
  echoAll: async (req, res) => {
    try {
      const equipos = await Equipment.find({ status: true });
      // En serie y no en paralelo: abrir una asociacion DICOM contra varios
      // equipos a la vez confunde el diagnostico si la red es el problema.
      const resultados = [];
      for (const equipo of equipos) {
        resultados.push(await echo.probarEquipo(equipo));
      }

      res.json({
        callingAet: echo.CALLING_AET,
        pacs: await echo.probarPacs(),
        equipos: resultados,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/mwl/outbox?status=ERROR
   * Cola de sincronizacion, para el panel de soporte.
   */
  listOutbox: async (req, res) => {
    try {
      const query = {};
      if (req.query.status) query.status = req.query.status.toUpperCase();
      const entries = await MwlOutbox.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(req.query.limit || '100', 10));
      res.json({ count: entries.length, entries });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = mwlController;
