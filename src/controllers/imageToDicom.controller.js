const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const dcmjs = require('dcmjs');
const { Client, Transcoding, requests, constants } = require('dcmjs-dimse');
const { CStoreRequest } = requests;
const { TransferSyntax, Status, Priority } = constants;

// Correct dcmjs API: everything lives under dcmjs.data
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Convert an image file to DICOM format.
 * Supports: JPEG, PNG, GIF, BMP, TIFF, WebP
 *
 * POST /api/dicom/convert-image-to-dicom
 * Content-Type: multipart/form-data
 *   - image: image file
 *   - metadata: JSON string with patient/study metadata
 */
const convertImageToDicom = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    const imagePath = req.file.path;

    // ── 1. Read the file ──────────────────────────────────────
    const fileBuffer = await fs.promises.readFile(imagePath);
    const mimeType = req.file.mimetype || 'image/jpeg';
    const isPdf = mimeType === 'application/pdf';
    const isVideo = mimeType.startsWith('video/');
    const isImage = mimeType.startsWith('image/');
    
    const sopInstanceUID = generateUID();
    const studyDate = metadata.studyDate
      ? metadata.studyDate.replace(/-/g, '')
      : getToday();
      
    let naturalDataset = {};

    if (isPdf) {
      naturalDataset = {
        _meta: {
          MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.104.1', // Encapsulated PDF Storage
          MediaStorageSOPInstanceUID: sopInstanceUID,
          TransferSyntaxUID: '1.2.840.10008.1.2.1', // Explicit VR Little Endian
          ImplementationClassUID: '1.2.826.0.1.3680043.8.498.13580134779012582',
          ImplementationVersionName: 'MEDI-VIEWER-1.0',
        },
        PatientName: metadata.patientName || 'UNKNOWN^UNKNOWN',
        PatientID: metadata.patientID || 'UNKNOWN',
        PatientBirthDate: '',
        PatientSex: metadata.patientSex || '',
        PatientAge: metadata.patientAge || '',
        StudyInstanceUID: metadata.studyInstanceUID || generateUID(),
        StudyDate: studyDate,
        StudyTime: getTime(),
        StudyDescription: metadata.studyDescription || '',
        AccessionNumber: '',
        ReferringPhysicianName: '',
        SeriesInstanceUID: metadata.seriesInstanceUID || generateUID(),
        SeriesNumber: String(parseInt(metadata.seriesNumber) || 1),
        SeriesDate: studyDate,
        SeriesTime: getTime(),
        SeriesDescription: metadata.seriesDescription || 'Converted PDF',
        Modality: metadata.modality || 'DOC',
        InstitutionName: metadata.institutionName || '',
        Manufacturer: 'MediViewer',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.104.1',
        SOPInstanceUID: sopInstanceUID,
        InstanceNumber: String(parseInt(metadata.instanceNumber) || 1),
        ContentDate: getToday(),
        ContentTime: getTime(),
        DocumentTitle: 'Encapsulated PDF',
        MIMETypeOfEncapsulatedDocument: 'application/pdf',
        EncapsulatedDocument: [fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)],
      };
    } else if (isVideo) {
      // Create a basic representation for Video Endoscopic / Secondary Capture
      const isMpeg4 = mimeType === 'video/mp4';
      const transferSyntax = isMpeg4 ? '1.2.840.10008.1.2.4.102' : '1.2.840.10008.1.2.1'; 
      
      const videoBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      const pixelDataValue = isMpeg4 ? [new ArrayBuffer(0), videoBuffer] : [videoBuffer];
      
      naturalDataset = {
        _meta: {
          MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.77.1.1.1', // Video Endoscopic Image Storage
          MediaStorageSOPInstanceUID: sopInstanceUID,
          TransferSyntaxUID: transferSyntax,
          ImplementationClassUID: '1.2.826.0.1.3680043.8.498.13580134779012582',
          ImplementationVersionName: 'MEDI-VIEWER-1.0',
        },
        PatientName: metadata.patientName || 'UNKNOWN^UNKNOWN',
        PatientID: metadata.patientID || 'UNKNOWN',
        PatientBirthDate: '',
        PatientSex: metadata.patientSex || '',
        PatientAge: metadata.patientAge || '',
        StudyInstanceUID: metadata.studyInstanceUID || generateUID(),
        StudyDate: studyDate,
        StudyTime: getTime(),
        StudyDescription: metadata.studyDescription || '',
        AccessionNumber: '',
        ReferringPhysicianName: '',
        SeriesInstanceUID: metadata.seriesInstanceUID || generateUID(),
        SeriesNumber: String(parseInt(metadata.seriesNumber) || 1),
        SeriesDate: studyDate,
        SeriesTime: getTime(),
        SeriesDescription: metadata.seriesDescription || 'Converted Video',
        Modality: metadata.modality || 'XC', // External-camera Photography
        InstitutionName: metadata.institutionName || '',
        Manufacturer: 'MediViewer',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.77.1.1.1',
        SOPInstanceUID: sopInstanceUID,
        InstanceNumber: String(parseInt(metadata.instanceNumber) || 1),
        ContentDate: getToday(),
        ContentTime: getTime(),
        PixelData: pixelDataValue,
      };
    } else {
      // Default to Image (Secondary Capture)
      const rawRgbBuffer = await sharp(fileBuffer)
        .removeAlpha()           
        .raw()                   
        .toBuffer();

      const { width, height } = await sharp(fileBuffer)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(({ info }) => info);

      // Check if it's TIFF/WSI or the user selected SM modality to apply proper SOP Class
      const isSM = metadata.modality === 'SM' || mimeType === 'image/tiff';
      const sopClassWSI = '1.2.840.10008.5.1.4.1.1.77.1.6'; // VL Whole Slide Microscopy Image Storage
      const sopClassSC = '1.2.840.10008.5.1.4.1.1.7'; // Secondary Capture Image Storage
      const appliedSopClass = isSM ? sopClassWSI : sopClassSC;

      naturalDataset = {
        _meta: {
          MediaStorageSOPClassUID: appliedSopClass,
          MediaStorageSOPInstanceUID: sopInstanceUID,
          TransferSyntaxUID: '1.2.840.10008.1.2.1', // Explicit VR Little Endian
          ImplementationClassUID: '1.2.826.0.1.3680043.8.498.13580134779012582',
          ImplementationVersionName: 'MEDI-VIEWER-1.0',
        },
        PatientName: metadata.patientName || 'UNKNOWN^UNKNOWN',
        PatientID: metadata.patientID || 'UNKNOWN',
        PatientBirthDate: '',
        PatientSex: metadata.patientSex || '',
        PatientAge: metadata.patientAge || '',
        StudyInstanceUID: metadata.studyInstanceUID || generateUID(),
        StudyDate: studyDate,
        StudyTime: getTime(),
        StudyDescription: metadata.studyDescription || '',
        AccessionNumber: '',
        ReferringPhysicianName: '',
        SeriesInstanceUID: metadata.seriesInstanceUID || generateUID(),
        SeriesNumber: String(parseInt(metadata.seriesNumber) || 1),
        SeriesDate: studyDate,
        SeriesTime: getTime(),
        SeriesDescription: metadata.seriesDescription || (isSM ? 'Converted Histopathology' : 'Converted Image'),
        Modality: metadata.modality || (isSM ? 'SM' : 'OT'),
        InstitutionName: metadata.institutionName || '',
        Manufacturer: 'MediViewer',
        SamplesPerPixel: 3,
        PhotometricInterpretation: 'RGB', 
        PlanarConfiguration: 0,            
        Rows: height,
        Columns: width,
        BitsAllocated: 8,
        BitsStored: 8,
        HighBit: 7,
        PixelRepresentation: 0,
        SOPClassUID: appliedSopClass,
        SOPInstanceUID: sopInstanceUID,
        InstanceNumber: String(parseInt(metadata.instanceNumber) || 1),
        ContentDate: getToday(),
        ContentTime: getTime(),
        PixelData: [rawRgbBuffer.buffer.slice(
          rawRgbBuffer.byteOffset,
          rawRgbBuffer.byteOffset + rawRgbBuffer.byteLength
        )],
        ...(isSM ? { FrameOfReferenceUID: generateUID() } : {}),
      };
    }

    // ── 3. Denaturalize (JS keywords → DICOM tag numbers) ─────────────────
    const denaturalized = DicomMetaDictionary.denaturalizeDataset(naturalDataset);
    const { _meta: metaElements, ...elements } = denaturalized;

    // ── 4. Build DicomDict and serialize to buffer ─────────────────────────
    const dicomDict = new DicomDict(metaElements || {});
    dicomDict.dict = elements;
    const buffer = Buffer.from(dicomDict.write());

    // ── 5. Clean up temp file ──────────────────────────────────────────────
    await fs.promises.unlink(imagePath);

    // ── 6. Send the DICOM file ─────────────────────────────────────────────
    const baseName = path.basename(imagePath, path.extname(imagePath));
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.dcm"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error converting image to DICOM:', error);

    // Clean up temp file on error
    if (req.file) {
      fs.promises
        .unlink(req.file.path)
        .catch(err => console.error('Error deleting temp file:', err));
    }

    res.status(500).json({
      error: 'Failed to convert image to DICOM',
      details: error.message,
    });
  }
};

