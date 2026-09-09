
const fs = require('fs');
const path = require('path');

const BASE_URL = (process.env.DCM4CHEE_BASE_URL || 'http://localhost:8080/dcm4chee-arc').replace(
  /\/+$/,
  ''
);
const AET = process.env.DCM4CHEE_AET || 'DCM4CHEE';
const MWL_AET = process.env.DCM4CHEE_MWL_AET || 'WORKLIST';
const TOKEN = process.env.DCM4CHEE_TOKEN || '';

const RS = `${BASE_URL}/aets/${AET}/rs`;       
const MWL = `${BASE_URL}/aets/${MWL_AET}/rs`; 
const MWL_DIR = path.join(__dirname, '..', 'mwl');
const TEST_FILES = ['mwl-ct-test.json', 'mwl-dx-test.json', 'mwl-us-test.json'];

function tag(ds, key) {
  const el = ds && ds[key];
  if (!el || !el.Value || !el.Value.length) return '';
  const v = el.Value[0];
  return typeof v === 'object' ? v.Alphabetic || '' : String(v);
}

function spsTag(ds, key) {
  const sq = ds && ds['00400100'];
  if (!sq || !sq.Value || !sq.Value.length) return '';
  return tag(sq.Value[0], key);
}

function todayDA(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function retargetToToday(ds) {
  const sq = ds['00400100'];
  if (sq && sq.Value && sq.Value.length) {
    sq.Value[0]['00400002'] = { vr: 'DA', Value: [todayDA()] };
  }
  return ds;
}


async function request(method, url, body, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (err) {
    throw new Error(`No se pudo conectar a ${url}\n  ${err.message}`);
  }

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
    }
  }
  return { status: res.status, ok: res.ok, text, json };
}

function fail(msg) {
  console.error(`\n  ERROR  ${msg}\n`);
  process.exit(1);
}


async function cmdPing() {
  console.log(`Archivo:  ${RS}`);
  console.log(`Worklist: ${MWL}`);
  const res = await request('GET', `${MWL}/mwlitems/count`);
  if (!res.ok) fail(`HTTP ${res.status} al consultar /mwlitems/count\n  ${res.text.slice(0, 400)}`);
  const count = res.json && res.json.count !== undefined ? res.json.count : '?';
  console.log(`Estado:   OK — DCM4CHEE responde`);
  console.log(`Worklist: ${count} entrada(s) programada(s)`);
}

async function ensurePatient(ds) {
  const patient = {};
  for (const key of ['00100010', '00100020', '00100030', '00100040']) {
    if (ds[key]) patient[key] = ds[key];
  }
  const res = await request(
    'POST',
    `${RS}/patients`,
    JSON.stringify(patient),
    'application/dicom+json'
  );
  if (!res.ok) {
    fail(
      `HTTP ${res.status} al dar de alta al paciente ${tag(ds, '00100020')}\n  ` +
        res.text.slice(0, 400)
    );
  }
}

async function cmdCreate(file, { today = false } = {}) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) fail(`No existe el archivo ${abs}`);

  let ds;
  try {
    ds = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    fail(`El archivo no es JSON valido: ${err.message}`);
  }
  if (today) retargetToToday(ds);

  // DCM4CHEE rechaza la entrada MWL si el paciente no existe. Es idempotente.
  await ensurePatient(ds);

  const res = await request(
    'POST',
    `${MWL}/mwlitems`,
    JSON.stringify(ds),
    'application/dicom+json'
  );
  if (!res.ok) {
    fail(
      `HTTP ${res.status} al crear la entrada MWL desde ${path.basename(abs)}\n  ` +
        res.text.slice(0, 600)
    );
  }
  console.log(
    `  OK  ${String(res.status).padEnd(3)}  ${tag(ds, '00100010').padEnd(12)} ` +
      `Acc=${tag(ds, '00080050').padEnd(14)} ` +
      `${spsTag(ds, '00080060')}@${spsTag(ds, '00400001')} ` +
      `${spsTag(ds, '00400002')} ${spsTag(ds, '00400003')}`
  );
  return ds;
}

