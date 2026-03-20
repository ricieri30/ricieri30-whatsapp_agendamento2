const db = require('./db');
const { format, differenceInDays } = require('date-fns');

const ptBRDays = [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado'
];

const getGreeting = (hour) => {
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
};

let isCheckingSchedules = false;

const startScheduleTrigger = (whatsappClient) => {
    console.log('Starting recurring schedule trigger cron...');

    // Check every 60 seconds
    setInterval(async () => {
        if (isCheckingSchedules) return;

        const now = new Date();
        const currentHour = now.getHours();
        const greeting = getGreeting(currentHour);
        // E.g., '08:30'
        const currentTimeString = format(now, 'HH:mm');
        // E.g., '2023-10-25'
        const currentDateString = format(now, 'yyyy-MM-dd');
        const dayOfWeekStr = ptBRDays[now.getDay()];

        db.all("SELECT * FROM schedules", async (err, schedules) => {
            if (err) {
                console.error('Error fetching schedules', err);
                return;
            }

            isCheckingSchedules = true;

            for (const schedule of schedules) {
                // 1. Check if time matches
                if (schedule.timeOfDay !== currentTimeString) continue;

                // 2. Check frequency (prevent double running or running too early)
                const lastRun = schedule.lastRunDate ? new Date(`${schedule.lastRunDate}T00:00:00`) : null;

                if (schedule.frequency === 'DAILY') {
                    if (schedule.lastRunDate === currentDateString) continue;
                } else if (schedule.frequency === 'WEEKLY') {
                    if (lastRun && differenceInDays(now, lastRun) < 7) continue;
                } else if (schedule.frequency === 'MONTHLY') {
                    if (lastRun && lastRun.getMonth() === now.getMonth() && lastRun.getFullYear() === now.getFullYear()) continue;
                }

                console.log(`[Schedule Trigger] Firing schedule ID ${schedule.id} for suffix "${schedule.targetSuffix}"`);

                try {
                    // Fetch contacts from WhatsApp
                    const contacts = await whatsappClient.getContacts();

                    // Filter contacts by suffix
                    const targetContacts = contacts.filter(c => c.name && c.name.endsWith(schedule.targetSuffix));

                    if (targetContacts.length === 0) {
                        console.log(`[Schedule Trigger] No contacts found ending with "${schedule.targetSuffix}"`);
                        continue;
                    }

                    console.log(`[Schedule Trigger] Found ${targetContacts.length} matching contacts. Queuing messages...`);

                    // Queue in messages table for the Anti-Ban sender to pick up
                    for (const contact of targetContacts) {
                        let firstName = 'Cliente';
                        if (contact.name) {
                            // Extract first name (split by space and take the first part) and remove the suffix
                            firstName = contact.name.split(' ')[0].replace(schedule.targetSuffix, '').trim();
                        }

                        if (!firstName) firstName = 'Cliente';

                        // Prepare final message text for this specific contact
                        const finalMessage = schedule.messageTemplate
                            .replace(/\[DIA_DA_SEMANA\]/gi, dayOfWeekStr)
                            .replace(/\[SAUDACAO\]/gi, greeting)
                            .replace(/\[NOME\]/gi, firstName);

                        const stmt = db.prepare('INSERT INTO messages (phone, text, scheduledDate, status, contactName) VALUES (?, ?, ?, ?, ?)');
                        // Use current date as it's due immediately
                        stmt.run([contact.id._serialized, finalMessage, new Date().toISOString(), 'PENDING', contact.name]);
                    }

                    // Update last run date
                    db.run("UPDATE schedules SET lastRunDate = ? WHERE id = ?", [currentDateString, schedule.id]);

                } catch (error) {
                    console.error(`[Schedule Trigger] Error processing schedule ${schedule.id}:`, error);
                }
            }

            isCheckingSchedules = false;
        });

    }, 60000);
};

module.exports = { startScheduleTrigger };
