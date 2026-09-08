# RIS-PACS Adapter — Modality Worklist

Módulo que traduce las órdenes del RIS a entradas de Modality Worklist en
DCM4CHEE, para que el tomógrafo, el equipo de rayos X y los ecógrafos vean al
paciente en su consola sin que nadie lo tipee dos veces.

Implementa la Etapa 1E del documento *Integración RIS ↔ PACS (DCM4CHEE) ↔ OHIF v2*.

## Por qué vive dentro de RIS-SERVER y no como microservicio aparte

El documento (sección 5.1) propone un servicio nuevo en TypeScript + Fastify +
PostgreSQL + Redis/BullMQ. Se implementó como módulo del RIS existente porque:

- El RIS ya está en producción sobre Node/Express/MongoDB. Un microservicio
  aparte agrega PostgreSQL y Redis a la infraestructura del hospital, dos
  motores más que operar, respaldar y monitorear.
- El outbox necesita atomicidad entre "guardar la orden" y "encolar el envío".
  Dentro del mismo proceso y la misma base eso es directo; entre dos servicios
  con bases distintas es precisamente el problema que el patrón outbox resuelve,
  y habría que resolverlo de nuevo.
- El volumen es de decenas de órdenes por día. BullMQ sobre Redis está pensado
  para otra escala.

Lo que sí se respetó del diseño original es la **separación en capas**, que es
lo que permitiría extraerlo a un servicio propio más adelante copiando carpetas:

| Capa | Archivo | Depende de |
|---|---|---|
| Configuración | `src/services/mwl/mwl.config.js` | solo del entorno |
| Mapeo DICOM | `src/services/mwl/dicomMwl.mapper.js` | nada (función pura) |
| Generación de UID | `src/services/mwl/studyUid.generator.js` | nada |
| Cliente DCM4CHEE | `src/services/mwl/dcm4chee.client.js` | HTTP |
| Encolado | `src/services/mwl/mwlOutbox.service.js` | Mongo + mapeador |
| Worker | `src/services/mwl/mwlSync.worker.js` | Mongo + cliente |
| API de operación | `src/controllers/mwl.controller.js` | todo lo anterior |

El mapeador —la parte con más riesgo de errores sutiles— no toca red ni base de
datos y se prueba entero sin un DCM4CHEE levantado.

## Flujo

```
RIS (agendar/reprogramar/cancelar)
  │  ris.controller  →  mwlOutbox.enqueueUpsert / enqueueDelete
  ▼
MwlOutbox (Mongo)   estado PENDING
  │  mwlSync.worker cada 5 s, backoff exponencial
  ▼
DCM4CHEE
  │  POST /aets/{aet}/rs/patients        alta del paciente
  │  POST /aets/{mwlAet}/rs/mwlitems     upsert del SPS
  ▼
C-FIND MWL desde el equipo → adquisición → C-STORE → PACS → OHIF
```

La llamada a DCM4CHEE nunca ocurre dentro del request del RIS. Agendar responde
apenas se guarda la orden; la sincronización va después. Si el PACS está caído
cuando entra un TAC de urgencia, la recepcionista igual puede registrar al
paciente y la entrada se crea sola al volver el servicio.

## Modelo de datos

**`RisOrder`** (campos agregados):

| Campo | Uso |
|---|---|
| `studyInstanceUid` | Se genera una sola vez y no cambia nunca. Es el hilo que une RIS → MWL → equipo → PACS → OHIF. |
| `stationAet` | AE Title del equipo. Si está vacío se resuelve por modalidad desde el `.env`. |
| `requestedProcedureId`, `scheduledProcedureStepId` | Opcionales; por defecto se derivan del accession number. |
| `mwlSyncStatus` | `PENDING` / `SYNCED` / `ERROR` / `DISABLED` (cancelada y retirada de la worklist). |
| `mwlSyncedAt`, `mwlLastError` | Para mostrar "requiere atención" en la pantalla del RIS. |

**`MwlOutbox`** — trabajo pendiente. Guarda el DICOM JSON exacto que se envió,
para poder reproducir después qué se le mandó al PACS.

**`MwlAuditLog`** — historial de cada intento, exitoso o no. Su retención debe
seguir la política de registros clínicos, no la ventana de reintentos.

## Configuración

Todas las variables están documentadas en `.env.example`. Las cuatro que hay
que revisar sí o sí antes de conectar a un PACS real:

| Variable | Default | Nota |
|---|---|---|
| `MWL_ENABLED` | `false` | Con `false` el RIS funciona exactamente como antes. |
| `DCM4CHEE_BASE_URL` | lab local | URL base del archivo. |
| `DCM4CHEE_AET` | `DCM4CHEE` | AE del **archivo**: pacientes, estudios, MPPS. |
| `DCM4CHEE_MWL_AET` | `WORKLIST` | AE de la **worklist**. No es el mismo. Ver abajo. |