async function cmdList(filters) {
  const qs = new URLSearchParams({ limit: '100', includefield: 'all' });
  // Los filtros del SPS se referencian con notacion punteada: Secuencia.Tag
  if (filters.modality) qs.set('00400100.00080060', filters.modality);
  if (filters.aet) qs.set('00400100.00400001', filters.aet);
  if (filters.date) qs.set('00400100.00400002', filters.date);

  const res = await request('GET', `${MWL}/mwlitems?${qs}`);
  if (res.status === 204) {
    console.log('Sin entradas MWL que coincidan con el filtro.');
    return [];
  }
  if (!res.ok) fail(`HTTP ${res.status} al listar\n  ${res.text.slice(0, 400)}`);

  const items = res.json || [];
  console.log(`\n${items.length} entrada(s) en la worklist:\n`);
  const head = [
    'PatientName'.padEnd(14),
    'PatientID'.padEnd(11),
    'Accession'.padEnd(14),
    'Mod'.padEnd(4),
    'StationAET'.padEnd(11),
    'Fecha'.padEnd(9),
    'Hora'.padEnd(7),
    'SPS ID'.padEnd(12),
    'Descripcion',
  ].join(' ');
  console.log(head);
  console.log('-'.repeat(head.length + 12));

  for (const it of items) {
    console.log(
      [
        tag(it, '00100010').padEnd(14),
        tag(it, '00100020').padEnd(11),
        tag(it, '00080050').padEnd(14),
        spsTag(it, '00080060').padEnd(4),
        spsTag(it, '00400001').padEnd(11),
        spsTag(it, '00400002').padEnd(9),
        spsTag(it, '00400003').padEnd(7),
        spsTag(it, '00400009').padEnd(12),
        spsTag(it, '00400007'),
      ].join(' ')
    );
  }
  console.log();
  for (const it of items) {
    console.log(`  StudyInstanceUID  ${tag(it, '0020000D')}   SPS ${spsTag(it, '00400009')}`);
  }
  console.log();
  return items;
}

async function cmdDelete(studyUid, spsId) {
  const res = await request('DELETE', `${MWL}/mwlitems/${studyUid}/${spsId}`);
  if (!res.ok) {
    // Se lanza en vez de abortar, para que 'purge' siga con las demas
    throw new Error(
      `HTTP ${res.status} al borrar ${studyUid}/${spsId}\n  ${res.text.slice(0, 400)}`
    );
  }
  console.log(`  OK  ${res.status}  borrado ${spsId}`);
}

async function cmdSeed() {
  console.log(`Creando entradas de prueba con fecha ${todayDA()} en ${RS}\n`);
  for (const f of TEST_FILES) {
    await cmdCreate(path.join(MWL_DIR, f), { today: true });
  }
  console.log('\nListo. Verificar con:  node scripts/mwl.js list');
}

async function cmdPurge() {
  for (const f of TEST_FILES) {
    const ds = JSON.parse(fs.readFileSync(path.join(MWL_DIR, f), 'utf8'));
    const studyUid = tag(ds, '0020000D');
    const spsId = spsTag(ds, '00400009');
    try {
      await cmdDelete(studyUid, spsId);
    } catch {
      console.log(`  --  ${spsId} no existia`);
    }
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseFlags(argv);

  switch (cmd) {
    case 'ping':
      return cmdPing();
    case 'seed':
      return cmdSeed();
    case 'create':
      if (!rest[0]) fail('Falta el archivo JSON.  Uso: mwl.js create <archivo.json> [--today 1]');
      return cmdCreate(rest[0], { today: flags.today !== undefined });
    case 'list':
      return cmdList(flags);
    case 'delete':
      if (rest.length < 2) fail('Uso: mwl.js delete <studyInstanceUID> <spsID>');
      return cmdDelete(rest[0], rest[1]);
    case 'purge':
      return cmdPurge();
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
      process.exit(cmd ? 1 : 0);
  }
}

main().catch(err => fail(err.message));
