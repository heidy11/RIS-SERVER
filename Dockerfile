# Usar una imagen oficial de Node.js estable como base
FROM node:20-bookworm

# Definir variables de entorno para evitar que Puppeteer descargue su propio Chromium
# y usar la versión instalada a nivel de sistema (más liviana y compatible con Debian)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar dependencias del sistema necesarias para Puppeteer, Chromium y Whatsapp Web
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libgbm1 \
    libasound2 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm-dev \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    build-essential \
    python3 \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

# Crear y establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package.json yarn.lock ./

# Instalar las dependencias de la aplicación utilizando yarn
RUN yarn install --frozen-lockfile

# Copiar el código fuente del servidor
COPY . .

# Crear las carpetas de subidas, documentos y temporales si no existen, y asignar permisos
RUN mkdir -p uploads documents temp && chmod -R 777 uploads documents temp

# Exponer el puerto por defecto en el que corre el servidor (5000)
EXPOSE 5000

# Comando para iniciar la aplicación en modo producción
CMD ["node", "server.js"]
