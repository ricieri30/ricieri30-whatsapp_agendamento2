const db = require('./db');

let isProcessingQueue = false;

const startScheduler = (whatsappClient) => {
    console.log('Starting anti-ban schedule checker...');

    // Check pending messages every 15 seconds
    setInterval(async () => {
        if (isProcessingQueue) return;

        db.all("SELECT * FROM messages WHERE status = 'PENDING'", async (err, rows) => {
            if (err) {
                console.error('Error fetching messages', err);
                return;
            }

            const now = new Date();
            const dueMessages = rows.filter(msg => new Date(msg.scheduledDate) <= now);

            if (dueMessages.length === 0) return;

            console.log(`Found ${dueMessages.length} pending scheduled messages due right now. Processing queue...`);
            isProcessingQueue = true;

            for (let i = 0; i < dueMessages.length; i++) {
                const msg = dueMessages[i];
                try {
                    // Format number for whatsapp-web.js (usually strictly numeric + @c.us)
                    const formattedPhone = msg.phone.includes('@c.us') ? msg.phone : `${msg.phone.replace(/[^0-9]/g, '')}@c.us`;
                    console.log(`Sending scheduled message ${msg.id} to ${formattedPhone}...`);

                    await whatsappClient.sendMessage(formattedPhone, msg.text);
                    db.run("UPDATE messages SET status = 'SENT' WHERE id = ?", [msg.id]);

                    // Cleanup any previous FAILED attempts for this exact phone number to keep the queue clean
                    db.run("DELETE FROM messages WHERE status = 'FAILED' AND phone = ?", [msg.phone]);

                    console.log(`Message ${msg.id} sent successfully! Removed any prior falures.`);

                } catch (error) {
                    console.error(`Failed to send message ${msg.id}:`, error);
                    db.run("UPDATE messages SET status = 'FAILED' WHERE id = ?", [msg.id]);
                }

                // If there is another message to process, wait randomly between 15 and 90 seconds
                if (i < dueMessages.length - 1) {
                    const randomDelay = Math.floor(Math.random() * (90000 - 15000 + 1) + 15000);
                    console.log(`[Anti-Ban] Waiting ${Math.floor(randomDelay / 1000)} seconds before next message...`);
                    await new Promise(resolve => setTimeout(resolve, randomDelay));
                }
            }

            isProcessingQueue = false;
            console.log('Finished processing current queue items.');
        });
    }, 15000);
};

module.exports = { startScheduler };
