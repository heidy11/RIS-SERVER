const net = require('net');
const RisPatient = require('../models/RisPatient');
const RisOrder = require('../models/RisOrder');

// Caracteres delimitadores estándar MLLP
const VT = String.fromCharCode(0x0b); // Vertical Tab - Inicio de mensaje
const FS = String.fromCharCode(0x1c); // File Separator - Fin de mensaje
const CR = String.fromCharCode(0x0d); // Carriage Return

// HL7 Delimiters (Standard)
const FIELD_SEP = '|';
const COMPONENT_SEP = '^';

class HL7Service {
  constructor() {
    this.port = parseInt(process.env.HL7_PORT || '2577');
    this.server = null;
  }

  initialize() {
    this.server = net.createServer(socket => {
      console.log(`[HL7] Conexión entrante desde ${socket.remoteAddress}:${socket.remotePort}`);

      let messageBuffer = '';

      socket.on('data', async data => {
        const dataStr = data.toString('binary');
        messageBuffer += dataStr;

        // Comprobar si tenemos un mensaje completo (termina con FS CR)
        const endIndex = messageBuffer.indexOf(FS + CR);
        if (endIndex !== -1) {
          // Extraer el mensaje removiendo el VT inicial y el bloque final
          const startIndex = messageBuffer.indexOf(VT);
          if (startIndex !== -1) {
            const hl7Message = messageBuffer.substring(startIndex + 1, endIndex);
            await this.processMessage(hl7Message, socket);
          }
          // Limpiar el buffer para futuros mensajes en el mismo socket
          messageBuffer = messageBuffer.substring(endIndex + 2);
        }
      });

      socket.on('error', err => {
        console.error(`[HL7] Error en socket:`, err.message);
      });

      socket.on('close', () => {
        console.log(`[HL7] Conexión cerrada con ${socket.remoteAddress}`);
      });
    });

    this.server.listen(this.port, () => {
      console.log(`[HL7] Servidor MLLP escuchando en el puerto TCP ${this.port}`);
    });
  }

  async processMessage(message, socket) {
    const segments = message.split(CR).filter(seg => seg.trim().length > 0);
    if (!segments.length) return;

    const mshHeader = segments[0].split(FIELD_SEP);
    if (mshHeader[0] !== 'MSH') return; // No es un mensaje HL7 válido

    const messageTypeRaw = mshHeader[8] || '';
    const messageType = messageTypeRaw.split(COMPONENT_SEP)[0]; // Ej: ADT o ORM
    const triggerEvent = messageTypeRaw.split(COMPONENT_SEP)[1]; // Ej: A01 o O01
    const messageControlId = mshHeader[9] || 'UNKNOWN';

    console.log(
      `[HL7] Recibido mensaje: ${messageType}^${triggerEvent} (Control ID: ${messageControlId})`
    );

    try {
      if (messageType === 'ADT') {
        await this.handleADT(segments);
      } else if (messageType === 'ORM') {
        await this.handleORM(segments);
      }

      // Enviar ACK (Acuse de recibo)
      this.sendACK(socket, mshHeader, 'AA', 'Message accepted');
    } catch (error) {
      console.error(`[HL7] Error procesando mensaje:`, error);
      // Enviar NACK (Error)
      this.sendACK(socket, mshHeader, 'AE', error.message);
    }
  }

  async handleADT(segments) {
    // Buscar segmento PID
    const pidSegment = segments.find(s => s.startsWith('PID|'));
    if (!pidSegment) throw new Error('Mensaje ADT sin segmento PID');

    const pid = pidSegment.split(FIELD_SEP);
    const patientId = (pid[3] || '').split(COMPONENT_SEP)[0];
    const nameData = (pid[5] || '').split(COMPONENT_SEP);
    const lastName = nameData[0] || '';
    const firstName = nameData[1] || '';
    const gender = pid[8] || 'U'; // Default a Unknown

    // Parse Date of Birth (YYYYMMDD)
    const dobRaw = pid[7] || '';
    let dateOfBirth = null;
    if (dobRaw.length >= 8) {
      dateOfBirth = new Date(
        `${dobRaw.substring(0, 4)}-${dobRaw.substring(4, 6)}-${dobRaw.substring(6, 8)}`
      );
    }

    // Upsert Patient
    await RisPatient.findOneAndUpdate(
      { patientId },
      { patientId, firstName, lastName, gender, dateOfBirth },
      { upsert: true, new: true }
    );
    console.log(`[HL7] Paciente ${patientId} procesado exitosamente (ADT).`);
  }

