# 🔌 Integración de la API del Servidor RIS

Este documento describe detalladamente la estructura de endpoints del servidor backend del RIS, detallando cómo se vinculan con el enrutador de Express (`src/routes/ris.route.js`), las cabeceras de autorización requeridas, y los controladores asociados (`src/controllers/ris.controller.js`).

---

## 🔒 Autenticación y Autorización

Todas las rutas del enrutador RIS (`/api/ris/*`) requieren un token de autenticación JWT válido, administrado por el middleware `verifyToken`.

```javascript
// src/routes/ris.route.js
const { verifyToken } = require('../middleware/auth.js');

// Proteger todas las rutas del RIS
router.use(verifyToken);
```

### Cabeceras requeridas en cada petición:
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

---

## 📡 Endpoints del Sistema RIS (Prefijo: `/api/ris`)

A continuación se detalla la correspondencia entre los endpoints descritos en la documentación del frontend y los manejadores reales en el servidor Express.

### 1. Gestión de Pacientes (CRUD)
Permite realizar operaciones de lectura, creación, actualización y eliminación de registros de pacientes.

*   **Obtener listado de pacientes:**
    *   **Ruta:** `GET /api/ris/patients`
    *   **Controlador:** `risController.getPatients`
    *   **Filtro por Sucursal:** Si el usuario autenticado no es `admin`, el servidor filtra automáticamente los pacientes por la sucursal del usuario (`req.user.branch`).
*   **Registrar un nuevo paciente:**
    *   **Ruta:** `POST /api/ris/patients`
    *   **Controlador:** `risController.createPatient`
*   **Actualizar datos de paciente:**
    *   **Ruta:** `PUT /api/ris/patients/:id`
    *   **Controlador:** `risController.updatePatient`
*   **Eliminar un paciente:**
    *   **Ruta:** `DELETE /api/ris/patients/:id`
    *   **Controlador:** `risController.deletePatient`

---

### 2. Gestión de Órdenes y Worklist
Las órdenes representan las citas o estudios agendados en el sistema RIS.

*   **Obtener todas las órdenes:**
    *   **Ruta:** `GET /api/ris/orders`
    *   **Controlador:** `risController.getOrders`
    *   **Comportamiento:** Devuelve la lista ordenada por fecha programada (`scheduledDate: 1`) y puebla la relación con el paciente (`populate('patient')`). Al igual que los pacientes, filtra por la sucursal del usuario no-administrador.
*   **Crear nueva orden:**
    *   **Ruta:** `POST /api/ris/orders`
    *   **Controlador:** `risController.createOrder`
*   **Modificar datos generales de una orden:**
    *   **Ruta:** `PUT /api/ris/orders/:id`
    *   **Controlador:** `risController.updateOrder`
*   **Actualizar el estado de una orden:**
    *   **Ruta:** `PATCH /api/ris/orders/:id/status`
    *   **Controlador:** `risController.updateOrderStatus`
    *   *Payload:* `{ status: 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED' | 'ARRIVED' | etc. }`
*   **Eliminar una orden:**
    *   **Ruta:** `DELETE /api/ris/orders/:id`
    *   **Controlador:** `risController.deleteOrder`
*   **Auto-llegada en Kiosco / Totem:**
    *   **Ruta:** `PATCH /api/ris/orders/:id/totem-arrival`
    *   **Controlador:** `risController.totemArrival`
    *   *Payload:* `{ consentSignature: 'data:image/png;base64,...' }` (Firma digitalizada de consentimiento)

---

### 3. Caja Registradora
Administra las transacciones financieras diarias mediante la apertura y cierre de turnos de caja.

*   **Obtener turnos de caja:**
    *   **Ruta:** `GET /api/ris/cash-register`
    *   **Controlador:** `risController.getCashRegisters`
*   **Apertura de turno de caja:**
    *   **Ruta:** `POST /api/ris/cash-register/open`
    *   **Controlador:** `risController.openCashRegister`
    *   *Payload:* `{ initialAmount: number, notes?: string }`
*   **Cierre de turno de caja:**
    *   **Ruta:** `PUT /api/ris/cash-register/:id/close`
    *   **Controlador:** `risController.closeCashRegister`
    *   *Payload:* `{ actualCash: number, expectedCash: number, notes?: string }`

---

### 4. Informes Radiológicos (Reports)
Endpoints dedicados a la lectura, redacción, firma e integración externa de informes médicos.

