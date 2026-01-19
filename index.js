/**
 * بوت واتساب متكامل - إصدار خاص
 * تم تعديل ميزة المنشن لتكون للمطور فقط، مخفية، وبكلمة "منشن" فقط بدون نقطة
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
const crypto = require("crypto");

global.crypto = crypto;

const app = express();
const port = 5000; 

// إعدادات البوت
const settings = {
    phoneNumber: "201145289166", // رقمك (المسموح له فقط باستخدام المنشن)
    ownerName: "Om Hazem",
    botName: "My Super Bot"
};

async function startBot() {
    // جلب أحدث إصدار من المكتبة
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🚀 Version: ${version.join('.')} | Latest: ${isLatest}`);

    // إعداد حفظ الجلسة
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }), // تقليل الإزعاج في السجلات
        printQRInTerminal: false, 
        mobile: false,
        browser: ["Windows", "Chrome", "110.0.5481.178"], 
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        connectTimeoutMs: 60000, 
        keepAliveIntervalMs: 30000,
    });

    // طلب كود الربط إذا لم يكن مسجلاً
    if (!sock.authState.creds.registered) {
        console.log("⏳ Waiting 10 seconds for server stability...");
        await delay(10000); 
        try {
            const code = await sock.requestPairingCode(settings.phoneNumber);
            console.log(`\n========================================`);
            console.log(`🔥 YOUR PAIRING CODE: ${code}`);
            console.log(`📱 Link your phone using this code now!`);
            console.log(`========================================\n`);
        } catch (err) {
            console.error('❌ Failed to get pairing code:', err.message);
        }
    }

    // إدارة الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Connection closed. Reason: ${reason}`);

            if (reason === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Deleting session...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                startBot();
            } else {
                startBot(); 
            }
        } else if (connection === 'open') {
            console.log('✅ Connected successfully to WhatsApp!');
        }
    });

    // معالج الرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
            const remoteJid = m.key.remoteJid;
            const sender = m.key.participant || m.key.remoteJid; // معرفة من المرسل

            // 1️⃣ أمر القائمة
            if (text === '.اوامر' || text === '.menu') {
                const menu = `🤖 *قائمة ${settings.botName}*\n\n1️⃣ منشن\n2️⃣ .المطور\n\n👑 بواسطة: ${settings.ownerName}`;
                await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
            } 
            // 2️⃣ أمر منشن (بدلاً من بنج)
            else if (text === 'منشن') {
                console.log(`[DEBUG] Mention command received from: ${sender}`);
                
                // 🔒 التحقق: هل المرسل هو صاحب الرقم أو معرف LID؟
                const cleanSender = sender.replace(/\D/g, '');
                const cleanOwner = settings.phoneNumber.replace(/\D/g, '');
                const ownerLid = "70051302523010"; // معرف الـ LID الخاص بك من السجلات

                console.log(`[DEBUG] Clean Sender: ${cleanSender}, Clean Owner: ${cleanOwner}, LID Match: ${sender.includes(ownerLid)}`);

                if (!cleanSender.includes(cleanOwner) && !sender.includes(ownerLid)) {
                    console.log(`[DEBUG] Access denied for: ${sender}`);
                    return; 
                }

                // التأكد أن الأمر داخل مجموعة
                if (remoteJid.endsWith('@g.us')) {
                    console.log(`[DEBUG] Fetching group metadata for: ${remoteJid}`);
                    const groupMetadata = await sock.groupMetadata(remoteJid);
                    const participants = groupMetadata.participants.map(p => p.id);
                    
                    console.log(`[DEBUG] Tagging ${participants.length} participants`);
                    
                    // 👻 نص قصير جداً (المنشن المخفي)
                    const mentionText = 'منشن للجميع: 📣'; 

                    await sock.sendMessage(remoteJid, {
                        text: mentionText,
                        mentions: participants // ✅ إرسال المنشن للكود دون كتابة الأسماء
                    }, { quoted: m });
                    console.log(`[DEBUG] Mention sent successfully`);
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ هذا الأمر يعمل فقط داخل المجموعات!' }, { quoted: m });
                }
            }

        } catch (err) {
            console.error("Error processing message:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// حماية السيرفر
process.on('uncaughtException', (err) => console.error("Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("Unhandled Rejection:", err));

// تشغيل السيرفر
app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(`Bot is Running ✅`);
});
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    startBot();
});
                
