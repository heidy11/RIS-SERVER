# 🧩 Mapeo de Controladores, Rutas y Modelos

Este documento detalla el inventario completo de controladores, enrutadores y modelos de base de datos que componen el backend de MedService.

---

## 📋 Tabla Resumen de Enrutadores (`src/routes/`)

Todas las rutas son expuestas a través del prefijo global `/api` configurado en `server.js` (con excepción del middleware de logs). A continuación se detalla su distribución:

| Prefijo de Ruta | Archivo de Ruta | Controlador Asociado | Propósito Operativo |
| :--- | :--- | :--- | :--- |
| `/api/ris` | `ris.route.js` | `ris.controller.js` | Gestión integral del RIS (CRUD de órdenes, pacientes, plantillas, insumos, caja y balances). |
| `/api/dicom` | `dicom.route.js` | `dicom.controller.js`, `imageToDicom.controller.js`, `dicomLocalSend.controller.js` | Consulta PACS, almacenamiento DICOM, conversión de archivos JPG/PNG/PDF/MP4 a DICOM, y sincronización periódica DIMSE. |
| `/api/subida` | `upload.route.js` | `upload.controller.js` | Carga de archivos físicos adjuntos (PDFs de exámenes, consentimientos), listado por paciente y descargas en ZIP. |
| `/api/auth` | `auth.route.js` | `auth.service.js` | Autenticación de usuarios (login, registro y cierre de sesión). |
| `/api/usuarios` | `user.route.js` | `user.service.js` | Gestión administrativa de usuarios, roles, privilegios y accesos a sucursales. |
| `/api/pacientes`| `patient.route.js`| `patient.service.js` | Operaciones básicas y búsquedas indexadas sobre el padrón de pacientes. |
| `/api/documentos`| `document.route.js`| `document.controller.js` | Generación y almacenamiento estático de documentos e informes en PDF. |
| `/api/whatsapp` | `whatsapp.route.js`| `whatsapp.service.js` | Envío manual y automático de notificaciones a través de la API de WhatsApp Web. |
| `/api/organizations`| `organization.route.js`| (Varios) | Gestión de identificadores OID para instituciones. |
| `/api/branches` | `branch.routes.js` | (Varios) | Gestión de sedes físicas (sucursales). |
| `/api/services` | `service.routes.js` | (Varios) | Catálogo de precios y nomenclatura de exámenes médicos por sede. |
| `/api/equipments`| `equipment.routes.js`| (Varios) | Catálogo y control de equipamiento médico del centro. |

---

## ⚙️ Controladores Clave (`src/controllers/`)

### 1. Controlador RIS (`ris.controller.js`)
Administra toda la lógica transaccional del RIS:
*   **Seguridad por Sucursal:** Filtra automáticamente el retorno de pacientes, órdenes, informes e inventarios de acuerdo a la sucursal del usuario logueado (`req.user.branch`) si no es administrador global.
*   **Firma del Informe:** Al guardar un reporte con estado `SIGNED`, bloquea futuras modificaciones e invoca automáticamente la construcción y despacho del mensaje HL7 ORU^R01.
*   **Arqueo de Caja:** Controla la apertura y cierre de la caja de transacciones diarias por operador, calculando discrepancias entre el efectivo teórico y el real.

### 2. Sincronización DICOM (`dicomLocalSend.controller.js`)
Gestiona el transporte robusto de imágenes entre PACS:
*   **DIMSE Nativo:** Implementa peticiones de red DICOM nativas (`C-FIND`, `C-ECHO`, `C-STORE`) a través de la biblioteca `dcmjs-dimse`.
*   **Sincronización Inteligente:** Compara la cantidad de instancias del estudio en el PACS de origen local versus el de destino externo. Si difieren o no existe de manera remota, descarga por WADO-URI y envía vía `C-STORE`.

### 3. Conversor de Archivos (`imageToDicom.controller.js`)
*   Recibe archivos multimedia tradicionales (JPEG, PNG, PDF, MP4).
*   Inyecta metadatos DICOM obligatorios del paciente y del estudio.
*   Devuelve un archivo binario `.dcm` válido para su almacenamiento en el PACS local.

---

## 🗃️ Modelos de Base de Datos Mongoose (`src/models/`)

El servidor utiliza **22 esquemas** en MongoDB para organizar la información:

| Modelo / Colección | Archivo Mongoose | Propósito de Datos |
| :--- | :--- | :--- |
| **`RisPatient`** | `RisPatient.js` | Información demográfica simplificada para el panel RIS. |
| **`RisOrder`** | `RisOrder.js` | Datos del estudio agendado, sucursal, ID de acceso, estado del examen y pago. |
| **`RisReport`** | `RisReport.js` | Informe radiológico redactado en HTML, firma, radiólogo a cargo y flag docente. |
| **`RisTemplate`** | `RisTemplate.js` | Plantillas de informes en HTML categorizadas por modalidad. |
| **`RisInventory`** | `RisInventory.js` | Control de stock, costo y alertas de insumos (ej. contraste, jeringas, placas). |
| **`RisCashRegister`** | `RisCashRegister.js`| Historial de transacciones de caja, estados (abierta/cerrada) e importes. |
| **`RisCompany`** | `RisCompany.js` | Lista de convenios empresariales y aseguradoras habilitadas. |
| **`User`** | `user.model.js` | Credenciales de usuario, rol administrativo/médico y permisos de vistas. |
| **`Branch`** | `branch.model.js` | OID, nombre y datos geográficos de cada sede de atención médica. |
| **`Service`** | `service.model.js` | Procedimientos radiológicos y aranceles de facturación. |
| **`Equipment`** | `equipment.model.js` | Máquinas radiológicas, historiales de costo y fecha de mantenimiento programado. |
| **`Modality`** | `modality.model.js` | Códigos DICOM estándar de las modalidades (CT, MR, US, DX, etc.). |
| **`Logs`** | `logs.model.js` | Historial de auditoría interna de acciones realizadas en el servidor. |
| **`Organization`** | `organization.model.js`| OID y datos fiscales del holding o grupo médico principal. |
