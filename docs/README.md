# 📚 Documentación Técnica del Servidor Backend (RIS & Viewer)

Bienvenido a la documentación oficial del servidor backend de **MedService**. Este componente es una API REST robusta construida con Node.js, Express y MongoDB, encargada de orquestar la lógica de negocio del Sistema de Información Radiológica (RIS), la transferencia de imágenes médicas DICOM, y la comunicación externa de citas e informes diagnósticos.

---

## 📂 Estructura de la Documentación

La documentación técnica del servidor está organizada de la siguiente manera:

| Documento | Contenido | Destinatarios |
| :--- | :--- | :--- |
| [📘 Guía de Instalación y Despliegue](./configuracion.md) | Pasos para configurar variables de entorno, levantar el servidor de forma local o mediante Docker Compose, persistencia de volúmenes y seeding. | Desarrolladores Backend, DevOps, Administradores |
| [🏗️ Arquitectura y Flujo de Datos](./arquitectura.md) | Flujo general del sistema, interacción con el PACS local/externo, seguridad de token JWT, y lógica en segundo plano. | Arquitectos de Software, Desarrolladores Fullstack |
| [🧩 Mapeo de Controladores y Modelos](./componentes.md) | Inventario y descripción detallada de rutas HTTP, controladores principales y los 22 modelos de Mongoose. | Desarrolladores Backend |
| [🔌 Integración de la API](./api_integracion.md) | Documentación técnica exhaustiva de los endpoints consumidos por el cliente (Pacientes, Cajas, Órdenes, Archivos, Informes). | Desarrolladores Frontend e Integradores |

---

## ⚡ Funcionalidades Clave del Servidor

*   **Sincronización Automática DICOM (Robust Sync):** Servicio en segundo plano que monitoriza estudios recientes locales y los transmite a un PACS remoto mediante comandos nativos DIMSE (`C-STORE`).
*   **Mensajería de Interoperabilidad HL7:** Generación automática de mensajes estándar `ORU^R01` (informes firmados) y envío en tiempo real a sistemas HIS de terceros.
*   **Integración de WhatsApp Web:** Motor automatizado que permite enviar enlaces de visualización y alertas de citas directamente al dispositivo del paciente.
*   **Carga y Compresión de Adjuntos:** Middleware para procesar PDFs de exámenes externos, recetas o consentimientos informados firmados digitalmente.
*   **Inicialización Segura (DB Seeder):** Poblado automático al arranque con un administrador por defecto, sucursales base, y catálogos de modalidades y aranceles médicos.
