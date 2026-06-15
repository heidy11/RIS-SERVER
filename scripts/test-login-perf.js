const http = require('http');

const postData = JSON.stringify({
  correo: 'test_perf_user@example.com',
  contrasena: 'password123'
});

const registerData = JSON.stringify({
  nombre: 'Test Perf User',
  correo: 'test_perf_user@example.com',
  contraseña: 'password123',
  role: 'user'
});

const options = {
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const registerOptions = {
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(registerData)
  }
};

function makeRequest(opts, data, label) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        console.log(`${label}: ${duration}ms - Status: ${res.statusCode}`);
        if (res.statusCode >= 400) {
            console.log('Error Body:', body);
        }
        resolve({ statusCode: res.statusCode, body, duration });
      });
    });

    req.on('error', (e) => {
      console.error(`problem with request: ${e.message}`);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Starting Performance Test...');

  // 1. Try to register (ignore if exists)
  try {
      await makeRequest(registerOptions, registerData, 'Register');
  } catch (e) {
      console.log('Register failed or user exists');
  }

  // 2. Login
  try {
      await makeRequest(options, postData, 'Login');
  } catch (e) {
      console.error('Login failed', e);
  }
}

run();
