const axios = require('axios');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5, rejectUnauthorized: false });
const FindActivate = require('../models/findActivarteDicom.model.js');
const { Client, Transcoding, requests, Dataset, constants } = require('dcmjs-dimse');
const { v4: uuidv4 } = require('uuid');
const { CStoreRequest, CEchoRequest, CFindRequest, NDeleteRequest } = requests;
const { TransferSyntax, Status, Priority } = constants;
const startLoginProcess = require('../utils/puppeteerLogin.js');

const TEMP_DIR = path.join(__dirname, '../temp');
const BATCH_SIZE = 5;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// exports.syncDicomStudies = async () => {
//   const host_local = process.env.HOST_DICOM_LOCAL;
//   const port_local = process.env.PORT_DICOM_LOCAL;
//   const calledAET_local = process.env.CALLED_AET_DICOM_LOCAL;
//   const callingAET_local = process.env.CALLING_AET_DICOM_LOCAL;

//   const host_externo = process.env.HOST_DICOM_EXTERNO;
//   const port_externo = process.env.PORT_DICOM_EXTERNO;
//   const calledAET_externo = process.env.CALLED_AET_DICOM_EXTERNO;
//   const callingAET_externo = process.env.CALLING_AET_DICOM_EXTERNO;

//   if (
//     !host_local ||
//     !port_local ||
//     !calledAET_local ||
//     !callingAET_local ||
//     !host_externo ||
//     !port_externo ||
//     !calledAET_externo ||
//     !callingAET_externo
//   ) {
//     throw new Error('Configuración incompleta: Faltan variables de entorno DICOM.');
//   }

//   console.log('🔄 Iniciando sincronización DICOM...');

//   // 1️⃣ C-ECHO: Verificar PACS local
//   console.log('📡 Verificando PACS local...');
//   const echoSuccess = await new Promise((resolve, reject) => {
//     const echoClient = new Client();
//     const echoRequest = new CEchoRequest();

//     const timeout = setTimeout(() => {
//       echoClient.abort();
//       reject(new Error('Timeout verificando PACS local'));
//     }, 5000);

//     echoRequest.on('response', response => {
//       clearTimeout(timeout);
//       if (response.getStatus() === Status.Success) {
//         console.log(' PACS local OK');
//         resolve(true);
//       } else {
//         reject(new Error('PACS local no respondió'));
//       }
//     });

//     echoClient.on('networkError', err => {
//       clearTimeout(timeout);
//       reject(err);
//     });

//     echoClient.addRequest(echoRequest);
//     echoClient.send(
//       host_local.trim(),
//       parseInt(port_local),
//       callingAET_local.trim(),
//       calledAET_local.trim()
//     );
//   });

//   if (!echoSuccess) {
//     throw new Error('PACS local no disponible');
//   }

//   // 2️⃣ C-FIND: Busca todos los estudios
//   console.log('🔍 Buscando estudios...');
//   const studies = await new Promise((resolve, reject) => {
//     const findClient = new Client();
//     const findRequest = CFindRequest.createStudyFindRequest({
//       PatientID: '',
//       PatientName: '',
//       StudyInstanceUID: '',
//     });

//     const allStudies = [];
//     let isCompleted = false;

//     const timeout = setTimeout(() => {
//       if (!isCompleted) {
//         findClient.abort();
//         reject(new Error('Timeout buscando estudios'));
//       }
//     }, 30000);

//     findRequest.on('response', response => {
//       if (response.getStatus() === Status.Pending && response.hasDataset()) {
//         const dataset = response.getDataset();
//         allStudies.push(dataset);
//         console.log(`📋 Estudio: ${dataset.StudyInstanceUID || 'N/A'}`);
//       } else if (response.getStatus() === Status.Success) {
//         clearTimeout(timeout);
//         isCompleted = true;
//         console.log(` ${allStudies.length} estudios encontrados`);
//         resolve(allStudies);
//       }
//     });

//     findClient.on('networkError', err => {
//       clearTimeout(timeout);
//       if (!isCompleted) reject(err);
//     });

//     findClient.addRequest(findRequest);
//     findClient.send(
//       host_local.trim(),
//       parseInt(port_local),
//       callingAET_local.trim(),
//       calledAET_local.trim()
//     );
//   });

//   if (studies.length === 0) {
//     return {
//       success: true,
//       data: {
//         message: 'No hay estudios en PACS local',
//         total: 0,
//       },
//     };
//   }

