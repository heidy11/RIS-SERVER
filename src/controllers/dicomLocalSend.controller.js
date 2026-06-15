const { Client, requests, constants } = require('dcmjs-dimse');
const { CFindRequest, CEchoRequest, CStoreRequest } = requests;
const { Status } = constants;

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

class DicomLocalSendController {
  // Estado de sincronización para UI
  _syncState = {
    isSyncing: false,
    lastSyncTime: null,
    nextSyncTime: null,
  };

  // ──────────────────────────────────────────────
  // CONFIGURACIONES
  // ──────────────────────────────────────────────

  _getLocalConfig() {
    return {
      host: (process.env.HOST_DICOM_LOCAL || '').trim(),
      port: parseInt(process.env.PORT_DICOM_LOCAL || '11112'),
      calledAET: (process.env.CALLED_AET_DICOM_LOCAL || '').trim(),
      callingAET: (process.env.CALLING_AET_DICOM_LOCAL || 'MYAPP').trim(),
    };
  }

  _getExternalConfig() {
    return {
      host: (process.env.HOST_DICOM_EXTERNO || '').trim(),
      port: parseInt(process.env.PORT_DICOM_EXTERNO || '11112'),
      calledAET: (process.env.CALLED_AET_DICOM_EXTERNO || '').trim(),
      callingAET: (process.env.CALLING_AET_DICOM_EXTERNO || 'MYAPP').trim(),
    };
  }

  /**
   * URL base de la REST API de dcm4chee (WADO-RS / QIDO-RS)
   */
  _getWadoBase() {
    const { host, calledAET } = this._getLocalConfig();
    const httpPort = (process.env.PORT_WADO_LOCAL || '8080').trim();
    return `http://${host}:${httpPort}/dcm4chee-arc/aets/${calledAET}/rs`;
  }

  /**
   * URL base para WADO-URI (classic)
   */
  _getWadoUriBase() {
    const { host, calledAET } = this._getLocalConfig();
    const httpPort = (process.env.PORT_WADO_LOCAL || '8080').trim();
    return `http://${host}:${httpPort}/dcm4chee-arc/aets/${calledAET}/wado`;
  }

  // ──────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ──────────────────────────────────────────────

  /**
   * C-FIND DIMSE contra el PACS local
   */
  async _cfind(request, timeoutMs = 30000, config = null) {
    const { host, port, callingAET, calledAET } = config || this._getLocalConfig();
    return new Promise((resolve, reject) => {
      const client = new Client();
      const results = [];
      let done = false;

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          try {
            client.abort();
          } catch (_) {}
          reject(new Error('C-FIND timeout'));
        }
      }, timeoutMs);

      request.on('response', response => {
        const status = response.getStatus();
        if (status === Status.Pending && response.hasDataset()) {
          results.push(response.getDataset());
        } else if (status === Status.Success) {
          clearTimeout(timer);
          if (!done) {
            done = true;
            resolve(results);
          }
        }
      });

