const { format } = require('date-fns-tz');
const { toZonedTime } = require('date-fns-tz');

const TZ = 'America/Sao_Paulo';

class QueueManager {
    constructor(db, whatsapp, io) {
        this.db = db;
        this.whatsapp = whatsapp;
        this.io = io;
        this.isProcessing = false;
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const nextMessage = await this.db.get(
                'SELECT * FROM message_queue WHERE status = "pending" ORDER BY scheduled_time ASC LIMIT 1'
            );

            if (nextMessage) {
                console.log(`[Queue] Enviando mensagem para: ${nextMessage.contact_name}`);
                try {
                    await this.whatsapp.sendMessage(nextMessage.contact_number, nextMessage.message);
                    await this.db.run(
                        'UPDATE message_queue SET status = "sent", sent_at = ? WHERE id = ?',
                        [new Date().toISOString(), nextMessage.id]
                    );
                    console.log(`[Queue] ✅ Mensagem enviada para ${nextMessage.contact_name}.`);
                    this.io.emit('queue_update');
                } catch (err) {
                    console.error(`[Queue] ❌ Erro ao enviar para ${nextMessage.contact_name}:`, err.message);
                    await this.db.run('UPDATE message_queue SET status = "error" WHERE id = ?', [nextMessage.id]);
                }

                // Delay Anti-banimento fixo de 30 segundos
                const delay = 30000;
                console.log(`[Queue] Aguardando ${delay / 1000}s (anti-ban)...`);
                setTimeout(() => {
                    this.isProcessing = false;
                    this.processQueue();
                }, delay);
            } else {
                this.isProcessing = false;
            }
        } catch (err) {
            console.error('[Queue] Erro crítico:', err);
            this.isProcessing = false;
        }
    }

    async scheduleDailyMessages() {
        const now = new Date();
        // Usar sempre o horário de São Paulo para comparações
        const nowSP = toZonedTime(now, TZ);
        const saoPauloTime = format(nowSP, 'HH:mm', { timeZone: TZ });
        const currentDate = format(nowSP, 'yyyy-MM-dd', { timeZone: TZ });

        // Hora local de SP para a saudação
        const hour = nowSP.getHours();

        console.log(`[Scheduler] Tick: ${saoPauloTime} | Data: ${currentDate}`);

        const activeRules = await this.db.all(
            `SELECT * FROM rules 
             WHERE active = 1 
             AND time = ? 
             AND (last_run_date IS NULL OR substr(last_run_date, 1, 10) != ?)`,
            [saoPauloTime, currentDate]
        );

        if (activeRules.length === 0) return;

        console.log(`[Scheduler] ${activeRules.length} regra(s) encontrada(s) para este minuto.`);

        if (this.whatsapp.status !== 'connected') {
            console.log('[Scheduler] WhatsApp não está conectado. Pulando.');
            return;
        }

        const contacts = await this.whatsapp.getContacts();
        console.log(`[Scheduler] ${contacts.length} contatos carregados.`);

        for (const rule of activeRules) {
            // Marcar a regra como executada imediatamente para evitar duplo disparo
            await this.db.run('UPDATE rules SET last_run_date = ? WHERE id = ?', [currentDate, rule.id]);

            const filteredContacts = contacts.filter(c => {
                const name = c.name || c.pushname || '';
                const nameLower = name.toLowerCase();

                const hasEmojiFilter = rule.emoji_filter && rule.emoji_filter.trim() !== '';
                const hasSuffixFilter = rule.target_suffix && rule.target_suffix.trim() !== '';

                // Se não há nenhum filtro configurado, não enviar para ninguém (segurança)
                if (!hasEmojiFilter && !hasSuffixFilter) return false;

                const matchEmoji = hasEmojiFilter && name.includes(rule.emoji_filter.trim());
                const matchSuffix = hasSuffixFilter && nameLower.endsWith(rule.target_suffix.trim().toLowerCase());

                return matchEmoji || matchSuffix;
            });

            console.log(`[Scheduler] Regra "${rule.name}": ${filteredContacts.length} contato(s) correspondente(s).`);

            // Variáveis de template (calculadas uma vez por regra)
            const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
            const dayOfWeekMap = {
                0: 'domingo', 1: 'segunda-feira', 2: 'terça-feira',
                3: 'quarta-feira', 4: 'quinta-feira', 5: 'sexta-feira', 6: 'sábado'
            };
            const dayOfWeekStr = dayOfWeekMap[nowSP.getDay()];

            for (const contact of filteredContacts) {
                const contactId = contact.id._serialized;
                // Ignorar grupos
                if (contactId.endsWith('@g.us')) continue;

                const contactName = contact.name || contact.pushname || 'Cliente';
                const firstName = contactName.split(' ')[0];
                // Sobrenome: último "pedaço" do nome que contenha ao menos uma letra
                // Ignora emojis, //// e outros sufixos sem letras ao final do nome
                const nameParts = contactName.split(' ').filter(p => /\p{L}/u.test(p));
                const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;

                const finalMessage = rule.message
                    .replace(/\[SAUDACAO\]/gi, greeting)
                    .replace(/\[NOME\]/gi, firstName)
                    .replace(/\[SOBRENOME\]/gi, lastName)
                    .replace(/\[DIA_DA_SEMANA\]/gi, dayOfWeekStr);

                try {
                    const result = await this.db.run(
                        `INSERT OR IGNORE INTO message_queue 
                         (rule_id, contact_name, contact_number, message, scheduled_time) 
                         VALUES (?, ?, ?, ?, ?)`,
                        [rule.id, contactName, contactId, finalMessage, now.toISOString()]
                    );
                    if (result.changes > 0) {
                        console.log(`[Scheduler] Adicionado à fila: ${contactName}`);
                    } else {
                        console.log(`[Scheduler] Ignorado (já na fila hoje): ${contactName}`);
                    }
                } catch (err) {
                    console.error('[Scheduler] Erro ao inserir na fila:', err.message);
                }
            }
        }

        this.io.emit('queue_update');
        // Iniciar processamento logo após adicionar à fila
        if (!this.isProcessing) this.processQueue();
    }
}

module.exports = QueueManager;