//   return {
//     success: true,
//     data: {
//       message: 'Estudios encontrados en PACS local',
//       total: studies.length,
//       studies: studies.map(s => ({
//         PatientID: s.PatientID || 'N/A',
//         PatientName: s.PatientName || 'N/A',
//         StudyInstanceUID: s.StudyInstanceUID || 'N/A',
//         StudyDate: s.StudyDate || 'N/A',
//         StudyDescription: s.StudyDescription || 'N/A',
//         Modality: s.Modality || 'N/A',
//       })),
//       config: {
//         pacs_local: { host: host_local, port: port_local, aet: calledAET_local },
//         pacs_externo: { host: host_externo, port: port_externo, aet: calledAET_externo },
//       },
//       note: 'Para transferir archivos al PACS externo necesitas C-MOVE + SCP o DICOMweb',
//     },
//   };
// };

exports.viewFilesDicomInternal = async (req, res) => {
  try {
    const result = await exports.syncDicomStudies();
    if (result.data.total === 0 && result.data.message.includes('No hay estudios')) {
      return res.status(404).json(result.data);
    }
    return res.status(200).json(result.data);
  } catch (err) {
    console.error('❌ Error:', err);
    const status = err.message === 'PACS local no disponible' ? 503 : 500;
    return res.status(status).json({
      error: 'Error en sincronización DICOM',
      message: err.message,
    });
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Internal function to transfer DICOM files from URLs to a target PACS
 * Reuses logic from uploadDicomFiles
 */
const transferDicomFromUrls = async (dicomFiles, config) => {
  const { host, port, calledAET, callingAET } = config;
  const results = [];

  try {
    await Transcoding.initializeAsync();

    console.log(`🚀 Iniciando transferencia concurrente de ${dicomFiles.length} archivos...`);

    // Helper: Enviar un solo archivo
    const sendSingleFile = filePath => {
      return new Promise((resolve, reject) => {
        const client = new Client();
        let status = null;
        let sopInstanceUID = null;
        let isCompleted = false;

        const timeout = setTimeout(() => {
          if (!isCompleted) {
            isCompleted = true;
            try {
              client.abort();
            } catch (e) {}
            reject(new Error('Timeout de C-STORE (Sin respuesta del PACS en 30s)'));
          }
        }, 30000);

        client.on('cStoreResponse', rsp => {
          status = rsp.getStatus();
          sopInstanceUID = rsp.getSOPInstanceUID();
        });

        client.on('networkError', e => {
          clearTimeout(timeout);
          if (!isCompleted) {
            isCompleted = true;
            reject(e);
          }
        });

        client.on('abort', e => {
          clearTimeout(timeout);
          if (!isCompleted) {
            isCompleted = true;
            reject(e);
          }
        });

        client.on('close', () => {
          clearTimeout(timeout);
          if (!isCompleted) {
            isCompleted = true;
            if (status === Status.Success) {
              resolve({ sopInstanceUID, status });
            } else {
              reject(new Error(`C-STORE Failed or No Response. Status: ${status}`));
            }
          }
        });

        const req = new CStoreRequest(filePath, Priority.High);
        req.setAdditionalTransferSyntaxes([TransferSyntax.ExplicitVRLittleEndian]);
        client.addRequest(req);

        client.send(host.trim(), parseInt(port), callingAET.trim(), calledAET.trim());
      });
    };

    // Procesar en lotes concurrentes
    const concurrency = 2; // Enviar hasta 2 archivos a la vez para no saturar al PACS receptor
    for (let i = 0; i < dicomFiles.length; i += concurrency) {
      console.log(
        `🔄 Procesando lote ${Math.floor(i / concurrency) + 1} de ${Math.ceil(dicomFiles.length / concurrency)}...`
      );
      const batchUrls = dicomFiles.slice(i, i + concurrency);

      await Promise.all(
        batchUrls.map(async url => {
          let attempts = 0;
          let sent = false;
          const maxRetries = 2; // Reintentos por archivo

          while (attempts <= maxRetries && !sent) {
            attempts++;
            const tempFilePath = path.join(TEMP_DIR, `dicom_${uuidv4()}.dcm`);

            try {
              // 1. Descargar
              const response = await axios.get(url, {
                responseType: 'arraybuffer',
                httpAgent,
                httpsAgent,
                timeout: 20000,
              });
              fs.writeFileSync(tempFilePath, response.data);

              // 2. Enviar
              await sendSingleFile(tempFilePath);

              sent = true;
              results.push({ file: url, status: 'OK' });
            } catch (err) {
              console.error(`❌ Error (${attempts}/${maxRetries + 1}) con ${url}: ${err.message}`);
              if (attempts > maxRetries) {
                results.push({ file: url, status: 'ERROR', error: err.message });
              } else {
                await sleep(1000 * attempts); // Backoff simple
              }
            } finally {
              // 3. Limpieza inmediata
              if (fs.existsSync(tempFilePath)) {
                try {
                  fs.unlinkSync(tempFilePath);
                } catch (e) {}
              }
            }
          }
        })
      );
    }

    return {
      success: results.filter(r => r.status === 'OK').length,
      failed: results.filter(r => r.status === 'ERROR').length,
      results,
      message: 'Proceso finalizado',
    };
  } catch (err) {
    console.error('❌ Error critico en transferDicomFromUrls:', err);
    throw err;
  }
};

exports.syncDicomStudies = async () => {
  const host_local = process.env.HOST_DICOM_LOCAL;
  const port_local = process.env.PORT_DICOM_LOCAL;
  const calledAET_local = process.env.CALLED_AET_DICOM_LOCAL;
  const callingAET_local = process.env.CALLING_AET_DICOM_LOCAL;

  const host_externo = process.env.HOST_DICOM_EXTERNO;
  const port_externo = process.env.PORT_DICOM_EXTERNO;
  const calledAET_externo = process.env.CALLED_AET_DICOM_EXTERNO;
  const callingAET_externo = process.env.CALLING_AET_DICOM_EXTERNO;

  // WADO Config
  const wado_host = process.env.WADO_HOST || host_local;
  const wado_port = process.env.WADO_PORT || '8080';
  const wado_ae = process.env.WADO_AET || calledAET_local;
  const wadoBase = `http://${wado_host}:${wado_port}/dcm4chee-arc/aets/${wado_ae}/wado`;

  const localConfig = {
    host: host_local,
    port: port_local,
    calledAET: calledAET_local,
    callingAET: callingAET_local,
  };
  const externalConfig = {
    host: host_externo,
    port: port_externo,
    calledAET: calledAET_externo,
    callingAET: callingAET_externo,
  };

  if (
    !host_local ||
    !port_local ||
    !calledAET_local ||
    !callingAET_local ||
    !host_externo ||
    !port_externo ||
    !calledAET_externo ||
    !callingAET_externo
  ) {
    throw new Error('Configuración incompleta: Faltan variables de entorno DICOM.');
  }

  console.log('🔄 Iniciando sincronización DICOM...');

  // Helper C-FIND (Generic)
  const performCFind = async (request, description, config) => {
    // console.log(`🔍 Buscando ${description} en ${config.host}...`);
    return new Promise((resolve, reject) => {
      const client = new Client();
      const results = [];
      let isCompleted = false;
      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true; // Prevent race conditions
          try {
            client.abort();
          } catch (e) {
            // Ignore "Network has not been initialized" if already closed
            // console.warn('Safe abort error:', e.message);
          }
          reject(new Error(`Timeout buscando ${description}`));
        }
      }, 60000);

      request.on('response', response => {
        const status = response.getStatus();
        if (status === Status.Pending && response.hasDataset()) {
          results.push(response.getDataset());
        } else if (status === Status.Success) {
          clearTimeout(timeout);
          if (!isCompleted) {
            isCompleted = true;
            resolve(results);
          }
        } else if (status !== Status.Pending) {
          // Handle error/cancel statuses (e.g. 0xA900)
          clearTimeout(timeout);
          if (!isCompleted) {
            isCompleted = true;
            // console.warn(`C-FIND Status Error: 0x${status.toString(16)}`);
            // Resolve with what we have, or reject?
            // Failing hard might break the loop, let's resolve empty or partial if strictly needed.
            // But for sync, usually partial is okay, but 0xA900 means bad invalid query.
            // Let's safe-resolve to avoid crashing everything, but log it.
            console.error(`❌ C-FIND Error (0x${status.toString(16)}) buscando ${description}`);
            resolve(results);
          }
        }
      });

      client.on('networkError', err => {
        clearTimeout(timeout);
        if (!isCompleted) {
          isCompleted = true;
          reject(err);
        }
      });

      client.on('close', () => {
        // Connection closed cleanly
        clearTimeout(timeout);
        // If we haven't resolved yet (e.g. no success packet but closed), resolve with what we got
        if (!isCompleted) {
          isCompleted = true;
          resolve(results);
        }
      });

      client.addRequest(request);
      client.send(
        config.host.trim(),
        parseInt(config.port),
        config.callingAET.trim(),
        config.calledAET.trim()
      );
    });
  };

  // 1. Helper to count instances (Recursive Study->Series->Image)
  const countInstances = async (studyUID, config, descriptionLabel) => {
    let count = 0;
    try {
      const seriesList = await performCFind(
        CFindRequest.createSeriesFindRequest({
          StudyInstanceUID: studyUID,
          SeriesInstanceUID: '',
        }),
        `Series (${descriptionLabel})`,
        config
      );

      for (const series of seriesList) {
        const seriesUID =
          series.SeriesInstanceUID || (series.elements && series.elements.SeriesInstanceUID);
        if (!seriesUID) continue;

        const instanceList = await performCFind(
          CFindRequest.createImageFindRequest({
            StudyInstanceUID: studyUID,
            SeriesInstanceUID: seriesUID,
            SOPInstanceUID: '',
          }),
          `Imágenes (${descriptionLabel})`,
          config
        );
        count += instanceList.length;
      }
      return count;
    } catch (err) {
      console.error(`Error contando instancias ${descriptionLabel}:`, err.message);
      return -1; // Error signal
    }
  };

  // 2. Find Studies (Local) - Filter by Date (Last 3 days)
  const today = new Date();
  const pastDate = new Date();
  pastDate.setDate(today.getDate() - 3);

  const formatDate = date => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const dateRange = `${formatDate(pastDate)}-${formatDate(today)}`;
  console.log(`📅 Filtrando estudios desde ${formatDate(pastDate)} hasta ${formatDate(today)}`);

  const studies = await performCFind(
    CFindRequest.createStudyFindRequest({
      PatientID: '',
      PatientName: '',
      StudyInstanceUID: '',
      StudyDate: dateRange,
    }),
    'Estudios Locales',
    localConfig
  );

  if (studies.length === 0) {
    return { success: true, data: { message: 'No hay estudios en PACS local', total: 0 } };
  }

  // (Assuming performCFind handles console.log(results) cleanup if I touch it,
  // but let's focus on the Sync loop first which is where the crash/error logic is)

  // ... After finding studies ...

  console.log(` ${studies.length} Estudios encontrados. Verificando estado remoto...`);

  // 3. Drill down & Compare
  const allImageUrls = [];
  const studiesToSync = [];

  for (const study of studies) {
    // DEBUG: Inspect study object
    // console.log('Estudio encontrado:', JSON.stringify(study, null, 2));
    // Fix: Access UID from elements if nested
    const studyUID = study.StudyInstanceUID || (study.elements && study.elements.StudyInstanceUID);

    if (!studyUID) {
      console.warn('⚠️ Estudio sin StudyInstanceUID detectado. Saltando. Datos:', study);
      continue;
    }

    // A. Get Local Instances & build URLs
    const localUrls = [];
    try {
      const seriesList = await performCFind(
        CFindRequest.createSeriesFindRequest({
          StudyInstanceUID: studyUID,
          SeriesInstanceUID: '',
        }),
        `Series Local ${studyUID}`,
        localConfig
      );
      // ...

      for (const series of seriesList) {
        // Fix: Access UID from elements if nested
        const seriesUID =
          series.SeriesInstanceUID || (series.elements && series.elements.SeriesInstanceUID);
        if (!seriesUID) continue;

        const instanceList = await performCFind(
          CFindRequest.createImageFindRequest({
            StudyInstanceUID: studyUID,
            SeriesInstanceUID: seriesUID,
            SOPInstanceUID: '',
          }),
          `Imágenes Local ${seriesUID}`,
          localConfig
        );

        instanceList.forEach(instance => {
          // Fix: Access UID from elements if nested
          const sopUID =
            instance.SOPInstanceUID || (instance.elements && instance.elements.SOPInstanceUID);
          // WADO-URI Standard pattern:
          if (sopUID) {
            const url = `${wadoBase}?requestType=WADO&studyUID=${studyUID}&seriesUID=${seriesUID}&objectUID=${sopUID}&contentType=application/dicom`;
            localUrls.push(url);
          }
        });
      }
    } catch (err) {
      console.error(`Error procesando local ${studyUID}:`, err.message);
      continue;
    }

    const localCount = localUrls.length;
    if (localCount === 0) continue;

    // B. Get Remote Count
    // console.log(`🔎 Verificando estudio ${studyUID} en remoto...`);
    const remoteCount = await countInstances(studyUID, externalConfig, 'Remoto');

    // C. Compare
    if (remoteCount === localCount) {
      console.log(`⏭ Estudio ${studyUID}: Sincronizado (${localCount} imgs). Omitiendo.`);
    } else {
      console.log(
        `📥 Estudio ${studyUID}: Desactualizado (Local: ${localCount}, Remoto: ${remoteCount}). Agregando a cola.`
      );
      allImageUrls.push(...localUrls);
      studiesToSync.push({
        StudyInstanceUID: studyUID,
        LocalImages: localCount,
        RemoteImages: remoteCount,
        Status: 'Pending Transfer',
      });
    }
  }

  console.log(`📦 Total imágenes a transferir: ${allImageUrls.length}`);

  if (allImageUrls.length === 0) {
    return { success: true, data: { message: 'Todos los estudios están sincronizados', total: 0 } };
  }

  // Log Summary
  if (studiesToSync.length > 0) {
    console.log('\n=============================================');
    console.log('📋 RESUMEN DE ESTUDIOS A TRANSFERIR:');
    console.table(studiesToSync);
    console.log('=============================================\n');
  }

  // 4. Transfer Images
  console.log('🚀 Iniciando transferencia (Download -> C-STORE)...');

  const transferResult = await transferDicomFromUrls(allImageUrls, externalConfig);

  return {
    success: true,
    data: {
      message: 'Sincronización finalizada',
      studiesFound: studies.length,
      imagesTransferred: allImageUrls.length,
      transferDetails: transferResult,
    },
  };
};

