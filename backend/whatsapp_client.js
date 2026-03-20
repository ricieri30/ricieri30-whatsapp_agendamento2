const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

class WhatsAppClient {
    constructor(io) {
        this.io = io;
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, 'database', 'session')
            }),
            puppeteer: {
                executablePath: '/usr/bin/google-chrome-stable',
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.qrCode = null;
        this.status = 'initializing'; // initializing, qr_ready, connected, disconnected

        this._setupListeners();
        this.client.initialize().catch(err => {
            console.error('[WhatsApp] Erro ao inicializar:', err);
        });
    }

    _setupListeners() {
        this.client.on('qr', (qr) => {
            this.status = 'qr_ready';
            console.log('[WhatsApp] QR Code gerado.');
            qrcode.toDataURL(qr, (err, url) => {
                if (!err) {
                    this.qrCode = url;
                    this.io.emit('qr', url);
                }
            });
        });

        // 'authenticated' é chamado após o QR ser escaneado, mas antes de estar pronto
        this.client.on('authenticated', () => {
            console.log('[WhatsApp] Autenticado com sucesso.');
        });

        // 'ready' é o evento definitivo de conexão
        this.client.on('ready', () => {
            this.status = 'connected';
            this.qrCode = null;
            console.log('[WhatsApp] ✅ Cliente pronto e conectado!');
            this.io.emit('status', 'connected');
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'disconnected';
            console.error('[WhatsApp] ❌ Falha de autenticação:', msg);
            this.io.emit('status', 'disconnected');
        });

        this.client.on('disconnected', (reason) => {
            this.status = 'disconnected';
            this.qrCode = null;
            console.warn('[WhatsApp] Desconectado:', reason, '- Tentando reconectar...');
            this.io.emit('status', 'disconnected');
            // Aguardar 5s antes de tentar reconectar
            setTimeout(() => {
                this.client.initialize().catch(err => {
                    console.error('[WhatsApp] Erro na reconexão:', err);
                });
            }, 5000);
        });
    }

    async getContacts() {
        if (this.status !== 'connected') {
            console.warn('[WhatsApp] getContacts chamado sem conexão.');
            return [];
        }
        try {
            return await this.client.getContacts();
        } catch (err) {
            console.error('[WhatsApp] Erro ao buscar contatos:', err);
            return [];
        }
    }

    async sendMessage(number, message) {
        if (this.status !== 'connected') throw new Error('WhatsApp não está conectado.');
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        return await this.client.sendMessage(chatId, message);
    }

    async restart() {
        console.log('[WhatsApp] 🔄 Reinicialização manual solicitada...');
        this.status = 'initializing';
        this.qrCode = null;
        this.io.emit('status', 'initializing');
        try {
            // Tentar destruir a sessão atual graciosamente
            await this.client.destroy();
        } catch (err) {
            console.warn('[WhatsApp] Aviso ao destruir cliente:', err.message);
        }
        // Aguardar 2 segundos e reinicializar
        setTimeout(() => {
            this.client.initialize().catch(err => {
                console.error('[WhatsApp] Erro na reinicialização:', err);
                this.status = 'disconnected';
                this.io.emit('status', 'disconnected');
            });
        }, 2000);
    }

    async disconnect() {
        console.log('[WhatsApp] 🔌 Desconexão manual solicitada...');
        this.status = 'disconnected';
        this.qrCode = null;
        this.io.emit('status', 'disconnected');
        try {
            // logout() apaga a sessão salva e desconecta
            await this.client.logout();
        } catch (err) {
            console.warn('[WhatsApp] Aviso ao fazer logout:', err.message);
        }
        try {
            await this.client.destroy();
        } catch (err) {
            console.warn('[WhatsApp] Aviso ao destruir cliente:', err.message);
        }
        // Reinicializar para gerar novo QR code
        setTimeout(() => {
            this.client.initialize().catch(err => {
                console.error('[WhatsApp] Erro ao reinicializar após logout:', err);
            });
        }, 2000);
    }
}

module.exports = WhatsAppClient;
