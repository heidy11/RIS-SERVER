// const fs = require('fs');
// const path = require('path');
// const { Document, Packer, Paragraph, TextRun } = require('docx');

// const generateDocx = async ({ nombre, descripcion, fecha }) => {
//   console.log(nombre, descripcion, fecha);
//   const doc = new Document({
//     sections: [
//       {
//         children: [
//           new Paragraph({ children: [new TextRun({ text: `Nombre: ${nombre}`, bold: true })] }),
//           new Paragraph({ children: [new TextRun(`Fecha: ${fecha}`)] }),
//           new Paragraph({ children: [new TextRun(`Descripción: ${descripcion}`)] }),
//         ],
//       },
//     ],
//   });

//   const buffer = await Packer.toBuffer(doc);
//   const filename = ` ${nombre}.docx`;
//   const filePath = path.join(__dirname, '../..', 'documents', filename);

//   fs.writeFileSync(filePath, buffer);

//   return { filename, filePath };
// };

// module.exports = generateDocx;
const fs = require('fs');
const path = require('path');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
const PizZip = require('pizzip');
const HTMLtoDOCX = require('@turbodocx/html-to-docx');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');

const generateDocx = async ({ nombre, descripcion, fecha }) => {
  console.log(nombre, descripcion, fecha);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240, // Tamaño carta en puntos (8.5 x 11 pulgadas)
              height: 15840,
            },
            margin: {
              top: 720, // Margen superior en puntos
              right: 720, // Margen derecho en puntos
              bottom: 720, // Margen inferior en puntos
              left: 720, // Margen izquierdo en puntos
            },
          },
        },
        children: [
          // Título
          new Paragraph({
            children: [
              new TextRun({
                text: 'Documento de Información',
                bold: true,
                size: 32, // Tamaño de fuente grande para el título
              }),
            ],
            alignment: AlignmentType.CENTER, // Centrado del título
            spacing: {
              after: 400, // Espacio después del título
            },
          }),

          // Nombre
          new Paragraph({
            children: [
              new TextRun({
                text: `NOMBRE: ${nombre}`,
                bold: true,
                size: 24, // Tamaño de fuente
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: {
              after: 200, // Espacio después del nombre
            },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `ESTUDIO: ${nombre}`,
                bold: true,
                size: 24, // Tamaño de fuente
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: {
              after: 200, // Espacio después del nombre
            },
          }),

          // Fecha
          new Paragraph({
            children: [
              new TextRun({
                text: `FECHA: ${fecha}`,
                size: 24,
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: {
              after: 200, // Espacio después de la fecha
            },
          }),

          // Descripción
          new Paragraph({
            children: [
              new TextRun({
                text: `Descripción: ${descripcion}`,
                size: 24,
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: {
              after: 400, // Espacio después de la descripción
            },
          }),

          // Firma o detalles adicionales
          new Paragraph({
            children: [
              new TextRun({
                text: 'Firma:',
                bold: true,
                size: 24,
              }),
              new TextRun({
                text: ` ______________________`,
                size: 24,
              }),
            ],
            alignment: AlignmentType.CENTER, // Cambié el valor de LEFT a CENTER para centrar el contenido
            spacing: {
              after: 1000, // Espacio después de la firma
            },
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `${nombre}.docx`; // El nombre del archivo será igual al de la persona
  const dirPath = path.join(__dirname, '../..', 'documents');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const filePath = path.join(dirPath, filename);

  // Guardar el documento generado
  fs.writeFileSync(filePath, buffer);

  return { filename, filePath };
};
const base64Regex = /^(?:data:)?image\/(png|jpg|jpeg|svg|svg\+xml);base64,/;
const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// Función para convertir Base64 a Buffer

// Función para generar el documento DOCX
const generateDocxFromTemplate = async ({
  nombre,
  estudio,
  descripcion,
  conclusion,
  fecha,
  imagenBase64,
  medico,
  rama,
  qrImagen,
  valueDicom = [],
}) => {
  try {
    // Crear el objeto con las variables
    const data = {
      nombre: nombre,
      estudio: estudio,
      fecha:
        fecha ??
        new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
      descripcion: descripcion ?? '',
      conclusion: conclusion ?? '',
      medico: medico ?? '',
      rama: rama ?? '',
      imagenBase64: imagenBase64 ?? '',
      qrImagen: qrImagen ?? '',
      // Mapear el contenido de valueDicom para crear una lista
      seriesList: valueDicom
        .map(item => `Series ${item.Series}: ${item.modality} (${item.Imagenes} imagenes)`)
        .join('\n'),
    };

    // Definir la ruta de la plantilla
    const templatePath = path.resolve(__dirname, '../../documents/template', 'template.docx');

    // Comprobar si la plantilla existe
    if (!fs.existsSync(templatePath)) {
      console.error('El archivo template.docx no existe en la ruta especificada.');
      throw new Error('No se puede encontrar el archivo template.docx');
    }

    // Leer el archivo de la plantilla DOCX
    const content = fs.readFileSync(templatePath, 'binary');

    // Descomprimir el contenido de la plantilla DOCX
    const zip = new PizZip(content);
    function base64Parser(tagValue) {
      if (typeof tagValue !== 'string' || !base64Regex.test(tagValue)) {
        return false;
      }

      const stringBase64 = tagValue.replace(base64Regex, '');
      if (!validBase64.test(stringBase64)) {
        throw new Error('Error parsing base64 data, your data contains invalid characters');
      }

      // Para Node.js, devolvemos un Buffer
      if (typeof Buffer !== 'undefined' && Buffer.from) {
        return Buffer.from(stringBase64, 'base64');
      }

      return null; // Si no es necesario en el navegador, devolvemos null
    }

    // Opciones para ImageModule
    const imageOptions = {
      getImage(tagValue) {
        console.log('tagValue');
        console.log(tagValue);
        return base64Parser(tagValue); // Procesamos la imagen en base64
      },
      getSize(img, tagValue, tagName, context) {
        console.log('img, tagValue, tagName, context');
        console.log(img, tagValue, tagName, context);
        // Aquí puedes ajustar el tamaño de la imagen si lo necesitas
        return [100, 100]; // Tamaño de ejemplo: 100x100
      },
    };

    // Crear una instancia de Docxtemplater con la plantilla cargada
    const doc = new Docxtemplater(zip, {
      modules: [new ImageModule(imageOptions)], // Usar el módulo de imágenes
      paragraphLoop: true,
      linebreaks: true,
    });

    // Renderizar el documento reemplazando las variables con los datos
    doc.render(data);

    // Obtener el buffer del documento generado
    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    // Asegurar existencia del directorio de salida
    const documentsDir = path.join(__dirname, '../..', 'documents');
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }

    // Definir el nombre del archivo y la ruta de salida
    const filename = `${nombre}.docx`;
    const filePath = path.join(documentsDir, filename);

    // Guardar el archivo generado en la ruta especificada
    fs.writeFileSync(filePath, buf);

    return { filePath };
  } catch (error) {
    console.error('Error al generar el documento:', error);
    throw new Error('No se pudo generar el documento DOCX');
  }
};
// const generateDocxFromTemplate = async data => {
//   try {
//     // Cargar la plantilla DOCX desde la ruta proporcionada
//     const content = fs.readFileSync(
//       path.resolve(__dirname, '../../documents/template', 'template.docx'),
//       'binary'
//     );

//     // Descomprimir el contenido de la plantilla DOCX
//     const zip = new PizZip(content);

//     // Crear una instancia de Docxtemplater con la plantilla cargada
//     const doc = new Docxtemplater(zip, {
//       paragraphLoop: true,
//       linebreaks: true,
//     });

//     // Renderizar el documento reemplazando las variables con los datos
//     doc.render(data);

//     // Obtener el buffer del documento generado
//     const buf = doc.toBuffer();

//     // Asegurar existencia del directorio de salida
//     const documentsDir = path.join(__dirname, '../..', 'documents');
//     if (!fs.existsSync(documentsDir)) {
//       fs.mkdirSync(documentsDir, { recursive: true });
//     }

//     // Definir el nombre del archivo y la ruta de salida
//     const filename = `${data.nombre}.docx`;
//     const filePath = path.join(documentsDir, filename);

//     // Guardar el archivo generado en la ruta especificada
//     fs.writeFileSync(filePath, buf);

//     return { filePath };
//   } catch (error) {
//     console.error('Error al generar el documento:', error);
//     throw new Error('No se pudo generar el documento DOCX');
//   }
// };

const generateDocxFromHtml = async ({
  nombre,
  estudio,
  descripcion,
  conclusion,
  fecha,
  imagenBase64,
  medico,
  rama,
  qrImagen,
  valueDicom,
}) => {
  console.log(nombre);
  const dataListHtml = valueDicom
    .map(
      item => `
    <p><strong>Series${item.Series}:</strong> ${item.modality} (${item.Imagenes} imagenes)</p>
    <hr />
  `
    )
    .join('');

  const html = `
  <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Documento</title>
      </head>
      <body>
        <>
        <section style="margin-bottom:5em">
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Estudio:</strong> ${estudio}</p>
        <p><strong>Fecha:</strong> ${fecha ?? new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </section>
        <br/>
        <br/>
        <section>
          ${dataListHtml}
        </section>
        <section>
        <img src="${qrImagen}"/>
        </section>
        <br/>
        <br/>
        <section  style="margin-top:2em;">
        <p>${descripcion ?? ''}</p>
        <br/>
        <br/>
        ${
          conclusion
            ? `
          <p>
          <strong>Conclusión:</strong> ${conclusion ?? ''}
          </p>
          `
            : ''
        }
        </section>
        </div>
        <br/>
        <br/>
        <div style="text-align:center ">
        ${
          imagenBase64
            ? `<div >
          <img src="${imagenBase64}" alt="Imagen" style="max-width: 300px; height: auto;" />
          </div>`
            : ''
        }
        </div>
        <p>Dr. ${medico ?? ''}</p>
        <p>${rama ?? ''}</p>
      </body>
    </html>
  `;

  try {
    // Convertir HTML a DOCX
    const docxBuffer = await HTMLtoDOCX(html, '', {
      orientation: 'portrait',
      pageSize: { width: 12240, height: 15840 },
      title: 'Documento de Información',
      creator: 'Med Viewer',
      keywords: ['documento', 'información'],
      description: 'Documento generado a partir de HTML',
      lastModifiedBy: 'Med Viewer',
      revision: 1,
      createdAt: new Date(),
      modifiedAt: new Date(),
    });

    // Asegurar existencia del directorio
    const documentsDir = path.join(__dirname, '../..', 'documents');
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }

    const filename = `${nombre}.docx`;
    const filePath = path.join(documentsDir, filename);

    // Guardar el archivo DOCX
    fs.writeFileSync(filePath, docxBuffer);

    return { filePath };
  } catch (error) {
    console.error('Error al generar el documento:', error);
    throw new Error('No se pudo generar el documento DOCX');
  }
};

module.exports = { generateDocx, generateDocxFromHtml, generateDocxFromTemplate };
