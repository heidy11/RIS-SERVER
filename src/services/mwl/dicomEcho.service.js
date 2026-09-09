/** Verificacion de conectividad DICOM (C-ECHO) contra un equipo. */

const net = require('net');
const { Client, requests, constants } = require('dcmjs-dimse');
const { CEchoRequest } = requests;
const { Status } = constants;
const config = require('./mwl.config');

/** AE Title con el que el RIS se presenta ante los equipos. */
const CALLING_AET = (process.env.CALLING_AET_DICOM_LOCAL || 'MYAPP').split('#')[0].trim();

/** Tiempo maximo de espera de la asociacion, en ms. */
const TIMEOUT_MS = parseInt(process.env.DICOM_ECHO_TIMEOUT_MS || '8000', 10);

/** Motivos de rechazo de asociacion (A-ASSOCIATE-RJ), DICOM PS3.8 tabla 9-21. */
const MOTIVOS_RECHAZO = {
  1: 'no dio un motivo',
  2: 'no soporta el contexto de aplicacion',
  3: `no reconoce el AE Title de origen`,
  7: 'no reconoce el AE Title de destino',
};

/**
 * Comprueba que haya algo escuchando en el puerto TCP, antes de intentar la asociacion DICOM. Se separan a proposito las dos capas: si el puerto no abre, el problema es de red o de servicio y no tiene nada que ver con DICOM. Mezclarlas produce el diagnostico mas inutil de todos — "no se pudo conectar" — cuando en realidad se puede decir si el equipo esta apagado, si el puerto esta cerrado o si hay un firewall en el medio.
 * @returns {Promise<{ok:boolean, message?:string, detail?:string}>}
 */
function probarTcp(host, port, timeoutMs) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let resuelto = false;

    const terminar = r => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(r);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => terminar({ ok: true }));
    socket.once('timeout', () =>
      terminar({
        ok: false,
        message: `El equipo no contesto en ${timeoutMs} ms`,
        detail:
          'La direccion no responde. El equipo puede estar apagado, o un firewall esta ' +
          'descartando la conexion en silencio (no la rechaza, la ignora).',
      })
    );
    socket.once('error', err => {
      const code = (err && err.code) || '';
      const detalle =
        code === 'ECONNREFUSED'
          ? 'La direccion responde pero nadie escucha en ese puerto. El equipo esta encendido ' +
            'y en red: revisar que el servicio DICOM este activo y que el puerto sea el correcto.'
          : code === 'EHOSTUNREACH' || code === 'ENETUNREACH'
            ? 'No hay ruta hacia esa direccion IP. Revisar la red o la VLAN.'
            : code === 'ENOTFOUND' || code === 'EAI_AGAIN'
              ? 'No se pudo resolver ese nombre. Conviene usar la direccion IP.'
              : `Error de red: ${code || err.message}`;

      terminar({ ok: false, message: 'No hay conexion de red con el equipo', detail: detalle });
    });

    socket.connect(port, host);
  });
}

/** Traduce el error tecnico a algo que le sirva a quien esta parado frente al equipo con el cable en la mano. */
function explicarError(err) {
  // Los errores de socket a veces llegan sin mensaje y solo con `code`, asi que se arma el texto con todo lo que haya antes de intentar clasificarlo.
  const msg = [
    err && err.message,
    err && err.code,
    typeof err === 'string' ? err : null,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (/ECONNREFUSED/i.test(msg)) {
    return 'El equipo responde en la red pero rechaza la conexion en ese puerto. ' +
      'Revisar que el servicio DICOM este encendido y que el puerto sea el correcto.';
  }
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) {
    return 'No hay ruta hacia esa direccion IP. Revisar la red o la VLAN.';
  }
  if (/ETIMEDOUT|timeout|tiempo de espera/i.test(msg)) {
    return 'El equipo no contesto a tiempo. Puede estar apagado, o un firewall ' +
      'esta descartando la conexion en silencio.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return 'No se pudo resolver ese nombre de host. Usar la direccion IP.';
  }
  if (/rejected|association/i.test(msg)) {
    return 'El equipo contesto pero rechazo la asociacion. Casi siempre es que no ' +
      `tiene registrado el AE Title "${CALLING_AET}" como origen autorizado.`;
  }
  return msg || 'Error desconocido al intentar la asociacion DICOM.';
}

/**
 * Hace un C-ECHO contra un nodo DICOM. Nunca lanza: devuelve siempre un resultado describiendo que paso, porque quien lo llama es una pantalla de diagnostico y un equipo apagado es una respuesta valida, no un error del sistema.
 * @param {{host:string, port:number, calledAet:string, callingAet?:string}} destino
 * @returns {Promise<{ok:boolean, elapsedMs:number, message:string, detail?:string}>}
 */