## A qué equipo se envía cada orden

El destino es el **Scheduled Station AE Title** (0040,0001). Se resuelve en este
orden, en `mwlOutbox.service.js`:

1. El campo `stationAet` cargado a mano en la orden — gana siempre.
2. El AE Title del equipo asignado explícitamente a la orden (`equipment`).
3. El único equipo activo de esa modalidad con worklist habilitada.
4. El mapa `MWL_STATION_AET_<MODALIDAD>` del `.env`, como respaldo.

Los pasos 2 y 3 leen la colección `Equipment`, que ahora guarda la identidad
DICOM de cada equipo (`aeTitle`, `ipAddress`, `dicomPort`, `modality`,
`supportsMwl`) y se administra desde la pantalla **Equipos** del RIS. Eso
significa que agregar un ecógrafo nuevo es cargar una ficha, no tocar el `.env`
ni reiniciar el servidor.

**Si hay dos equipos de la misma modalidad y la orden no dice cuál, no se elige
ninguno**: la orden queda en `ERROR` pidiendo que se asigne el equipo. Mandar un
estudio a la sala equivocada es peor que no mandarlo.

El respaldo por `.env` se mantiene para que el módulo siga funcionando en un
entorno sin equipos cargados todavía:

```
MWL_STATION_AET_CT=CT01
MWL_STATION_AET_DX=XRAY01
MWL_STATION_AET_CR=XRAY01
MWL_STATION_AET_US=US01
```

## Endpoints de operación