/**
 * Receive the converted DICOM file and send it to the local PACS via C-STORE.
 *
 * POST /api/dicom/upload-image
 * Content-Type: multipart/form-data
 *   - file: DICOM file (application/dicom)
 *   - metadata: optional JSON string (for future use)
 */
const uploadImageAsDicom = async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No DICOM file received' });
    }

    // PACS configuration from environment variables (local PACS)
    const host = process.env.HOST_DICOM_LOCAL;
    const port = parseInt(process.env.PORT_DICOM_LOCAL);
    const calledAET = process.env.CALLED_AET_DICOM_LOCAL;
    const callingAET = process.env.CALLING_AET_DICOM_LOCAL;

    if (!host || !port || !calledAET || !callingAET) {
      return res.status(500).json({
        error: 'PACS not configured',
        details: 'Missing HOST_DICOM_LOCAL, PORT_DICOM_LOCAL, CALLED_AET_DICOM_LOCAL or CALLING_AET_DICOM_LOCAL in .env',
      });
    }

    // Save uploaded blob to a temp .dcm file
    tempFilePath = path.join(TEMP_DIR, `upload_${uuidv4()}.dcm`);
    await fs.promises.writeFile(tempFilePath, req.file.buffer);

    // Send to PACS via C-STORE
    await Transcoding.initializeAsync();
    const result = await sendDicomToPacs(tempFilePath, { host, port, calledAET, callingAET });

    res.status(200).json({
      success: true,
      message: 'DICOM image successfully sent to PACS',
      sopInstanceUID: result.sopInstanceUID,
    });
  } catch (error) {
    console.error('Error uploading image as DICOM:', error);
    res.status(500).json({
      error: 'Failed to upload DICOM to PACS',
      details: error.message,
    });
  } finally {
    // Always clean up the temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.promises.unlink(tempFilePath).catch(e => console.error('Cleanup error:', e));
    }
  }
};

