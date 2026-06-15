const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  pingDicomServer,
  uploadDicomFiles,
  findDicomStudies,
  getFindActivate,
  setFindActivate,
  deleteDicomStudy,
  viewFilesDicomInternal,
} = require('../controllers/dicom.controller');
const {
  convertImageToDicom,
  uploadImageAsDicom,
} = require('../controllers/imageToDicom.controller');
const dicomLocalSendController = require('../controllers/dicomLocalSend.controller');
const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '../..', 'temp/images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Sanitize base name (alphanumeric, hyphens, underscores) and limit to 50 chars
    const baseName = path.basename(file.originalname, ext)
      .normalize('NFD') // decompose unicode characters
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-zA-Z0-9-_]/g, '_') // replace any special char with underscore
      .substring(0, 50);
    const uniqueName = `${Date.now()}-${baseName || 'file'}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow convertible files
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/avi',
      'video/x-msvideo',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// Memory-based multer for DICOM blobs (upload-image endpoint)
// The converted .dcm blob arrives as application/octet-stream or application/dicom
const memoryUpload = multer({ storage: multer.memoryStorage() });

// DICOM management routes
router.post('/upload', uploadDicomFiles);
router.post('/ping', pingDicomServer);
router.get('/find', findDicomStudies);
router.get('/findActivate', getFindActivate);
router.post('/findActivate', setFindActivate);
router.post('/delete', deleteDicomStudy);
router.get('/sync-internal', viewFilesDicomInternal);
router.get('/local-studies', dicomLocalSendController.getStudies);
router.get('/ping-local', dicomLocalSendController.pingPacs);
router.get('/sync-status', dicomLocalSendController.getSyncStatus);
router.post('/transfer-study', dicomLocalSendController.transferStudy);

// Image to DICOM conversion routes
router.post('/convert-image-to-dicom', upload.single('image'), convertImageToDicom);
router.post('/upload-image', memoryUpload.single('file'), uploadImageAsDicom);

module.exports = router;