Todos bajo `/api/mwl`, autenticados con el mismo JWT del RIS.

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/health` | Conectividad con DCM4CHEE, tamaño de la cola, métricas del worker. Devuelve 503 si el archivo no responde. |
| `GET` | `/worklist?modality=CT` | Lo que DCM4CHEE tiene **realmente** en la worklist. Si algo no sale acá, tampoco sale en la consola del equipo. |
| `GET` | `/preview/:accessionNumber` | El DICOM JSON exacto que se enviaría, **sin enviarlo**. |
| `GET` | `/orders/:accessionNumber/status` | Estado de sincronización, último error, historial de intentos. |
| `POST` | `/orders/:accessionNumber/retry` | Reintento manual tras corregir la causa. |
| `GET` | `/outbox?status=ERROR` | Cola de sincronización. |
| `POST` | `/reconcile` | Dispara la reconciliación sin esperar al cron. |
| `GET` | `/mpps` | Qué estudios reportaron los equipos como iniciados o terminados. |
| `POST` | `/mpps/sync` | Consulta ya mismo esos estados y actualiza las órdenes. |

`/preview` es la herramienta para el caso clásico: la orden dice `SYNCED` pero el
equipo no la muestra. Permite comparar tag por tag contra el DICOM Conformance
Statement del equipo antes de tocar nada.

## Resiliencia

- **Backoff exponencial**: 5 s, 30 s, 2 min, 10 min, 30 min, 1 h (`MWL_BACKOFF_SECONDS`).
  Agotados los reintentos, la orden queda en `ERROR` y visible en `/api/mwl/outbox?status=ERROR`.
- **Un 400 no se reintenta.** Significa que el DICOM JSON está mal construido:
  reintentarlo solo llena la cola y retrasa la alerta.
- **Un 401/403 refresca el token** y reintenta.
- **Un DELETE que devuelve 404 se considera éxito**: el objetivo era que la
  entrada no esté en la worklist, y ya no está.
- **Reconciliación cada 15 min**: compara las órdenes que el RIS cree agendadas
  contra lo que DCM4CHEE tiene, y reencola las que falten. Cubre lo que el outbox
  no ve — alguien borró la entrada desde la UI del PACS, se restauró un backup.
- **Una falla del PACS nunca rompe el RIS**: el encolado va envuelto en
  `syncWorklist()` en `ris.controller.js`, que registra el error y sigue.

## Decisiones de mapeo que no son obvias

Están en `dicomMwl.mapper.js`, cada una con su comentario. Las que más cuestan
en campo:

- **La secuencia (0040,0100).** `Modality`, `ScheduledStationAETitle`, fecha y
  hora van *dentro* de la Scheduled Procedure Step Sequence, no en la raíz. Si se
  ponen en la raíz, DCM4CHEE responde 200 OK y el C-FIND del equipo no devuelve
  nada, sin ningún error. Es el error de mapeo más común (sección 8 del documento).
- **Hora local, no UTC.** Un turno a las 21:00 en La Paz (UTC−4) cae al día
  siguiente en UTC. Formateado en UTC, el paciente aparece en la worklist del día
  equivocado.
- **Transliteración a ASCII.** `MUÑOZ PEÑA^JOSÉ` se envía como `MUNOZ PENA^JOSE`.
  Las consolas antiguas no negocian Specific Character Set y con tildes muestran
  basura o descartan la entrada. Perder los acentos es preferible a que el
  paciente no aparezca.
- **`U` no es un sexo DICOM válido.** El RIS lo permite; `(0010,0040)` solo
  admite `M`, `F`, `O` o vacío.
- **Límites por VR.** `AccessionNumber` es `SH` (16 caracteres) y
  `RequestedProcedureDescription` es `LO` (64). Se recortan con aviso en el log
  en vez de dejar que el PACS rechace la entrada.
- **El SPS ID es estable.** DCM4CHEE hace upsert por Study UID + SPS ID; un SPS
  ID nuevo al reprogramar crearía una segunda entrada en vez de actualizar la
  existente.
- **El paciente se da de alta primero.** DCM4CHEE rechaza el POST a `/mwlitems`
  con 404 si el paciente no existe en el archivo. Ver `pacs-lab/README.md`.

## Pruebas

```bash
yarn test
```

- `test/unit/dicomMwl.mapper.test.js` — 21 pruebas del mapeador y del generador
  de UID. No necesitan infraestructura.
- `test/integration/mwlFlow.test.js` — agendar → reprogramar → cancelar contra
  un DCM4CHEE real, verificando por QIDO que la entrada aparece, se actualiza sin
  duplicarse y se retira. Usa una base Mongo aparte (`ris-mwl-test`) y se salta
  sola si no hay lab levantado.

Para las de integración: `docker compose -f pacs-lab/docker-compose.yml up -d`.

## Etapa 2 — MPPS: el estado se actualiza solo

El equipo médico informa al PACS cuando empieza el estudio (N-CREATE) y cuando
lo termina (N-SET). Ni el RIS ni el adapter escriben MPPS: lo escribe el equipo,
y DCM4CHEE lo expone **solo para consulta**. Verificado: el archivo no despliega
`mpps-rs`, así que no hay forma de crearlo por REST — es DIMSE o nada.

`mppsSync.service.js` consulta `GET /rs/mpps` cada minuto y traduce:

| El equipo reporta | La orden pasa a |
|---|---|
| `IN PROGRESS` | `IN_PROGRESS` |
| `COMPLETED` | `COMPLETED` |
| `DISCONTINUED` | **no cambia** — queda registrado en `mppsStatus` para revisión |

`DISCONTINUED` significa que el estudio se abandonó a mitad. Decidir solo entre
"terminado" y "cancelado" sería peor que dejarlo visible.

Dos reglas que evitan corrupción de estado:

- **El estado solo avanza.** Un MPPS viejo que reaparezca no puede devolver a
  "en equipo" un estudio que el radiólogo ya informó.
- **Una orden cancelada nunca se reactiva.** `CANCELED` no está en la escalera
  de estados, así que ningún MPPS tardío la revive.

Los identificadores que unen el MPPS con la orden viven dentro de la **Scheduled
Step Attributes Sequence (0040,0270)**, no en la raíz — el mismo tipo de anidado
que en la worklist. El job indexa por Study UID y por accession number, porque
no todos los equipos completan los dos campos.

### Probarlo sin equipos reales

`mppsscu` de dcm4che simula a la modalidad reportando el estudio:

```bash
docker run --rm --network pacs-lab_default -v "<ruta>/src/temp:/data" dcm4che/dcm4che-tools:5.35.1 mppsscu -c DCM4CHEE@arc:11112 /data/<archivo>.dcm
```

Envía N-CREATE (`IN PROGRESS`) y N-SET (`COMPLETED`). Después, una orden del RIS
cuyo `studyInstanceUid` coincida con el del archivo pasa sola a `COMPLETED` en el
siguiente ciclo, o al llamar a `POST /api/mwl/mpps/sync`.

Verificado el 2026-09-04 contra dcm4chee-arc 5.35.1: la orden pasó de
`SCHEDULED` a `COMPLETED` sin intervención.

## Pendiente
- **Regla de negocio a validar con el cliente**: qué hacer si se cancela o
  reprograma un estudio que el equipo ya empezó a adquirir. El documento (6.3)
  sugiere alertar al operador en vez de borrar el MWL en silencio. Hoy el módulo
  borra.
- **Enmascarado de PHI en logs** (sección 17). Hoy el `console.log` del worker
  imprime el accession number, que no es identificable por sí solo, pero el
  mapeador puede loguear un nombre completo al recortar un campo largo.
