const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const setupDatabase = require('./database');
const WhatsAppClient = require('./whatsapp_client');
const QueueManager = require('./queue_manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Servir o build do frontend em produção
app.use(express.static(path.join(__dirname, 'public')));

let db, whatsapp, queueManager;

async function startServer() {
    db = await setupDatabase();
    whatsapp = new WhatsAppClient(io);
    queueManager = new QueueManager(db, whatsapp, io);

    // Reprocessar mensagens pendentes ao iniciar (caso o servidor tenha reiniciado)
    queueManager.processQueue();

    // Enviar estado atual para novos clientes Socket.IO que se conectem
    io.on('connection', (socket) => {
        socket.emit('status', whatsapp.status);
        if (whatsapp.qrCode) socket.emit('qr', whatsapp.qrCode);
    });

    // ─── API: Status ────────────────────────────────────────────────────────
    app.get('/api/status', (req, res) => {
        res.json({ status: whatsapp.status, qrCode: whatsapp.qrCode });
    });

    // ─── API: Reiniciar Conexão WhatsApp ─────────────────────────────────────
    app.post('/api/restart', async (req, res) => {
        try {
            console.log('[Server] Reinicialização solicitada via API.');
            res.json({ ok: true, message: 'Reinicialização iniciada.' });
            // Executar após responder para não travar o cliente
            setTimeout(() => whatsapp.restart(), 500);
        } catch (err) {
            console.error('[Server] Erro ao reiniciar:', err);
            res.status(500).json({ error: 'Erro ao reiniciar.' });
        }
    });

    // ─── API: Desconectar WhatsApp (limpa sessão) ─────────────────────────────
    app.post('/api/disconnect', async (req, res) => {
        try {
            console.log('[Server] Desconexão solicitada via API.');
            res.json({ ok: true, message: 'Desconexão iniciada.' });
            setTimeout(() => whatsapp.disconnect(), 500);
        } catch (err) {
            console.error('[Server] Erro ao desconectar:', err);
            res.status(500).json({ error: 'Erro ao desconectar.' });
        }
    });

    // ─── API: Regras ────────────────────────────────────────────────────────
    app.get('/api/rules', async (req, res) => {
        try {
            const rules = await db.all('SELECT * FROM rules ORDER BY time ASC');
            res.json(rules);
        } catch (err) {
            console.error('[API] GET /rules:', err);
            res.status(500).json({ error: 'Erro ao buscar regras.' });
        }
    });

    app.post('/api/rules', async (req, res) => {
        try {
            const { name, time, message, emoji_filter, target_suffix } = req.body;
            if (!name || !time || !message) return res.status(400).json({ error: 'Campos obrigatórios: name, time, message.' });
            const result = await db.run(
                'INSERT INTO rules (name, time, message, emoji_filter, target_suffix) VALUES (?, ?, ?, ?, ?)',
                [name, time, message, emoji_filter || null, target_suffix || null]
            );
            res.json({ id: result.lastID });
        } catch (err) {
            console.error('[API] POST /rules:', err);
            res.status(500).json({ error: 'Erro ao criar regra.' });
        }
    });

    app.put('/api/rules/:id', async (req, res) => {
        try {
            const { name, time, message, emoji_filter, target_suffix } = req.body;
            await db.run(
                // last_run_date é resetado para NULL para que o scheduler dispare
                // a regra novamente caso o horário já tenha passado hoje
                'UPDATE rules SET name = ?, time = ?, message = ?, emoji_filter = ?, target_suffix = ?, last_run_date = NULL WHERE id = ?',
                [name, time, message, emoji_filter || null, target_suffix || null, req.params.id]
            );
            res.sendStatus(200);
        } catch (err) {
            console.error('[API] PUT /rules/:id:', err);
            res.status(500).json({ error: 'Erro ao atualizar regra.' });
        }
    });

    app.delete('/api/rules/:id', async (req, res) => {
        try {
            await db.run('DELETE FROM message_queue WHERE rule_id = ?', [req.params.id]);
            await db.run('DELETE FROM rules WHERE id = ?', [req.params.id]);
            res.sendStatus(204);
        } catch (err) {
            console.error('[API] DELETE /rules/:id:', err);
            res.status(500).json({ error: 'Erro ao deletar regra.' });
        }
    });

    app.patch('/api/rules/:id/toggle', async (req, res) => {
        try {
            const rule = await db.get('SELECT active FROM rules WHERE id = ?', [req.params.id]);
            if (!rule) return res.status(404).json({ error: 'Regra não encontrada.' });
            const newStatus = rule.active ? 0 : 1;
            await db.run('UPDATE rules SET active = ? WHERE id = ?', [newStatus, req.params.id]);
            res.json({ active: newStatus });
        } catch (err) {
            console.error('[API] PATCH /rules/:id/toggle:', err);
            res.status(500).json({ error: 'Erro ao alternar status da regra.' });
        }
    });

    app.delete('/api/rules/all', async (req, res) => {
        try {
            await db.run('DELETE FROM message_queue');
            await db.run('DELETE FROM rules');
            console.log('[API] Todas as regras e fila apagadas.');
            res.sendStatus(204);
        } catch (err) {
            console.error('[API] DELETE /rules/all:', err);
            res.status(500).json({ error: 'Erro ao limpar dados.' });
        }
    });

    app.delete('/api/queue/all', async (req, res) => {
        try {
            await db.run('DELETE FROM message_queue');
            console.log('[API] Fila de mensagens apagada.');
            res.sendStatus(204);
        } catch (err) {
            console.error('[API] DELETE /queue/all:', err);
            res.status(500).json({ error: 'Erro ao limpar fila.' });
        }
    });

    app.post('/api/rules/import', async (req, res) => {
        try {
            const rules = req.body;
            if (!Array.isArray(rules)) return res.status(400).json({ error: 'Formato inválido. Esperado: array de regras.' });
            for (const rule of rules) {
                await db.run(
                    'INSERT INTO rules (name, time, message, emoji_filter, target_suffix) VALUES (?, ?, ?, ?, ?)',
                    [rule.name, rule.time, rule.message, rule.emoji_filter || null, rule.target_suffix || null]
                );
            }
            res.sendStatus(200);
        } catch (err) {
            console.error('[API] POST /rules/import:', err);
            res.status(500).json({ error: 'Erro ao importar regras.' });
        }
    });

    // ─── API: Fila ──────────────────────────────────────────────────────────
    app.get('/api/queue', async (req, res) => {
        try {
            const queue = await db.all(
                'SELECT * FROM message_queue WHERE status = "pending" ORDER BY scheduled_time ASC'
            );
            res.json(queue);
        } catch (err) {
            console.error('[API] GET /queue:', err);
            res.status(500).json({ error: 'Erro ao buscar fila.' });
        }
    });

    app.delete('/api/queue/:id', async (req, res) => {
        try {
            await db.run('UPDATE message_queue SET status = "cancelled" WHERE id = ?', [req.params.id]);
            res.sendStatus(204);
        } catch (err) {
            console.error('[API] DELETE /queue/:id:', err);
            res.status(500).json({ error: 'Erro ao cancelar mensagem.' });
        }
    });

    // ─── Cron: Verificar Regras a Cada Minuto ───────────────────────────────
    cron.schedule('* * * * *', async () => {
        await queueManager.scheduleDailyMessages();
    });

    // ─── Fallback para SPA ──────────────────────────────────────────────────
    app.get('*', (req, res) => {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        res.sendFile(indexPath, (err) => {
            if (err) res.status(500).send('Frontend não encontrado. Execute: npm run build');
        });
    });

    const PORT = process.env.PORT || 3005;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
    });
}

startServer().catch(err => {
    console.error('❌ Falha ao iniciar servidor:', err);
    process.exit(1);
});