exports.viewFilesDicomInternal = async (req, res) => {
  try {
    const result = await exports.syncDicomStudies();
    if (result.data.studiesFound === 0) {
      return res.status(404).json(result.data);
    }
    return res.status(200).json(result.data);
  } catch (err) {
    console.error('❌ Error:', err);
    return res.status(500).json({
      error: 'Error en sincronización DICOM',
      message: err.message,
    });
  }
};

// exports.uploadDicomFiles = async (req, res) => {
//   let dicomFiles = req.body.dicomFile || req.body.dicomFiles;
//   const { host, port, calledAET, callingAET } = req.body;

//   if (!dicomFiles || !host || !port || !calledAET || !callingAET) {
//     return res.status(400).json({ error: 'Parámetros requeridos faltantes.' });
//   }

//   if (typeof dicomFiles === 'string') dicomFiles = [dicomFiles];

//   try {
//     const result = await transferDicomFromUrls(dicomFiles, { host, port, calledAET, callingAET });
//     return res.status(200).json({
//       message: 'Envío DICOM finalizado',
//       total: dicomFiles.length,
//       success: result.success,
//       failed: result.failed,
//       results: result.results,
//     });
//   } catch (err) {
//     console.error('❌ Error general:', err);
//     return res.status(500).json({ error: 'Error inesperado en envío DICOM.' });
//   }
// };
exports.uploadDicomFiles = async (req, res) => {
  let dicomFiles = req.body.dicomFile || req.body.dicomFiles;
  const { host, port, calledAET, callingAET } = req.body;

  if (!dicomFiles || !host || !port || !calledAET || !callingAET) {
    return res.status(400).json({ error: 'Parámetros requeridos faltantes.' });
  }

  if (typeof dicomFiles === 'string') dicomFiles = [dicomFiles];

  const downloadedFiles = [];
  const results = [];

  try {
    await Transcoding.initializeAsync();

    // =============================
    // 1⃣ DESCARGA DICOM
    // =============================
    for (const url of dicomFiles) {
      try {
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          httpsAgent,
          timeout: 5000,
        });

        const filePath = path.join(TEMP_DIR, `dicom_${uuidv4()}.dcm`);
        fs.writeFileSync(filePath, response.data);

        downloadedFiles.push({ url, filePath, retries: 0 });
      } catch (err) {
        results.push({ file: url, status: 'ERROR', stage: 'download' });
      }
    }

    if (!downloadedFiles.length) {
      return res.status(400).json({ error: 'No se pudo descargar ningún DICOM.' });
    }

    // =============================
    // 2⃣ FUNCIÓN ENVÍO BATCH
    // =============================
    const sendBatch = files => {
      const batchResults = [];
      const client = new Client();
      return new Promise((resolve, reject) => {
        client.on('cStoreResponse', rsp => {
          batchResults.push({
            sopInstanceUID: rsp.getSOPInstanceUID(),
            status: rsp.getStatus(),
          });
        });

        client.on('networkError', reject);
        client.on('abort', reject);
        client.on('close', () => resolve(batchResults));
        files.forEach(f => {
          const req = new CStoreRequest(f.filePath, Priority.High); //  Ahora funciona
          req.setAdditionalTransferSyntaxes([TransferSyntax.ExplicitVRLittleEndian]);
          client.addRequest(req);
        });

        try {
          client.send(host.trim(), parseInt(port), callingAET.trim(), calledAET.trim());
        } catch (err) {
          reject(err);
        }
      });
    };

    // =============================
    // 3⃣ LOOP PRINCIPAL + REINTENTOS
    // =============================
    let pending = [...downloadedFiles];

    for (let attempt = 0; attempt <= MAX_RETRIES && pending.length; attempt++) {
      console.log(`🔁 Intento ${attempt + 1}`);

      const nextPending = [];

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const responses = await sendBatch(batch);

        const successUIDs = responses
          .filter(r => r.status === Status.Success)
          .map(r => r.sopInstanceUID);

        batch.forEach(file => {
          if (successUIDs.includes(file.sopInstanceUID)) {
            results.push({ file: file.url, status: 'OK' });
          } else {
            file.retries++;
            if (file.retries <= MAX_RETRIES) {
              nextPending.push(file);
            } else {
              results.push({ file: file.url, status: 'ERROR', stage: 'cstore' });
            }
          }
        });
      }

      pending = nextPending;
      if (pending.length) await sleep(RETRY_DELAY_MS);
    }

    // =============================
    // 4⃣ LIMPIEZA
    // =============================
    downloadedFiles.forEach(f => {
      try {
        if (fs.existsSync(f.filePath)) fs.unlinkSync(f.filePath);
      } catch (_) {}
    });

    // =============================
    // 5⃣ RESPUESTA
    // =============================
    return res.status(200).json({
      message: 'Envío DICOM finalizado',
      total: downloadedFiles.length,
      success: results.filter(r => r.status === 'OK').length,
      failed: results.filter(r => r.status === 'ERROR').length,
      results,
    });
  } catch (err) {
    console.error('❌ Error general:', err);
    return res.status(500).json({ error: 'Error inesperado en envío DICOM.' });
  }
};
exports.deleteDicomStudy = async (req, res) => {
  const { host, port, calledAET, callingAET, sopInstanceUid } = req.body;

  if (!host || !port || !calledAET || !callingAET || !sopInstanceUid) {
    return res.status(400).json({ message: 'Faltan parámetros requeridos' });
  }

  console.log('eliminar');

  const client = new Client();

  // Crear la solicitud N-DELETE
  const deleteRequest = new NDeleteRequest({
    StudyInstanceUID: sopInstanceUid,
  });

  deleteRequest.on('response', response => {
    if (response.status === Status.Success) {
      res.status(200).json({ message: 'Estudio DICOM eliminado correctamente' });
    } else {
      res.status(500).json({
        message: 'Error al eliminar el estudio',
        status: response.status,
      });
    }
  });

  client.on('networkError', err => {
    console.error('Error de red:', err);
    if (!res.headersSent) {
      res.status(500).json({
        message: 'Error de red al eliminar DICOM',
        error: err.message,
      });
    }
  });

  try {
    client.addRequest(deleteRequest);

    await client.send(host.trim(), parseInt(port), callingAET.trim(), calledAET.trim());
  } catch (error) {
    console.error('Error al eliminar DICOM:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
  }
};
exports.pingDicomServer = async (req, res) => {
  const client = new Client();
  const request = new CEchoRequest();
  const { host, port, calledAET, callingAET } = req.body;

  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      client.abort();
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'No se pudo conectar con el servidor DICOM. El tiempo de espera se agotó.',
      });
    }
  }, 5000);

  request.on('response', response => {
    if (!res.headersSent && response.getStatus() === Status.Success) {
      clearTimeout(timeout);
      res.json({
        port: parseInt(port),
        host: host.trim(),
        callingAET: callingAET.trim(),
        calledAET: calledAET.trim(),
        message: 'DICOM server está escuchando (C-ECHO exitoso).',
      });
      console.log('¡Conexión exitosa!');
    }
  });

  client.addRequest(request);

  client.on('networkError', e => {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(404).json({
        error: 'Not Found',
        message:
          'No se pudo conectar con el servidor DICOM. Error de red o servidor no encontrado.',
      });
    }
    console.log('Error de red: ', e);
  });

  try {
    await client.send(host.trim(), parseInt(port), callingAET.trim(), calledAET.trim());
  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al intentar conectar con el servidor DICOM.',
      });
    }
    console.log('Error de conexión:', error);
  }
};
exports.findDicomStudies = async (req, res) => {
  const { host, port, calledAET, callingAET, PatientID, studyInstanceUid } = req.query;

  const client = new Client();
  const request = CFindRequest.createStudyFindRequest({
    PatientID: PatientID || '',
    PatientName: '',
    StudyInstanceUID: studyInstanceUid || '',
  });

  const allResponses = [];

  let isResponded = false;

  const timeout = setTimeout(() => {
    if (!isResponded) {
      client.abort();
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'No se pudo conectar con el servidor DICOM. El tiempo de espera se agotó.',
      });
      isResponded = true;
    }
  }, 5000);

  request.on('response', response => {
    if (isResponded) {
      return;
    }

    if (response.getStatus() === Status.Pending && response.hasDataset()) {
      console.log('Datos de la respuesta:', response.getDataset());
      allResponses.push(response.getDataset());
    } else {
      console.log('Estado de la respuesta:', response.getStatus());

      if (response.getStatus() === Status.Success && !isResponded) {
        clearTimeout(timeout);
        if (allResponses.length === 0) {
          res.status(404).json({
            error: 'No Studies Found',
            message: 'No se encontraron estudios DICOM con los parámetros proporcionados.',
          });
        } else {
          res.json(allResponses);
        }
        isResponded = true;
      }
    }
  });

  client.addRequest(request);

  client.on('networkError', e => {
    console.log('Network error: ', e);
    if (!isResponded) {
      clearTimeout(timeout);
      res
        .status(500)
        .json({ error: 'Network Error', message: 'No se pudo conectar al servidor DICOM' });
      isResponded = true;
    }
  });

  try {
    await client.send(host.trim(), parseInt(port), callingAET.trim(), calledAET.trim());
  } catch (error) {
    console.log('Error al intentar enviar la solicitud:', error);
    if (!isResponded) {
      clearTimeout(timeout);
      res.status(500).json({
        error: 'Server Error',
        message: 'Hubo un problema al enviar la solicitud al servidor DICOM',
      });
      isResponded = true;
    }
  }
};
exports.getFindActivate = async (req, res) => {
  // try {
  //   const findActivate = await FindActivate.FindActivate.findOne();
  //   if (!findActivate) {
  //     return res.status(404).json({ message: 'Estado no encontrado' });
  //   }
  //   console.log(findActivate);
  //   const shouldAutoLogin = findActivate.isActive
  //     ? findActivate.isActive
  //     : process.env.AUTO_LOGIN === 'true';
  //   console.log('Estado de AUTO_LOGIN:', shouldAutoLogin);
  //   if (shouldAutoLogin) {
  //     console.log('Auto-login activado. Iniciando el proceso...');
  //     startLoginProcess();
  //   } else {
  //     console.log('Auto-login desactivado. El proceso no se ejecutará.');
  //   }
  //   res.json(findActivate);
  // } catch (error) {
  //   console.error('Error al obtener el estado:', error);
  //   res.status(500).json({ message: 'Error al obtener el estado', error: error.message });
  // }
};

exports.setFindActivate = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'El valor de isActive debe ser un booleano' });
    }

    let findActivate = await FindActivate.FindActivate.findOne();

    if (!findActivate) {
      findActivate = new FindActivate({ isActive });
    } else {
      findActivate.isActive = isActive;
    }
    await findActivate.save();

    res.json({ message: 'Estado actualizado con éxito', findActivate });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el estado', error });
  }
};
