// Carga las plantillas de informe radiológico de uso diario (TC, RX y ECO).
// Solo agrega las que no existen (por nombre + modalidad): nunca modifica una
// plantilla que el radiólogo ya haya creado o editado.
//
// Uso:  node scripts/seed-plantillas-informes.js           (usa MONGO_URI del .env)
//       node scripts/seed-plantillas-informes.js --listar  (solo muestra qué haría)
//
// El editor de informes del visor es un cuadro de texto simple, por eso las
// plantillas son texto con secciones en mayúsculas y saltos de línea.
// Describen hallazgos NORMALES: el radiólogo cambia lo que corresponda.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const RisTemplate = require('../src/models/RisTemplate');

const informe = (tecnica, hallazgos, impresion) =>
  `TÉCNICA:\n${tecnica}\n\nHALLAZGOS:\n${hallazgos.join('\n')}\n\nIMPRESIÓN DIAGNÓSTICA:\n${impresion}`;

const PLANTILLAS = [
  // ── Tomografía (CT) ──────────────────────────────────────────────
  {
    name: 'TC Cráneo simple - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de cráneo sin contraste endovenoso, con cortes axiales desde la base del cráneo hasta el vértex y reconstrucciones multiplanares.',
      [
        'Parénquima cerebral de densidad conservada, con adecuada diferenciación entre sustancia gris y sustancia blanca.',
        'No se observan colecciones intra ni extraaxiales, hemorragias ni lesiones ocupantes de espacio.',
        'Sistema ventricular de tamaño, forma y posición normales. Línea media centrada.',
        'Surcos corticales y cisternas basales de amplitud conservada para la edad.',
        'Fosa posterior sin alteraciones. Tronco encefálico y cerebelo de aspecto normal.',
        'Calota y base de cráneo sin trazos de fractura. Senos paranasales y celdillas mastoideas neumatizados.',
      ],
      'Tomografía de cráneo simple sin alteraciones evidentes.'
    ),
  },
  {
    name: 'TC Tórax - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de tórax con cortes axiales desde los vértices pulmonares hasta las bases, con ventanas para parénquima pulmonar y mediastino.',
      [
        'Parénquima pulmonar de atenuación conservada, sin consolidaciones, nódulos ni masas.',
        'Árbol traqueobronquial permeable, de calibre normal.',
        'No se observa derrame pleural ni neumotórax.',
        'Mediastino centrado. No se identifican adenopatías mediastinales ni hiliares de tamaño significativo.',
        'Corazón de tamaño normal. Grandes vasos de calibre conservado. Sin derrame pericárdico.',
        'Estructuras óseas de la pared torácica sin lesiones agudas.',
      ],
      'Tomografía de tórax sin alteraciones evidentes.'
    ),
  },
  {
    name: 'TC Abdomen y pelvis - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de abdomen y pelvis con cortes axiales desde las cúpulas diafragmáticas hasta la sínfisis del pubis y reconstrucciones multiplanares.',
      [
        'Hígado de tamaño, forma y densidad normales, sin lesiones focales. Vía biliar intra y extrahepática no dilatada.',
        'Vesícula biliar de paredes finas, sin litiasis evidente.',
        'Páncreas, bazo y glándulas suprarrenales sin alteraciones.',
        'Riñones de tamaño y posición normales, sin litiasis ni dilatación de los sistemas colectores.',
        'Asas intestinales de calibre y distribución normales. No se observa líquido libre ni colecciones.',
        'Vejiga de paredes regulares. Órganos pélvicos sin alteraciones evidentes.',
        'No se identifican adenopatías retroperitoneales ni pélvicas. Estructuras óseas sin lesiones agudas.',
      ],
      'Tomografía de abdomen y pelvis sin alteraciones evidentes.'
    ),
  },
  {
    name: 'TC Columna lumbar - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de columna lumbar con cortes axiales y reconstrucciones sagitales y coronales.',
      [
        'Alineación vertebral conservada. Lordosis lumbar fisiológica.',
        'Cuerpos vertebrales de altura y densidad normales, sin trazos de fractura.',
        'Espacios intervertebrales de altura conservada. No se observan protrusiones ni hernias discales significativas.',
        'Canal raquídeo y forámenes de conjunción de amplitud normal.',
        'Articulaciones facetarias y elementos posteriores sin alteraciones.',
        'Partes blandas paravertebrales sin alteraciones.',
      ],
      'Tomografía de columna lumbar sin alteraciones evidentes.'
    ),
  },
  {
    name: 'TC Columna cervical - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de columna cervical desde la unión cráneo-cervical hasta T1, con reconstrucciones sagitales y coronales.',
      [
        'Alineación vertebral conservada. Lordosis cervical fisiológica.',
        'Unión cráneo-cervical y articulación atlanto-axoidea sin alteraciones.',
        'Cuerpos vertebrales de altura normal, sin trazos de fractura ni luxaciones.',
        'Espacios intervertebrales conservados. Canal raquídeo de amplitud normal.',
        'Partes blandas prevertebrales de espesor normal.',
      ],
      'Tomografía de columna cervical sin alteraciones evidentes.'
    ),
  },
  {
    name: 'TC Senos paranasales - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de senos paranasales con cortes axiales y reconstrucciones coronales.',
      [
        'Senos maxilares, etmoidales, frontales y esfenoidales adecuadamente neumatizados, sin engrosamiento mucoso ni niveles hidroaéreos.',
        'Complejos osteomeatales permeables.',
        'Tabique nasal centrado. Cornetes de tamaño normal.',
        'Estructuras óseas sin lesiones.',
      ],
      'Tomografía de senos paranasales sin alteraciones evidentes.'
    ),
  },
  {
    name: 'Urotomografía (TC sin contraste) - normal',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de abdomen y pelvis sin contraste, protocolo para litiasis urinaria.',
      [
        'Riñones de tamaño, forma y posición normales.',
        'No se observan imágenes cálcicas en el trayecto de los riñones, uréteres ni vejiga.',
        'Sistemas colectores y uréteres sin dilatación.',
        'Vejiga de paredes regulares, sin contenido anormal.',
        'Grasa perirrenal sin cambios inflamatorios.',
      ],
      'Sin evidencia tomográfica de litiasis ni uropatía obstructiva.'
    ),
  },
  {
    name: 'TC Cráneo - traumatismo (plantilla de trabajo)',
    modality: 'CT',
    contentHtml: informe(
      'Tomografía computada de cráneo sin contraste endovenoso por antecedente de traumatismo craneoencefálico.',
      [
        'Partes blandas epicraneales: [sin alteraciones / hematoma subgaleal en región ___].',
        'Calota y base de cráneo: [sin trazos de fractura / fractura ___].',
        'Colecciones extraaxiales: [no se observan / hematoma ___ de ___ mm de espesor].',
        'Parénquima cerebral: [sin contusiones ni hemorragias / ___].',
        'Sistema ventricular y línea media: [conservados / desplazamiento de ___ mm].',
        'Cisternas basales: [permeables / ___].',
      ],
      '[Sin lesiones traumáticas intracraneales agudas / ___].'
    ),
  },

  // ── Radiología convencional (DX) ─────────────────────────────────
  {
    name: 'RX Columna lumbar - normal',
    modality: 'DX',
    contentHtml: informe(
      'Radiografía de columna lumbar en proyecciones anteroposterior y lateral.',
      [
        'Alineación vertebral conservada. Lordosis lumbar fisiológica.',
        'Cuerpos vertebrales de altura y densidad normales.',
        'Espacios intervertebrales conservados.',
        'Pedículos y elementos posteriores sin alteraciones.',
        'Articulaciones sacroilíacas de aspecto normal.',
      ],
      'Radiografía de columna lumbar sin alteraciones evidentes.'
    ),
  },
  {
    name: 'RX Abdomen simple - normal',
    modality: 'DX',
    contentHtml: informe(
      'Radiografía simple de abdomen en proyección anteroposterior.',
      [
        'Distribución del gas intestinal dentro de límites normales, sin dilatación de asas ni niveles hidroaéreos.',
        'No se observan calcificaciones patológicas ni imágenes de litiasis.',
        'Sombras renales y psoas visibles y de contornos normales.',
        'Estructuras óseas sin alteraciones.',
      ],
      'Radiografía de abdomen sin alteraciones evidentes.'
    ),
  },
  {
    name: 'RX Extremidad - normal',
    modality: 'DX',
    contentHtml: informe(
      'Radiografía de [segmento] [derecho/izquierdo] en dos proyecciones.',
      [
        'Estructuras óseas de densidad y morfología normales.',
        'No se observan trazos de fractura ni luxaciones.',
        'Espacios articulares conservados.',
        'Partes blandas sin alteraciones.',
      ],
      'Radiografía de [segmento] sin alteraciones evidentes.'
    ),
  },

  // ── Ecografía (US) ───────────────────────────────────────────────
  {
    name: 'ECO Abdomen superior - normal',
    modality: 'US',
    contentHtml: informe(
      'Ecografía de abdomen superior en tiempo real con transductor convexo.',
      [
        'Hígado de tamaño normal, ecogenicidad homogénea, sin lesiones focales. Vía biliar no dilatada.',
        'Vesícula biliar de paredes finas, contenido anecoico, sin litiasis.',
        'Páncreas visible de ecoestructura conservada.',
        'Bazo de tamaño y ecoestructura normales.',
        'Riñones de tamaño y posición normales, con adecuada diferenciación córtico-medular, sin litiasis ni hidronefrosis.',
        'No se observa líquido libre en cavidad.',
      ],
      'Ecografía de abdomen superior sin alteraciones evidentes.'
    ),
  },
  {
    name: 'ECO Renal y vesical - normal',
    modality: 'US',
    contentHtml: informe(
      'Ecografía renal y vesical en tiempo real.',
      [
        'Riñón derecho de ___ mm de eje longitudinal, contornos regulares, parénquima de espesor conservado, sin litiasis ni hidronefrosis.',
        'Riñón izquierdo de ___ mm de eje longitudinal, contornos regulares, parénquima de espesor conservado, sin litiasis ni hidronefrosis.',
        'Vejiga con adecuada repleción, paredes finas y contenido anecoico.',
      ],
      'Ecografía renal y vesical sin alteraciones evidentes.'
    ),
  },
  {
    name: 'ECO Obstétrica - primer trimestre',
    modality: 'US',
    contentHtml: informe(
      'Ecografía obstétrica [transabdominal/transvaginal].',
      [
        'Útero grávido con saco gestacional único, intrauterino, de contornos regulares.',
        'Embrión único con longitud cráneo-caudal (LCC) de ___ mm, que corresponde a ___ semanas y ___ días.',
        'Frecuencia cardíaca embrionaria de ___ latidos por minuto.',
        'Vesícula vitelina presente, de aspecto normal.',
        'Anexos sin alteraciones. No se observa líquido libre en fondo de saco.',
      ],
      'Gestación única intrauterina de ___ semanas y ___ días por LCC, con actividad cardíaca presente.'
    ),
  },
];

async function main() {
  const soloListar = process.argv.includes('--listar');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Falta MONGO_URI en el .env');
  await mongoose.connect(uri);

  let agregadas = 0;
  for (const p of PLANTILLAS) {
    const existe = await RisTemplate.exists({ name: p.name, modality: p.modality });
    if (existe) {
      console.log(`  ya existe  ${p.modality} | ${p.name}`);
      continue;
    }
    if (!soloListar) await RisTemplate.create(p);
    agregadas++;
    console.log(`  ${soloListar ? 'agregaría' : 'agregada '} ${p.modality} | ${p.name}`);
  }
  console.log(`${soloListar ? 'Se agregarían' : 'Plantillas agregadas'}: ${agregadas} de ${PLANTILLAS.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