/**
 * Send a local DICOM file to a PACS via DIMSE C-STORE.
 * Pattern mirrors the existing sendBatch() in dicom.controller.js (line 727):
 *   client.on('close', () => resolve(results))
 * dcm4chee closes the TCP connection after receiving C-STORE RSP → that IS success.
 *
 * @param {string} filePath - Absolute path to the .dcm file
 * @param {{ host: string, port: number, calledAET: string, callingAET: string }} config
 * @returns {Promise<{ sopInstanceUID: string|null, status: number|null }>}
 */
function sendDicomToPacs(filePath, { host, port, calledAET, callingAET }) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let responseStatus = null;
    let sopInstanceUID = null;

    // Fail immediately if PACS rejects the association (wrong AET, etc.)
    client.on('associationRejected', rejection => {
      const reason = rejection?.reason ?? 'unknown';
      const source = rejection?.source ?? 'unknown';
      reject(new Error(
        `PACS rejected association (source=${source}, reason=${reason}). ` +
        `Check CALLED_AET_DICOM_LOCAL in .env`
      ));
    });

    // Capture response status when C-STORE RSP arrives
    client.on('cStoreResponse', rsp => {
      responseStatus = rsp.getStatus();
      sopInstanceUID = rsp.getSOPInstanceUID();
    });

    // Real connection failures
    client.on('networkError', err => reject(err || new Error('Network error connecting to PACS')));
    client.on('abort',       err => reject(err || new Error('Connection aborted by PACS')));

    // Clean close = success (dcm4chee closes after C-STORE RSP Success)
    client.on('close', () => resolve({ sopInstanceUID, status: responseStatus }));

    const storeRequest = new CStoreRequest(filePath, Priority.High);
    storeRequest.setAdditionalTransferSyntaxes([TransferSyntax.ExplicitVRLittleEndian]);
    client.addRequest(storeRequest);

    // Catch any synchronous errors from client.send()
    try {
      client.send(host.trim(), port, callingAET.trim(), calledAET.trim());
    } catch (err) {
      reject(err);
    }
  });
}


// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns today in DICOM format YYYYMMDD */
function getToday() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

/** Returns current time in DICOM format HHMMSS.ffffff */
function getTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(6, '0');
  return `${hh}${mm}${ss}.${ms}`;
}


function generateUID() {
  const root = '2.25';
  const unique = BigInt(`0x${uuidv4().replace(/-/g, '')}`).toString(10);
  return `${root}.${unique}`.slice(0, 64);
}

module.exports = {
  convertImageToDicom,
  uploadImageAsDicom,
};