async function cEcho({ host, port, calledAet, callingAet = CALLING_AET }) {
  if (!host || !port || !calledAet) {
    return {
      ok: false,
      elapsedMs: 0,
      stage: 'CONFIG',
      message: 'Faltan datos del equipo',
      detail:
        'Se necesitan direccion IP, puerto DICOM y AE Title. Se cargan en la ficha del equipo.',
    };
  }

  // Primera capa: ¿hay algo escuchando en ese puerto?
  const inicioTcp = Date.now();
  const tcp = await probarTcp(String(host).trim(), parseInt(port, 10), TIMEOUT_MS);
  if (!tcp.ok) {
    return { ok: false, elapsedMs: Date.now() - inicioTcp, stage: 'RED', ...tcp };
  }

  // Segunda capa: ¿ese servicio habla DICOM y nos acepta?
  return asociarDicom({ host, port, calledAet, callingAet });
}

/** Establece la asociacion DICOM y hace el C-ECHO. Asume el puerto ya alcanzable. */
function asociarDicom({ host, port, calledAet, callingAet }) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const client = new Client();
    const request = new CEchoRequest();
    let resuelto = false;

    /** Garantiza una unica respuesta y que el socket quede cerrado. */
    const terminar = resultado => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      try {
        client.abort();
      } catch {
        /* el cliente ya puede estar cerrado; no aporta nada al diagnostico */
      }
      resolve({ stage: 'DICOM', ...resultado, elapsedMs: Date.now() - inicio });
    };

    const temporizador = setTimeout(() => {
      terminar({
        ok: false,
        message: `Sin respuesta tras ${TIMEOUT_MS} ms`,
        detail: explicarError('timeout'),
      });
    }, TIMEOUT_MS);

    request.on('response', response => {
      if (response.getStatus() === Status.Success) {
        terminar({ ok: true, message: 'Responde correctamente (C-ECHO exitoso)' });
      } else {
        terminar({
          ok: false,
          message: `El equipo respondio con estado ${response.getStatus()}`,
          detail: 'La asociacion se establecio pero el equipo no confirmo el C-ECHO.',
        });
      }
    });

    client.on('networkError', err => {
      terminar({ ok: false, message: 'No se pudo conectar', detail: explicarError(err) });
    });

    /** El equipo contesto y rechazo la asociacion. */
    client.on('associationRejected', rechazo => {
      const codigo = Number(
        (rechazo && (rechazo.reason ?? rechazo.getReason?.())) ?? NaN
      );

      const detalle =
        codigo === 7
          ? `El equipo no reconoce el AE Title de destino "${calledAet}". Revisar que este ` +
            'escrito exactamente igual que en el Conformance Statement (distingue mayusculas).'
          : codigo === 3
            ? `El equipo no reconoce a "${callingAet}" como origen autorizado. Hay que darlo ` +
              'de alta en la configuracion del equipo.'
            : `El equipo rechazo la asociacion: ${MOTIVOS_RECHAZO[codigo] || `motivo ${codigo}`}.`;

      terminar({ ok: false, message: 'El equipo rechazo la conexion', detail: detalle });
    });

    // La conexion se cerro sin que llegara ninguna respuesta ni error explicito.
    client.on('closed', () => {
      terminar({
        ok: false,
        message: 'El equipo cerro la conexion sin responder',
        detail:
          'Se llego al puerto pero el equipo corto la comunicacion. Suele ser un servicio ' +
          'DICOM que no es el esperado, o un AE Title no autorizado.',
      });
    });

    client.addRequest(request);

    try {
      client.send(String(host).trim(), parseInt(port, 10), callingAet, String(calledAet).trim());
    } catch (err) {
      terminar({ ok: false, message: 'No se pudo iniciar la conexion', detail: explicarError(err) });
    }
  });
}

/**
 * Verifica un equipo cargado en el RIS.
 * @param {object} equipo documento de Equipment
 */
async function probarEquipo(equipo) {
  const resultado = await cEcho({
    host: equipo.ipAddress,
    port: equipo.dicomPort || 104,
    calledAet: equipo.aeTitle,
  });

  return {
    equipmentId: equipo._id,
    name: equipo.name,
    aeTitle: equipo.aeTitle || null,
    target: equipo.ipAddress ? `${equipo.ipAddress}:${equipo.dicomPort || 104}` : null,
    callingAet: CALLING_AET,
    checkedAt: new Date(),
    ...resultado,
  };
}

/** Verifica el propio PACS, usando la configuracion del adapter. */
async function probarPacs() {
  const [host, puerto] = String(process.env.HOST_DICOM_LOCAL || '')
    .trim()
    .split(':');

  const resultado = await cEcho({
    host: host || 'localhost',
    port: parseInt(process.env.PORT_DICOM_LOCAL || '11112', 10),
    calledAet: (process.env.CALLED_AET_DICOM_LOCAL || config.aet).split('#')[0].trim(),
  });

  return {
    name: 'PACS (archivo)',
    target: `${host || 'localhost'}:${process.env.PORT_DICOM_LOCAL || '11112'}`,
    callingAet: CALLING_AET,
    checkedAt: new Date(),
    ...resultado,
  };
}

module.exports = { cEcho, probarEquipo, probarPacs, CALLING_AET, TIMEOUT_MS };