  async handleORM(segments) {
    // Buscar segmento PID y OBR
    const pidSegment = segments.find(s => s.startsWith('PID|'));
    const obrSegment = segments.find(s => s.startsWith('OBR|'));

    if (!pidSegment || !obrSegment) throw new Error('Mensaje ORM incompleto (falta PID o OBR)');

    // Procesar paciente primero
    const pid = pidSegment.split(FIELD_SEP);
    const patientId = (pid[3] || '').split(COMPONENT_SEP)[0];
    const nameData = (pid[5] || '').split(COMPONENT_SEP);

    let patient = await RisPatient.findOne({ patientId });
    if (!patient) {
      // Si no existe, crearlo
      patient = new RisPatient({
        patientId,
        lastName: nameData[0] || 'Desconocido',
        firstName: nameData[1] || 'Desconocido',
      });
      await patient.save();
    }

    // Procesar orden (OBR y/o ORC)
    const obr = obrSegment.split(FIELD_SEP);
    const accessionNumber = (obr[3] || '').split(COMPONENT_SEP)[0];
    const procedureCodeData = (obr[4] || '').split(COMPONENT_SEP);
    const procedureDescription = procedureCodeData[1] || procedureCodeData[0];
    const modality = obr[24] || 'UNKNOWN'; // Mapeo a veces en OBR-24 o predefinido

    // Programado
    const scheduledDateRaw = obr[27] || '';
    const scheduledDate = new Date(); // Si no hay, usar ahora

    await RisOrder.findOneAndUpdate(
      { accessionNumber },
      {
        accessionNumber,
        patient: patient._id,
        modality,
        procedureDescription,
        scheduledDate,
        status: 'SCHEDULED',
      },
      { upsert: true, new: true }
    );
    console.log(`[HL7] Orden ${accessionNumber} procesada exitosamente (ORM).`);

    // Reenviar a dcm4chee (Integración MWL)
    //
    // Desactivado por defecto: hay dos caminos posibles hacia la worklist y no
    // deben quedar los dos activos. El oficial es el RIS-PACS Adapter, que crea
    // la entrada MWL por REST desde `src/services/mwl/` cuando se agenda la
    // orden. Si además se reenvía el ORM por HL7, dcm4chee genera una segunda
    // entrada para la misma orden y el técnico ve al paciente duplicado en la
    // consola del equipo.
    //
    // Poner HL7_FORWARD_TO_PACS=true solo si se decide que el origen de las
    // órdenes es un sistema externo por HL7 y no el propio RIS. En ese caso hay
    // que desactivar el adapter con MWL_ENABLED=false.
    try {
      if (process.env.HL7_FORWARD_TO_PACS !== 'true') {
        console.log(
          '[HL7] Reenvío a dcm4chee omitido (HL7_FORWARD_TO_PACS != true). ' +
            'La worklist la genera el RIS-PACS Adapter.'
        );
        return;
      }

      const dcm4cheeHost = process.env.DCM4CHEE_HL7_HOST || '127.0.0.1';
      const dcm4cheePort = parseInt(process.env.DCM4CHEE_HL7_PORT || '2575');

      if (dcm4cheePort !== this.port) {
        console.log(
          `[HL7] Reenviando ORM a dcm4chee en ${dcm4cheeHost}:${dcm4cheePort} para MWL...`
        );
        const originalMessage = segments.join(CR) + CR;
        // Fire and forget
        this.sendHL7Message(dcm4cheeHost, dcm4cheePort, originalMessage).catch(err => {
          console.warn(`[HL7] Error al reenviar ORM a dcm4chee: ${err.message}`);
        });
      }
    } catch (err) {
      console.warn(`[HL7] Excepción al reenviar MWL: ${err.message}`);
    }
  }

  sendACK(socket, reqMsh, ackCode, textMessage) {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const ackMsh = `MSH|^~\\&|RIS|OHIF|${reqMsh[3]}|${reqMsh[4]}|${timestamp}||ACK|${reqMsh[9]}|P|2.3`;
    const msa = `MSA|${ackCode}|${reqMsh[9]}|${textMessage}`;

    const hl7Ack = ackMsh + CR + msa + CR;
    const mllpAck = VT + hl7Ack + FS + CR;

    socket.write(mllpAck, 'binary');
  }

  // Utilidad para enviar mensajes HL7 por TCP hacia otro sistema (e.g. envíos ORU^R01 o ORM hacia dcm4chee)
  async sendHL7Message(host, port, hl7MessageString) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.connect(port, host, () => {
        const mllpMessage = VT + hl7MessageString + FS + CR;
        client.write(mllpMessage, 'binary');
      });

      client.on('data', data => {
        const response = data.toString('binary');
        client.destroy(); // kill client after server's response
        resolve(response);
      });

      client.on('error', err => {
        reject(err);
      });
    });
  }
}

module.exports = new HL7Service();
