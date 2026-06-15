// puppeteerLogin.js
require('dotenv').config();
const puppeteer = require('puppeteer');

async function performLogin(page) {
  const TARGET_URL = process.env.TARGET_URL || 'https://example.com/login';
  const EMAIL = process.env.EMAIL || 'tu@correo.com';
  const PASSWORD = process.env.PASSWORD || 'tuPassword';

  // Selectores comunes: cámbialos según la página real
  const SELECTOR_EMAIL =
    process.env.SELECTOR_EMAIL || 'input[type="email"], input[name="email"], input#email';
  const SELECTOR_PASSWORD =
    process.env.SELECTOR_PASSWORD ||
    'input[type="password"], input[name="password"], input#password';
  const SELECTOR_SUBMIT =
    process.env.SELECTOR_SUBMIT || 'button[type="submit"], input[type="submit"], button.login';

  const SELECTOR_LOGGED_IN = process.env.SELECTOR_LOGGED_IN || '.logged-in'; // Cambia esto por un selector que indique que ya estás logueado

  try {
    // Ir a la URL
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 60000 });

    // Asegúrate de que la página se haya cargado completamente antes de buscar elementos
    await page.waitForSelector(SELECTOR_EMAIL, { timeout: 15000 });

    // Verificar si ya estamos logueados (si existe un selector que indique que ya estás autenticado)
    const isLoggedIn = await page.$(SELECTOR_LOGGED_IN);
    if (isLoggedIn) {
      console.log('Ya estás autenticado.');
      return;
    }

    // Si no está logueado, realizar el login
    console.log('No autenticado. Iniciando sesión...');

    // Esperar y escribir email
    await page.click(SELECTOR_EMAIL, { clickCount: 3 });
    await page.type(SELECTOR_EMAIL, EMAIL, { delay: 50 });

    // Esperar y escribir password
    await page.waitForSelector(SELECTOR_PASSWORD, { timeout: 10000 });
    await page.click(SELECTOR_PASSWORD, { clickCount: 3 });
    await page.type(SELECTOR_PASSWORD, PASSWORD, { delay: 50 });

    // Pulsar submit (intenta varios métodos)
    try {
      await page.click(SELECTOR_SUBMIT);
    } catch (err) {
      // Si no encuentra el botón, enviar Enter desde el campo password
      await page.focus(SELECTOR_PASSWORD);
      await page.keyboard.press('Enter');
    }

    // Esperar a navegación o algún selector que confirme login
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    console.log('Login completado exitosamente.');
  } catch (error) {
    console.error('Error en el script:', error);
  }
}

async function startLoginProcess() {
  const browser = await puppeteer.launch({
    headless: true, // ver el navegador; poner true para headless
    defaultViewport: { width: 1200, height: 800 },
    args: [
      '--no-sandbox', // Desactivar sandboxing (por motivos de seguridad, solo en entornos controlados)
      '--disable-setuid-sandbox', // Desactivar setuid sandbox
      '--disable-gpu', // Desactivar el uso de GPU, en servidores sin GPU dedicado
      '--remote-debugging-port=9222', // Habilitar el puerto de depuración remota si es necesario
    ],
  });

  try {
    const page = await browser.newPage();

    // Realizar el primer login
    await performLogin(page);

    // Configurar el script para que se ejecute cada 5 minutos (300,000 ms)
    setInterval(
      async () => {
        try {
          console.log('Refrescando página cada 5 minutos...');

          // Intentar recargar la página con un tiempo de espera más largo (10 minutos)
          await page.reload({ waitUntil: 'networkidle2' }); // Timeout aumentado a 10 minutos

          console.log('Verificando si es necesario volver a autenticar...');

          try {
            // Verificar si el selector de email está presente
            const emailField = await page.$(
              process.env.SELECTOR_EMAIL || 'input[type="email"], input[name="email"], input#email'
            );

            // Si no encontramos el campo de email, no hacemos nada
            if (!emailField) {
              console.log('Campo de correo electrónico no encontrado, no se realizará login.');
              return; // No hacer nada si el campo no está disponible
            }

            // Si el campo de correo electrónico existe, proceder con el login
            await performLogin(page);
          } catch (err) {
            console.error('Error al verificar el campo de correo electrónico:', err);
          }
        } catch (error) {
          console.error('Error al recargar la página:', error);
        }
      },
      5 * 60 * 1000
    ); // 5 minutos
  } catch (error) {
    console.error('Error en el proceso de login repetido:', error);
  }
}

module.exports = startLoginProcess;
