# Laboratorio DCM4CHEE — Etapa 1A

Levanta un DCM4CHEE 5.35.1 completo en la máquina local para validar el flujo de
Modality Worklist **sin depender de la red del hospital**. Todo lo que se prueba
aquí (payloads, rutas REST, comandos `findscu`) sirve tal cual contra el PACS de
producción cambiando solo la URL y el AE Title.

Corresponde a la Etapa 1A del documento *Integración RIS ↔ PACS (DCM4CHEE) ↔ OHIF v2*.

## Requisitos

- Docker Desktop corriendo
- Node.js 18+ (para el cliente `scripts/mwl.js`)

## Levantar el lab

```bash
docker compose -f pacs-lab/docker-compose.yml up -d
```

WildFly tarda entre 1 y 2 minutos en desplegar. El lab está listo cuando esto
devuelve `{"count":N}`:

```bash
curl http://localhost:8080/dcm4chee-arc/aets/WORKLIST/rs/mwlitems/count
```

| Servicio | Dirección |
|---|---|
| UI web de DCM4CHEE | http://localhost:8080/dcm4chee-arc/ui2 |
| REST del archivo (pacientes, estudios) | http://localhost:8080/dcm4chee-arc/aets/DCM4CHEE/rs |
| REST de worklist | http://localhost:8080/dcm4chee-arc/aets/WORKLIST/rs |
| DICOM DIMSE | `localhost:11112` |
| AE Title del archivo | `DCM4CHEE` |
| AE Title de worklist | `WORKLIST` |

Para bajarlo (conservando los datos): `docker compose -f pacs-lab/docker-compose.yml down`.
Para borrar también los datos: agregar `-v`.

## Tres hallazgos que corrigen el documento

Verificados contra `dcm4che/dcm4chee-arc-psql:5.35.1`. Los tres producen fallas
silenciosas: la petición parece funcionar y el equipo no muestra al paciente.

### 1. La worklist NO vive en el AE Title del archivo

El documento (sección 10.1) indica `POST /dcm4chee-arc/aets/{aet}/rs/mwlitems`
usando el AE Title del archivo. Con el AE del archivo, la **lectura** falla:

```
GET /dcm4chee-arc/aets/DCM4CHEE/rs/mwlitems
404 {"errorMessage":"No Web Application with MWL_RS service class found for
     Application Entity: DCM4CHEE"}
```

DCM4CHEE asocia la clase de servicio `MWL_RS` a una aplicación web aparte,
llamada `WORKLIST` por defecto. La lista real de un servidor se consulta así:

```bash
curl http://localhost:8080/dcm4chee-arc/webapps
```

La escritura (`POST`) funciona en ambos AE, pero la lectura solo en `WORKLIST`,
y la reconciliación del adapter depende de la lectura.

### 2. Lo mismo aplica al DICOM DIMSE — y esto es lo que configura el técnico en el equipo

Apuntar `findscu` al AE del archivo hace que la asociación se rechace:

```
findscu -M MWL -c DCM4CHEE@localhost:11112 ...
  result: 3 - abstract-syntax-not-supported (provider rejection)
  No Presentation Context for Abstract Syntax:
    1.2.840.10008.5.1.4.31 - Modality Worklist Information Model - FIND
```

**El "Worklist Server" que se configura en la consola del tomógrafo, del equipo
de rayos X y del ecógrafo debe apuntar al AE Title de worklist, no al del
archivo.** Si se configura el del archivo, el equipo no muestra ningún error
entendible: simplemente la worklist sale vacía.

Antes de configurar los equipos hay que confirmar cómo se llama ese AE en el
PACS del hospital — no tiene por qué llamarse `WORKLIST`.

### 3. El paciente debe existir antes de crear la entrada MWL

El documento (secciones 9 y 14.4) muestra el `POST /rs/mwlitems` como un paso
único. En la práctica falla si el paciente no está dado de alta:

```
POST /aets/WORKLIST/rs/mwlitems
404 {"errorMessage":"Patient[id=[TESTCT001]] does not exist."}
```

Hay que hacer primero `POST /aets/{aet}/rs/patients` con los tags del grupo 0010.
Ambas operaciones son idempotentes: repetirlas actualiza y devuelve 200, no
duplica. El script `scripts/mwl.js` y el adapter ya lo hacen automáticamente.

## Crear las entradas de prueba

`seed` da de alta los tres pacientes ficticios y crea sus entradas MWL
(`TEST^CT`, `TEST^XRAY`, `TEST^US`) **con la fecha de hoy**:

```bash
node pacs-lab/scripts/mwl.js seed
```

La fecha importa: las consolas suelen consultar la worklist filtrando por el día
en curso. Una entrada con la fecha fija del documento (`20260828`) existe en el
PACS y responde a un `findscu` explícito, pero no aparece en la pantalla del
equipo — y no hay ningún mensaje que lo explique.

Otros comandos:

```bash
node pacs-lab/scripts/mwl.js ping                    # conectividad + conteo
node pacs-lab/scripts/mwl.js list                    # tabla de la worklist
node pacs-lab/scripts/mwl.js list --modality CT      # filtrada
node pacs-lab/scripts/mwl.js create mwl/mwl-ct-test.json
node pacs-lab/scripts/mwl.js delete <studyUID> <spsID>
node pacs-lab/scripts/mwl.js purge                   # borra las tres de prueba
```

Contra otro servidor, sin tocar código:

```bash
DCM4CHEE_BASE_URL=https://pacs.hospital.local/dcm4chee-arc \
DCM4CHEE_AET=MEDPACS \
DCM4CHEE_MWL_AET=WORKLIST \
DCM4CHEE_TOKEN=$TOKEN \
node pacs-lab/scripts/mwl.js list
```

## Verificar por DICOM (criterio de aceptación de la Etapa 1A)

Esto es lo que realmente demuestra la integración: no que el REST responda 200,
sino que un cliente DICOM externo obtenga la worklist por C-FIND, igual que hace
el equipo médico.

**C-ECHO** (verificación de asociación, sección 14.2 del documento):

```bash
docker run --rm --network pacs-lab_default dcm4che/dcm4che-tools:5.35.1 storescu -c DCM4CHEE@arc:11112
```

**C-FIND MWL** simulando al tomógrafo (sección 14.3):

```bash
docker run --rm --network pacs-lab_default dcm4che/dcm4che-tools:5.35.1 findscu -M MWL -b CT_TEST -c WORKLIST@arc:11112 -m 00400100.00080060=CT -r PatientName -r PatientID -r AccessionNumber -r 00400100.00400001 -r 00400100.00400002 -r 00400100.00400003 -r 00400100.00400007 -r 00400100.00400009
```

Resultado obtenido el 2026-08-30 (`status=ff00H`, un match):

```
(0008,0050) SH [CT-TEST-001] AccessionNumber
(0010,0010) PN [TEST^CT]     PatientName
(0010,0020) LO [TESTCT001]   PatientID
>(0008,0060) CS [CT]         Modality
>(0040,0001) AE [CT01]       ScheduledStationAETitle
>(0040,0002) DA [20260830]   ScheduledProcedureStepStartDate
>(0040,0003) TM [093000]     ScheduledProcedureStepStartTime
>(0040,0007) LO [CT ABDOMEN] ScheduledProcedureStepDescription
>(0040,0009) SH [SPS-CT-001] ScheduledProcedureStepID
```

Coincide exactamente con la tabla de valores esperados de la sección 14.3.
Verificado también para `DX` (`TEST^XRAY` / `XRAY01`) y `US` (`TEST^US` / `US01`).

Contra un servidor real se cambia `--network pacs-lab_default` y el destino:

```bash
docker run --rm dcm4che/dcm4che-tools:5.35.1 findscu -M MWL -b CT_TEST -c WORKLIST@192.168.50.10:11112 -m 00400100.00080060=CT -r PatientName -r AccessionNumber
```

## Registrar los AE Titles de los equipos

Antes de las pruebas con los equipos reales hay que registrar `CT01`, `XRAY01` y
`US01` en DCM4CHEE, desde la UI web: **Configuration → Devices → Create Device**,
con el AE Title, la IP y el puerto DICOM de cada equipo.

Los valores del documento (sección 12) son de ejemplo. Los reales salen del
**DICOM Conformance Statement** de cada equipo. Dos cosas que hay que confirmar
ahí y no asumir:

- El AE Title exacto con el que el equipo se presenta (distingue mayúsculas).
- Si el equipo de rayos X reporta modalidad `DX` o `CR`. Si no coincide, el
  equipo no reconoce su propia worklist.

## Estructura

```
pacs-lab/
├── docker-compose.yml      DCM4CHEE 5.35.1 + PostgreSQL 17 + OpenLDAP
├── mwl/                    plantillas DICOM JSON (sección 9 del documento)
│   ├── mwl-ct-test.json
│   ├── mwl-dx-test.json
│   └── mwl-us-test.json
└── scripts/mwl.js          cliente MWL de línea de comandos
```
