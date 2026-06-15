const whatsappService = require('../services/whatsapp.service');

class WhatsappController {
  async initSession(req, res) {
    try {
      const { session } = req.body;

      if (!session) {
        return res.status(400).json({ error: 'Missing required field: session' });
      }

      const currentLimit = whatsappService.getSessionCount();
      if (currentLimit >= 2 && !whatsappService.getSessionInfo(session)) {
        return res
          .status(403)
          .json({ error: 'Limit reached. A maximum of 2 sessions is allowed locally.' });
      }

      // Trigger session creation asynchronously
      whatsappService.createSession(session);

      res.status(202).json({
        success: true,
        message: `Session ${session} initialization started. Check status to get the QR code.`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to initialize session',
      });
    }
  }

  async getSessionStatus(req, res) {
    try {
      const { session } = req.params;
      if (!session) {
        return res.status(400).json({ error: 'Missing session parameter' });
      }

      const info = whatsappService.getSessionInfo(session);
      if (!info) {
        return res.status(200).json({
          success: true,
          data: { status: 'NOT_FOUND' },
        });
      }

      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get session status',
      });
    }
  }

  async getSessions(req, res) {
    try {
      const allSessions = whatsappService.getAllSessions();

      const sessionsData = allSessions.map(sessionId => {
        const info = whatsappService.getSessionInfo(sessionId);
        return {
          session: sessionId,
          status: info ? info.status : 'DISCONNECTED',
          profile: info ? info.profile : undefined,
        };
      });

      res.status(200).json({
        success: true,
        count: sessionsData.length,
        data: sessionsData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get sessions list',
      });
    }
  }

  async sendMessage(req, res) {
    try {
      const { session, to, message } = req.body;

      if (!session || !to || !message) {
        return res.status(400).json({ error: 'Missing required fields: session, to, message' });
      }

      const info = await whatsappService.sendMessage(session, to, message);

      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send message',
      });
    }
  }

  async sendMedia(req, res) {
    try {
      const { session, to, caption } = req.body;
      const file = req.files?.media;

      if (!session || !to || !file) {
        return res.status(400).json({ error: 'Missing required fields: session, to, media file' });
      }

      const uploadedFile = Array.isArray(file) ? file[0] : file;
      const base64Data = uploadedFile.data.toString('base64');
      const mimetype = uploadedFile.mimetype;
      const filename = uploadedFile.name;

      const info = await whatsappService.sendMedia(
        session,
        to,
        base64Data,
        mimetype,
        filename,
        caption
      );

      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send media',
      });
    }
  }

  async getGroups(req, res) {
    try {
      const { session } = req.params;

      if (!session) {
        return res.status(400).json({ error: 'Missing session parameter' });
      }

      const groups = await whatsappService.getGroups(session);

      res.status(200).json({
        success: true,
        data: groups,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch groups',
      });
    }
  }

  async getGroupParticipants(req, res) {
    try {
      const { session, groupId } = req.params;

      if (!session || !groupId) {
        return res.status(400).json({ error: 'Missing session or groupId parameter' });
      }

      const participants = await whatsappService.getGroupParticipants(session, groupId);

      res.status(200).json({
        success: true,
        data: participants,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch group participants',
      });
    }
  }

  async sendGroupMessage(req, res) {
    try {
      const { session, groupId } = req.params;
      const { message } = req.body;

      if (!session || !groupId || !message) {
        return res
          .status(400)
          .json({ error: 'Missing required fields: session, groupId, message' });
      }

      const info = await whatsappService.sendMessage(session, groupId, message);

      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send group message',
      });
    }
  }

  async sendGroupMedia(req, res) {
    try {
      const { session, groupId } = req.params;
      const { caption } = req.body;
      const file = req.files?.media;

      if (!session || !groupId || !file) {
        return res
          .status(400)
          .json({ error: 'Missing required fields: session, groupId, media file' });
      }

      const uploadedFile = Array.isArray(file) ? file[0] : file;
      const base64Data = uploadedFile.data.toString('base64');
      const mimetype = uploadedFile.mimetype;
      const filename = uploadedFile.name;

      const info = await whatsappService.sendMedia(
        session,
        groupId,
        base64Data,
        mimetype,
        filename,
        caption
      );

      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send group media',
      });
    }
  }

  async closeSession(req, res) {
    try {
      const { session } = req.params;

      if (!session) {
        return res.status(400).json({ error: 'Missing parameter: session' });
      }

      await whatsappService.logoutSession(session);

      res.status(200).json({
        success: true,
        message: `Session ${session} closed and removed successfully.`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to close session',
      });
    }
  }
}

module.exports = new WhatsappController();
