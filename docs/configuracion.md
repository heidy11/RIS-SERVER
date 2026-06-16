# 📘 Guía de Configuración, Instalación y Despliegue

Este documento contiene las instrucciones necesarias para inicializar el entorno de desarrollo y desplegar el backend del sistema RIS en producción, ya sea de forma nativa o a través de Docker.

---

## 📋 Requisitos Previos

*   **Node.js** v20.x o superior.
*   **Yarn** (administrador de paquetes recomendado).
*   **MongoDB** v6.0 o superior (si se ejecuta localmente sin Docker).
*   **Chromium** y bibliotecas del sistema para la ejecución de Puppeteer y WhatsApp Web.

---

## ⚙️ Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del directorio `/server` tomando como referencia el archivo `.env.example`. Las variables principales son:

| Variable | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `MONGO_URI` | `mongodb://localhost:27017/ohif-db` | Cadena de conexión a MongoDB. *(Es sobrescrita automáticamente a `mongodb://mongodb-server:27017/ohif-db` cuando se ejecuta en Docker Compose)* |
| `JWT_SECRET` | `clave-secreta-supersegura` | Semilla criptográfica utilizada para firmar y verificar tokens JWT. |
| `ADMIN_EMAIL` | `Administrador@gmail.com` | Correo del administrador inicial autogenerado durante el primer arranque. |
| `ADMIN_PASSWORD` | `1234Qwer` | Contraseña del administrador inicial. |
| `AUTO_ENVIO` | `false` | Activa (`true`) el servicio en segundo plano de sincronización robusta DICOM hacia el PACS externo. |
| `SYNC_INTERVAL` | `300000` (5 min) | Tiempo de espera en milisegundos entre cada ciclo de sincronización automática. |
| `AUTO_LOGIN` | `false` | Activa (`true`) el script periódico de Puppeteer para auto-loguearse en portales externos. |
| `HOST_DICOM_LOCAL` | `127.0.0.1` | Dirección IP o Host del PACS local de origen (ej. Orthanc o dcm4chee). |
| `PORT_DICOM_LOCAL` | `4242` | Puerto DIMSE del PACS local. |
| `CALLED_AET_DICOM_LOCAL` | `ORTHANC` | AE Title llamado del PACS local. |
| `CALLING_AET_DICOM_LOCAL` | `MYAPP` | AE Title emisor del backend. |
| `HOST_DICOM_EXTERNO` | `192.168.1.100` | Dirección IP o Host del PACS externo de destino. |
| `PORT_DICOM_EXTERNO` | `4242` | Puerto DIMSE del PACS externo. |
| `CALLED_AET_DICOM_EXTERNO`| `EXTERNAL_PACS`| AE Title llamado del PACS externo de destino. |
| `HIS_HL7_HOST` | `127.0.0.1` | IP o Host del sistema HIS receptor de informes HL7. |
| `HIS_HL7_PORT` | `2576` | Puerto del sistema HIS para la recepción MLLP de HL7. |

---

## 🛠️ Instalación y Configuración Local (Sin Docker)

### 1. Instalar Dependencias
Instala los paquetes utilizando Yarn respetando el archivo de bloqueo:
```bash
yarn install --frozen-lockfile
```

### 2. Base de Datos
Asegúrate de tener corriendo tu instancia local de MongoDB. En el primer arranque, el script de conexión inicializará de forma automática:
*   Un usuario con rol de `admin` y con los accesos correspondientes configurados en `.env`.
*   El catálogo básico de modalidades DICOM (`CT`, `MR`, `DX`, `CR`, `US`, `MG`, `PT`, `XA`).
*   La organización principal y la sucursal matriz por defecto.
*   El catálogo de servicios de examen con sus precios asociados (`seedData.js`).

### 3. Ejecutar el Servidor
Para iniciar el servidor en modo de desarrollo con recarga automática:
```bash
yarn dev
```
O de forma directa:
```bash
node server.js
```
El servidor comenzará a escuchar en el puerto `5000` (o el indicado por la variable `PORT`).

---

## 🐳 Levantamiento con Docker Compose

El backend cuenta con soporte nativo para despliegue automatizado en contenedores, aislando tanto la base de datos documental como el entorno de ejecución Node.

### Configuración del Dockerfile
El contenedor de backend (`Dockerfile`) se basa en `node:20-bookworm` e instala herramientas nativas (`build-essential`, `cmake`, `git`, `python3`) para la compilación del módulo nativo DICOM `dicom-dimse-native`, además de instalar Chromium y los paquetes de fuentes necesarios para el correcto funcionamiento de Puppeteer y WhatsApp Web (`wwebjs`).

### Levantar el Entorno Completo (Backend + DB)

Para construir la imagen y encender los servicios en segundo plano:

```bash
docker compose up -d --build
```

### Volúmenes de Persistencia Clave
El archivo `docker-compose.yml` mapea volúmenes físicos para garantizar la persistencia de datos críticos:
*   `./uploads` -> Guarda archivos de orden física y consentimientos de pacientes.
*   `./documents` -> Informes generados y PDFs de resultados diagnósticos.
*   `./temp` -> Archivos DICOM temporales descargados durante la sincronización.
*   `./.wwebjs_auth` y `./.wwebjs_cache` -> Almacenan la sesión activa del código QR de WhatsApp Web para evitar re-autenticar en cada reinicio del contenedor.
*   `mongo_data` -> Volumen interno de Docker para la persistencia absoluta de la base de datos de MongoDB.
