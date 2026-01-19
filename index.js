/**
 * بوت واتساب مطور - نسخة محسنة بواسطة خبير البرمجة
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const fs = require('fs');

const app = express();
const port = 8000;

// إعدادات البوت
const settings = {
    phoneNumber: "201066706529", 
    ownerName: "Mohammed kheder",
    botName: "Azhar Bot 🤖"
};

async function startBot() {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: true, // يفضل تركه true إذا كنت تشغله لأول مرة محلياً
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: ["Azhar Bot", "Chrome", "1.0.0"]
    });

    // آلية ربط الكود (Pairing Code)
    if (!sock.authState.creds.registered) {
        console.log("⏳ جاري تحضير كود الربط...");
        await delay(5000); 
        try {
            const code = await sock.requestPairingCode(settings.phoneNumber);
            console.log(`\n🔥 كود الربط الخاص بك هو: ${code}\n`);
        } catch (err) {
            console.error('❌ فشل طلب كود الربط:', err);
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بنجاح!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

            const remoteJid = m.key.remoteJid;
            const content = JSON.stringify(m.message);
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim().toLowerCase();
            
            const isGroup = remoteJid.endsWith('@g.us');
            const sender = m.key.participant || m.key.remoteJid;
            
            // تحسين التحقق من المالك
            const isOwner = sender.includes(settings.phoneNumber);

            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants;
                const groupAdmins = participants.filter(p => p.admin).map(p => p.id);
                const isBotAdmin = groupAdmins.includes(sock.user.id.split(':')[0] + '@s.whatsapp.net');
                const isAdmin = groupAdmins.includes(sender);

                // أمر المنشن (للمالك فقط)
                if (text === 'منشن' && isOwner) {
                    const mentions = participants.map(p => p.id);
                    await sock.sendMessage(remoteJid, {
                        text: `📢 *نداء من المطور:* ${settings.ownerName}`,
                        mentions: mentions
                    }, { quoted: m });
                }

                // أوامر الإشراف
                if (text.startsWith('.طرد') && isAdmin) {
                    if (!isBotAdmin) return sock.sendMessage(remoteJid, { text: 'يجب أن أكون مشرفاً أولاً!' });
                    const target = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (target) {
                        await sock.groupParticipantsUpdate(remoteJid, [target], 'remove');
                        await sock.sendMessage(remoteJid, { text: '✅ تم الطرد بنجاح.' });
                    }
                }
            }

            // القائمة
            if (text === '.اوامر') {
                await sock.sendMessage(remoteJid, { text: `🤖 بوت: ${settings.botName}\n\nاوامر المشرفين:\n.طرد\n.قفل\n.فتح\n\nللمطور:\nمنشن` });
            }

        } catch (err) {
            console.error("خطأ في معالجة الرسالة:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// تشغيل السيرفر لضمان بقاء البوت حياً
app.get('/', (req, res) => res.send('Bot Active ✅'));
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
    startBot();
});