*   **Obtener informe por UID del Estudio:**
    *   **Ruta:** `GET /api/ris/reports/:studyInstanceUid`
    *   **Controlador:** `risController.getReportByStudyId`
*   **Guardar / Firmar un informe:**
    *   **Ruta:** `POST /api/ris/reports`
    *   **Controlador:** `risController.saveReport`
    *   *Payload:* `{ studyInstanceUid: string, contentHtml: string, status: 'DRAFT' | 'SIGNED', radiologist: string, orderId?: string }`
    *   *Comportamiento HL7:* Al pasar el estado del reporte a `SIGNED`, el servidor construye de forma automatizada un mensaje HL7 ORU^R01 con los segmentos `MSH`, `PID`, `OBR` y `OBX` y lo transmite al sistema HIS del hospital (`HIS_HL7_HOST` y `HIS_HL7_PORT`).
*   **Obtener lista global de informes:**
    *   **Ruta:** `GET /api/ris/reports`
    *   **Controlador:** `risController.getAllReports`
*   **Marcar / Desmarcar como archivo docente (Teaching File):**
    *   **Ruta:** `PATCH /api/ris/reports/:id/teaching`
    *   **Controlador:** `risController.toggleTeachingFile`
    *   *Payload:* `{ isTeachingFile: boolean, teachingKeywords?: string[], teachingNotes?: string }`
*   **Obtener todos los archivos docentes:**
    *   **Ruta:** `GET /api/ris/teaching-files`
    *   **Controlador:** `risController.getTeachingFiles`

---

### 5. Configuración General del Sistema RIS

*   **Modalidades de Imagen:**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/modalities`
*   **Equipos Médicos:**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/equipment`
    *   **Registrar mantenimiento de equipo:** `POST /api/ris/equipment/:id/maintenance`
        *   *Payload:* `{ date?: Date, description: string, technician: string, cost: number, nextMaintenanceDate?: Date }`
*   **Servicios (Procedimientos Médicos):**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/services`
*   **Sucursales:**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/branches`
*   **Plantillas de Informes (Templates):**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/templates`
*   **Inventario e Insumos:**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/inventory`
*   **Empresas / Aseguradoras:**
    *   `GET` / `POST` / `PUT` / `DELETE` en `/api/ris/companies`
    *   `POST /api/ris/companies/seed` (Poblar catálogo inicial por defecto)

---

### 6. Analíticas, Telemedicina y Carga Laboral

*   **Estadísticas y Dashboard de Analíticas:**
    *   **Ruta:** `GET /api/ris/analytics/stats`
    *   **Controlador:** `risController.getAnalytics`
    *   **Información provista:** Totales acumulados (pacientes, órdenes, informes), órdenes del día, ingresos totales y diarios, distribución de estudios por modalidad y estado de informes, e ítems con stock bajo (crítico).
*   **Distribución de Carga Radiológica (Teleradiología):**
    *   **Ruta:** `GET /api/ris/teleradiology/workload`
    *   **Controlador:** `risController.getRadiologistWorkload`
    *   **Uso:** Carga laboral y balanceo en base a informes en borrador (`DRAFT`) e informes firmados hoy (`SIGNED`) para optimizar el flujo de telemedicina.

---

## 📁 Endpoints Fuera del Prefijo RIS (Globales en `/api`)

### 1. Gestión de Organizaciones (OIDs)
Administrado en `src/routes/organization.route.js` y expuesto en:
*   `GET` / `POST` / `PATCH` / `DELETE` en `/api/organizations`

### 2. Gestión y Subida de Archivos Adjuntos (Historial Clínico Externo)
Administrado en `src/routes/upload.route.js` y expuesto bajo el prefijo `/api/subida`:

*   **Subir Archivo Adjunto (Multipart Form Data):**
    *   **Ruta:** `POST /api/subida/upload`
    *   **Body (FormData):** `file` (archivo físico), `paciente` (nombre del paciente normalizado).
*   **Listar Archivos del Paciente:**
    *   **Ruta:** `GET /api/subida/files/:paciente`
    *   **Respuesta:** Array con metadatos del archivo (nombre, tamaño, fecha de subida, extensión).
*   **Descargar Archivo:**
    *   **Ruta:** `GET /api/subida/files/download/:filename`
*   **Eliminar Archivo Adjunto:**
    *   **Ruta:** `DELETE /api/subida/files/:filename`
