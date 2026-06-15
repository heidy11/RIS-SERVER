const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');

class WhatsappService {
  constructor() {
    this.sessions = new Map();
  }

  async initialize() {
    console.log('WhatsApp Service initialized locally.');
  }

  getSessionCount() {
    return this.sessions.size;
  }

  getAllSessions() {
    return Array.from(this.sessions.keys());
  }

  async createSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      console.log(`Session ${sessionId} already exists.`);
      return;
    }

    if (this.sessions.size >= 2) {
      console.log(`Cannot create session ${sessionId}. Limit of 2 sessions reached.`);
      return;
    }

    console.log(`Creating session: ${sessionId}`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
      }),
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.sessions.set(sessionId, { client, status: 'INITIALIZING' });

    client.on('qr', async qr => {
      console.log(`QR received for session ${sessionId}`);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.qr = qr;
        session.status = 'QR_READY';
        try {
          session.qrBase64 = await qrcode.toDataURL(qr);
        } catch (err) {
          console.error('Error generating base64 QR Code', err);
        }
      }
      qrcodeTerminal.generate(qr, { small: true });
    });

    client.on('ready', () => {
      console.log(`WhatsApp Client ${sessionId} is ready!`);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'READY';
        session.qr = undefined;
        session.qrBase64 = undefined;
      }
    });

    client.on('authenticated', () => {
      console.log(`WhatsApp Client ${sessionId} authenticated successfully.`);
    });

    client.on('auth_failure', async msg => {
      console.error(`WhatsApp Authentication failure for ${sessionId}:`, msg);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'AUTH_FAILURE';
      }
      await this.logoutSession(sessionId);
    });

    client.on('disconnected', async reason => {
      console.log(`WhatsApp Client ${sessionId} disconnected:`, reason);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'DISCONNECTED';
      }
      await this.logoutSession(sessionId);
    });

    try {
      await client.initialize();
    } catch (err) {
      console.error(`Error initializing session ${sessionId}:`, err);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'ERROR';
      }
    }
  }

  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    let profile = undefined;
    if (session.status === 'READY' && session.client.info) {
      profile = {
        pushname: session.client.info.pushname,
        wid: session.client.info.wid,
        me: session.client.info.me,
        platform: session.client.info.platform,
      };
    }

    return {
      status: session.status,
      qr: session.qr,
      qrBase64: session.qrBase64,
      profile,
    };
  }

  formatNumber(numberRaw) {
    if (numberRaw.includes('@g.us')) return numberRaw;
    if (numberRaw.includes('-')) {
      if (numberRaw.length > 15) return `${numberRaw}@g.us`;
    }

    let cleaned = numberRaw.replace(/[\+\s\-\(\)]/g, '');

    if (!cleaned.includes('@c.us') && !cleaned.includes('@g.us')) {
      cleaned = `${cleaned}@c.us`;
    }
    return cleaned;
  }

  async sendMessage(sessionId, to, message) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (session.status !== 'READY') {
      throw new Error(`Session ${sessionId} is not ready. Current status: ${session.status}`);
    }

    try {
      const formattedNumber = this.formatNumber(to);
      const response = await session.client.sendMessage(formattedNumber, message);
      return response;
    } catch (error) {
      console.error(`Error sending message on session ${sessionId}:`, error);
      throw error;
    }
  }

  async sendMedia(sessionId, to, base64Data, mimetype, filename, caption) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if (session.status !== 'READY') {
      throw new Error(`Session ${sessionId} is not ready. Current status: ${session.status}`);
    }

    try {
      const { MessageMedia } = require('whatsapp-web.js');
      const media = new MessageMedia(mimetype, base64Data, filename);
      const formattedNumber = this.formatNumber(to);
      const response = await session.client.sendMessage(formattedNumber, media, { caption });
      return response;
    } catch (error) {
      console.error(`Error sending media on session ${sessionId}:`, error);
      throw error;
    }
  }

  async getGroups(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'READY') {
      throw new Error(`Session ${sessionId} is not ready or not found.`);
    }

    const chats = await session.client.getChats();
    const groups = chats.filter(chat => chat.isGroup);
    return groups.map(group => ({
      id: group.id._serialized,
      name: group.name,
      participantsCount: group.participants ? group.participants.length : 0,
    }));
  }

  async getGroupParticipants(sessionId, groupId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'READY') {
      throw new Error(`Session ${sessionId} is not ready or not found.`);
    }

    if (!groupId.endsWith('@g.us')) {
      groupId = `${groupId}@g.us`;
    }

    const chat = await session.client.getChatById(groupId);
    if (!chat || !chat.isGroup) {
      throw new Error(`Chat ${groupId} is not a valid group.`);
    }

    const participantsWithDetails = await Promise.all(
      chat.participants.map(async p => {
        let name = undefined;
        let number = p.id.user;
        try {
          const contact = await session.client.getContactById(p.id._serialized);
          name = contact.name || contact.pushname || undefined;
          number = contact.number || p.id.user;
        } catch (err) {}

        return {
          id: p.id._serialized,
          number: number,
          name: name,
          isAdmin: p.isAdmin,
          isSuperAdmin: p.isSuperAdmin,
        };
      })
    );

    return participantsWithDetails;
  }

  async logoutSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.status === 'READY') {
          await session.client.logout();
        }
        await session.client.destroy();
      } catch (err) {
        console.warn(`Error during logout of ${sessionId}`, err);
      }
      this.sessions.delete(sessionId);
    }
  }
}

module.exports = new WhatsappService();
