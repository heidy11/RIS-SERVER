const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const fileUpload = require('express-fileupload');

const uploadMedia = fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Manage sessions
router.post('/sessions/init', (req, res) => whatsappController.initSession(req, res));
router.get('/sessions', (req, res) => whatsappController.getSessions(req, res));
router.get('/sessions/:session/status', (req, res) =>
  whatsappController.getSessionStatus(req, res)
);
router.delete('/sessions/:session/logout', (req, res) => whatsappController.closeSession(req, res));

// Send message
router.post('/messages/send', (req, res) => whatsappController.sendMessage(req, res));
router.post('/messages/sendMedia', uploadMedia, (req, res) =>
  whatsappController.sendMedia(req, res)
);

// Groups
router.get('/sessions/:session/groups', (req, res) => whatsappController.getGroups(req, res));
router.get('/sessions/:session/groups/:groupId/participants', (req, res) =>
  whatsappController.getGroupParticipants(req, res)
);
router.post('/sessions/:session/groups/:groupId/send', (req, res) =>
  whatsappController.sendGroupMessage(req, res)
);
router.post('/sessions/:session/groups/:groupId/sendMedia', uploadMedia, (req, res) =>
  whatsappController.sendGroupMedia(req, res)
);

module.exports = router;