      client.on('networkError', err => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(err);
        }
      });
      client.on('associationRejected', () => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(new Error(`Asociación rechazada por ${calledAET}`));
        }
      });
      client.on('close', () => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          resolve(results);
        }
      });

      client.addRequest(request);
      client.send(host, port, callingAET, calledAET);
    });
  }

  /**
   * Descarga instancias de una serie individualmente vía QIDO-RS (para lista) + WADO-URI (para descarga)
   * WADO-URI devuelve el DICOM binario puro, evitando problemas de parsing multipart
   * Retorna array de rutas de archivos temporales
   */
  async _downloadSeries(studyUID, seriesUID) {
    const rsBase = this._getWadoBase();
    const wadoUriBase = this._getWadoUriBase();

    // QIDO-RS: obtener lista de SOP Instance UIDs de la serie
    const qidoUrl = `${rsBase}/studies/${studyUID}/series/${seriesUID}/instances?limit=10000`;
    const qidoResp = await axios.get(qidoUrl, {
      timeout: 30000,
      headers: { Accept: 'application/dicom+json' },
    });

    const instances = qidoResp.data;
    if (!Array.isArray(instances) || instances.length === 0) return [];

    const files = [];

    for (const instance of instances) {
      const sopUID = instance['00080018']?.Value?.[0]; // SOP Instance UID (tag 0008,0018)
      if (!sopUID) continue;

      // WADO-URI (classic): descarga directa de la instancia binaria
      const url = `${wadoUriBase}?requestType=WADO&studyUID=${studyUID}&seriesUID=${seriesUID}&objectUID=${sopUID}&contentType=application/dicom`;
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const filePath = path.join(TEMP_DIR, `${uuidv4()}.dcm`);
      fs.writeFileSync(filePath, Buffer.from(resp.data));
      files.push(filePath);
    }

    return files;
  }

  /**
   * Cuenta cuántas instancias tiene un estudio en un PACS según su config
   */
  async _countInstances(studyUID, config) {
    let count = 0;
    try {
      const seriesList = await this._cfind(
        CFindRequest.createSeriesFindRequest({ StudyInstanceUID: studyUID, SeriesInstanceUID: '' }),
        30000,
        config
      );

      for (const series of seriesList) {
        const seriesUID = series.SeriesInstanceUID;
        if (!seriesUID) continue;

        const instances = await this._cfind(
          CFindRequest.createImageFindRequest({
            StudyInstanceUID: studyUID,
            SeriesInstanceUID: seriesUID,
            SOPInstanceUID: '',
          }),
          30000,
          config
        );
        count += instances.length;
      }
      return count;
    } catch (err) {
      console.error(`❌ Error contando instancias (${studyUID}):`, err.message);
      return -1;
    }
  }

  /**
   * C-STORE DIMSE: envía archivos .dcm al PACS externo
   */
  async _cstore(filePaths, timeoutMs = 300000) {
    const { host, port, callingAET, calledAET } = this._getExternalConfig();

    return new Promise((resolve, reject) => {
      const client = new Client();
      let stored = 0;
      let processed = 0;
      let done = false;

      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          try {
            client.abort();
          } catch (_) {}
          reject(
            new Error(
              `C-STORE timeout en ${calledAET} (${host}:${port}) después de ${timeoutMs / 1000}s`
            )
          );
        }
      }, timeoutMs);

      const checkDone = finalStored => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(finalStored);
        }
      };

      client.on('associationAccepted', res => {
        const msg = `✅ Asociación aceptada por ${calledAET}. Enviando ${filePaths.length} instancias...\n`;
        console.log(msg);
        fs.appendFileSync('/tmp/dicom_debug.log', msg);
      });

      client.on('networkError', err => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(new Error(`Error de red en C-STORE: ${err.message}`));
        }
      });

      client.on('associationRejected', () => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(new Error(`C-STORE rechazado por AET: ${calledAET}`));
        }
      });

      // Fallback
      client.on('close', () => checkDone(stored));
      client.on('associationClosed', () => checkDone(stored));

      try {
        let added = 0;
        for (const filePath of filePaths) {
          if (fs.existsSync(filePath)) {
            const request = new CStoreRequest(filePath);

            // Adjuntamos el listener directamente al request
            request.on('response', rsp => {
              processed++;
              const status = rsp.getStatus();
              if (status === Status.Success) {
                stored++;
              } else {
                const msg = `⚠️ C-STORE respondió con status: 0x${status.toString(16)}\n`;
                console.warn(msg);
                fs.appendFileSync('/tmp/dicom_debug.log', msg);
              }

              if (processed === filePaths.length) {
                fs.appendFileSync(
                  '/tmp/dicom_debug.log',
                  `Todos los requests respondidos: ${stored}/${filePaths.length} OK\n`
                );
                checkDone(stored);
              }
            });

            client.addRequest(request);
            added++;
          } else {
            console.warn(`❓ Archivo no encontrado para C-STORE: ${filePath}`);
          }
        }

        if (added === 0) {
          checkDone(0);
          return;
        }

        client.send(host, port, callingAET, calledAET);
      } catch (err) {
        clearTimeout(timer);
        if (!done) {
          done = true;
          reject(err);
        }
      }
    });
  }

  /**
   * Lógica compartida para transferir un estudio completo de local a externo
   */
  async _transferStudyInternal(studyUID) {
    const tempFiles = [];
    const results = [];
    try {
      const seriesDatasets = await this._cfind(
        CFindRequest.createSeriesFindRequest({ StudyInstanceUID: studyUID, SeriesInstanceUID: '' })
      );
      const seriesUIDs = seriesDatasets
        .map(ds => ds.getElements().SeriesInstanceUID)
        .filter(Boolean);

      for (const seriesUID of seriesUIDs) {
        const seriesFiles = await this._downloadSeries(studyUID, seriesUID);
        tempFiles.push(...seriesFiles);

        if (seriesFiles.length === 0) {
          results.push({ SeriesInstanceUID: seriesUID, status: 'SKIP', message: '0 instancias' });
          continue;
        }

        const stored = await this._cstore(seriesFiles);
        results.push({
          SeriesInstanceUID: seriesUID,
          status: stored === seriesFiles.length ? 'OK' : 'PARTIAL',
          downloaded: seriesFiles.length,
          stored,
        });

        // Limpieza inmediata por serie para ahorrar espacio
        for (const f of seriesFiles) {
          try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
          } catch (_) {}
        }
      }
      return results;
    } catch (err) {
      throw err;
    } finally {
      // Limpieza de seguridad
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (_) {}
      }
    }
  }

  // ──────────────────────────────────────────────
  // ENDPOINTS
  // ──────────────────────────────────────────────

  /**
   * GET /api/dicom/local-studies
   */
  getStudies = async (req, res) => {
    console.log('🔍 Consultando estudios en PACS Local...');
    try {
      const studyDatasets = await this._cfind(
        CFindRequest.createStudyFindRequest({
          PatientID: '',
          PatientName: '',
          StudyInstanceUID: '',
          StudyDate: '',
          StudyDescription: '',
          ModalitiesInStudy: '',
          NumberOfStudyRelatedInstances: '',
          NumberOfStudyRelatedSeries: '',
        })
      );

      // OPTIMIZACIÓN: Si son más de 100, no hacer C-FIND iterativo por estudio (o hacerlo todo en uno)
      let seriesByStudy = {};
      try {
        const allSeriesDatasets = await this._cfind(
          CFindRequest.createSeriesFindRequest({
            StudyInstanceUID: '', // Trae todas las series de todos los estudios listados (o en la BD)
            SeriesInstanceUID: '',
            Modality: '',
            SeriesDescription: '',
            SeriesNumber: '',
          })
        );
        for (const sds of allSeriesDatasets) {
          const sel = sds.getElements();
          const suid = sel.StudyInstanceUID;
          if (!suid) continue;
          if (!seriesByStudy[suid]) seriesByStudy[suid] = [];

          seriesByStudy[suid].push({
            SeriesInstanceUID: sel.SeriesInstanceUID || 'N/A',
            Modality: sel.Modality || 'N/A',
            SeriesDescription: sel.SeriesDescription || 'N/A',
            SeriesNumber: sel.SeriesNumber?.toString() || 'N/A',
          });
        }
      } catch (err) {
        console.warn('⚠️ No se pudieron precargar las series globalmente:', err.message);
      }

      const studies = studyDatasets.map(ds => {
        const el = ds.getElements();

        let patientName = 'N/A';
        if (Array.isArray(el.PatientName) && el.PatientName.length > 0) {
          patientName = el.PatientName[0].Alphabetic || String(el.PatientName[0]);
        } else if (typeof el.PatientName === 'string') {
          patientName = el.PatientName;
        }

        const studyInstanceUID = el.StudyInstanceUID || '';

        return {
          PatientID: el.PatientID || 'N/A',
          PatientName: patientName,
          StudyInstanceUID: studyInstanceUID || 'N/A',
          StudyDate: el.StudyDate || 'N/A',
          StudyDescription: el.StudyDescription || 'N/A',
          Modalities: el.ModalitiesInStudy || 'N/A',
          Instances: el.NumberOfStudyRelatedInstances?.toString() || '0',
          Series: seriesByStudy[studyInstanceUID] || [], // Asignación instantánea
        };
      });

      return res.status(200).json({ success: true, total: studies.length, studies });
    } catch (error) {
      console.error('❌ Error getStudies:', error.message);
      return res.status(500).json({ error: 'Error al obtener estudios', message: error.message });
    }
  };

  /**
   * POST /api/dicom/transfer-study
   * QIDO-RS + WADO-RS (descarga) → C-STORE (envío al PACS externo)
   * Body: { studyInstanceUID? }
   */
  transferStudy = async (req, res) => {
    const extConfig = this._getExternalConfig();
    if (!extConfig.host || !extConfig.calledAET) {
      return res.status(500).json({ error: 'Configuración DICOM externo incompleta (.env)' });
    }

    const { studyInstanceUID } = req.body || {};
    const dest = `${extConfig.host}:${extConfig.port} (${extConfig.calledAET})`;
    console.log(`🚀 Transfiriendo al PACS externo ${dest}...`);

    try {
      let studyUIDs = [];
      const startTime = Date.now();

      if (studyInstanceUID) {
        studyUIDs = [studyInstanceUID];
      } else {
        const studyDatasets = await this._cfind(
          CFindRequest.createStudyFindRequest({ StudyInstanceUID: '' })
        );
        studyUIDs = studyDatasets.map(ds => ds.getElements().StudyInstanceUID).filter(Boolean);
      }

      console.log(`📋 Estudios a transferir: ${studyUIDs.length}`);
      const transferResults = [];

      for (const uid of studyUIDs) {
        // Comparar conteos para decidir si transferir (evita duplicados)
        const localCount = await this._countInstances(uid, this._getLocalConfig());
        const remoteCount = await this._countInstances(uid, extConfig);

        if (localCount > 0 && remoteCount === localCount) {
          console.log(`⏭ Estudio ${uid}: Sincronizado (${localCount} imgs). Omitiendo.`);
          transferResults.push({
            StudyInstanceUID: uid,
            status: 'SKIPPED',
            message: 'Ya sincronizado',
          });
          continue;
        }

        console.log(`  📂 Procesando estudio ${uid}...`);
        const series = await this._transferStudyInternal(uid);
        transferResults.push({ StudyInstanceUID: uid, series });
      }

      const totalSeries = transferResults.reduce((s, r) => s + r.series.length, 0);
      const okSeries = transferResults.reduce(
        (s, r) => s + r.series.filter(x => x.status === 'OK' || x.status === 'SKIPPED').length,
        0
      );

      const durationMs = Date.now() - startTime;
      const durationSec = (durationMs / 1000).toFixed(2);

      return res.status(200).json({
        success: true,
        destination: dest,
        timeTaken: `${durationSec}s`, // Tiempo que tardó la operación
        totalStudies: transferResults.length,
        totalSeries,
        okSeries,
        failedSeries: totalSeries - okSeries,
        results: transferResults,
      });
    } catch (error) {
      console.error('❌ Error transferStudy:', error.message);
      return res
        .status(500)
        .json({ error: 'Error en transferencia DICOM', message: error.message });
    }
  };

  /**
   * Sincronización automática periódica
   */
  syncStudies = async () => {
    this._syncState.isSyncing = true;
    console.log('🔄 Iniciando sincronización automática DICOM robusta...');
    const extConfig = this._getExternalConfig();
    if (!extConfig.host || !extConfig.calledAET) {
      console.warn('⚠️ Sincronización cancelada: Configuración externa incompleta.');
      this._syncState.isSyncing = false;
      return;
    }

    // Filtro de 3 días (o según env)
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 3);

    const fmt = d => d.toISOString().split('T')[0].replace(/-/g, '');
    const dateRange = `${fmt(past)}-${fmt(today)}`;
    console.log(`📅 Rango de búsqueda: ${dateRange}`);

    try {
      const studyDatasets = await this._cfind(
        CFindRequest.createStudyFindRequest({ StudyInstanceUID: '', StudyDate: dateRange })
      );
      const studyUIDs = studyDatasets.map(ds => ds.getElements().StudyInstanceUID).filter(Boolean);

      console.log(`📋 Estudios recientes encontrados: ${studyUIDs.length}`);

      for (const uid of studyUIDs) {
        // Comparar conteos para decidir si transferir
        const localCount = await this._countInstances(uid, this._getLocalConfig());
        const remoteCount = await this._countInstances(uid, extConfig);

        if (localCount > 0 && remoteCount === localCount) {
          console.log(`⏭ Estudio ${uid}: Sincronizado (${localCount} imgs).`);
          continue;
        }

        console.log(
          `📥 Estudio ${uid}: Desactualizado (Local: ${localCount}, Remoto: ${remoteCount}). Sincronizando...`
        );
        await this._transferStudyInternal(uid);
      }
      console.log('✅ Sincronización finalizada.');
    } catch (err) {
      console.error('❌ Error en syncStudies:', err.message);
    } finally {
      this._syncState.isSyncing = false;
      this._syncState.lastSyncTime = Date.now();
    }
  };

  /**
   * Obtener el estado actual de la sincronización
   */
  getSyncStatus = (req, res) => {
    return res.status(200).json(this._syncState);
  };

  /**
   * GET /api/dicom/ping-local
   */
  pingPacs = async (req, res) => {
    const { host, port, callingAET, calledAET } = this._getLocalConfig();
    console.log('📡 Enviando C-ECHO al PACS Local...');

    try {
      await new Promise((resolve, reject) => {
        const client = new Client();
        const request = new CEchoRequest();
        let done = false;

        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            try {
              client.abort();
            } catch (_) {}
            reject(new Error('C-ECHO timeout (10s)'));
          }
        }, 10000);

        request.on('response', response => {
          clearTimeout(timer);
          if (!done) {
            done = true;
            response.getStatus() === Status.Success
              ? resolve()
              : reject(new Error(`C-ECHO error: 0x${response.getStatus().toString(16)}`));
          }
        });

        client.on('networkError', err => {
          clearTimeout(timer);
          if (!done) {
            done = true;
            reject(err);
          }
        });
        client.on('associationRejected', () => {
          clearTimeout(timer);
          if (!done) {
            done = true;
            reject(new Error(`Asociación rechazada por ${calledAET}`));
          }
        });
        client.on('close', () => {
          clearTimeout(timer);
          if (!done) {
            done = true;
            resolve();
          }
        });

        client.addRequest(request);
        client.send(host, port, callingAET, calledAET);
      });

      return res
        .status(200)
        .json({ success: true, message: 'PACS local responde correctamente (C-ECHO OK)' });
    } catch (error) {
      console.error('❌ Error C-ECHO:', error.message);
      return res
        .status(500)
        .json({ success: false, error: 'Fallo de conexión', message: error.message });
    }
  };
}

module.exports = new DicomLocalSendController();
