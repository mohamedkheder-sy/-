/**
 * بوت واتساب متكامل - إصدار الرقمين
 * تم دمج المعرف القديم + المعرف الجديد + الأرقام
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    delay,
    downloadMediaMessage,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const fs = require('fs');

const app = express();
const port = 8000;

// ==========================================
// 🛠️ إعدادات المطور والحسابات (الكل مدمج)
// ==========================================
const settings = {
    // قائمة بجميع معرفات المطور (القديم والجديد)
    owners: [
        "70051302523010",       // المعرف القديم
        "202435180118123",      // المعرف الجديد
        "201066706529",         // رقمك الأول
        "201102735626"          // رقمك الثاني
    ],
    ownerName: "Mohammed kheder"
};

const accounts = [
    {
        sessionName: 'auth_info_1',
        phoneNumber: "201066706529",
        botName: "Azhar Bot 1 🤖"
    },
    {
        sessionName: 'auth_info_2',
        phoneNumber: "201102735626",
        botName: "Azhar Bot 2 🤖"
    }
];

// ==========================================
// 🚀 الدالة الأساسية لتشغيل البوت
// ==========================================
async function startBot(account) {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(account.sessionName);

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, 
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    // طلب كود الربط
    if (!sock.authState.creds.registered) {
        console.log(`⏳ جاري طلب كود لـ ${account.botName}...`);
        await delay(10000); 
        try {
            const cleanNumber = account.phoneNumber.replace(/\D/g, '');
            const code = await sock.requestPairingCode(cleanNumber);
            console.log(`\n========================================`);
            console.log(`🔥 كود الربط لـ [ ${account.botName} ]: ${code}`);
            console.log(`========================================\n`);
        } catch (err) {
            console.error(`❌ فشل طلب الكود للرقم ${account.phoneNumber}`);
        }
    }

    // إدارة الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot(account);
            } else {
                fs.rmSync(`./${account.sessionName}`, { recursive: true, force: true });
                startBot(account);
            }
        } else if (connection === 'open') {
            console.log(`✅ [${account.botName}] متصل الآن!`);
        }
    });

    // معالجة الرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const remoteJid = m.key.remoteJid;
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").trim();
            const sender = m.key.participant || m.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            
            // التحقق الذكي من المطور (يبحث في قائمة المعرفات كلها)
            const isOwner = settings.owners.some(ownerId => sender.includes(ownerId));

            // الأوامر
            if (text === 'ملصق' || text === 'sticker') {
                if (m.message.imageMessage) {
                    const buffer = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                    await sock.sendMessage(remoteJid, { sticker: buffer }, { quoted: m });
                }
            }

            if (text === 'اوامر' || text === 'menu') {
                const menu = `🤖 *بوت ${account.botName}*\n\n` +
                             `⚙️ ملصق | حب | هكر\n` +
                             `👮 طرد | قفل | فتح\n` +
                             `👑 منشن (للمطور فقط)\n\n` +
                             `👤 المطور: ${settings.ownerName}`;
                await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
            }

            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants;
                const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
                const isBotAdmin = groupAdmins.includes(sock.user.id.split(':')[0] + '@s.whatsapp.net');
                const isAdmin = groupAdmins.includes(sender) || isOwner;

                if (text === 'منشن' && isOwner) {
                    const mentions = participants.map(p => p.id);
                    await sock.sendMessage(remoteJid, { text: "📢 نداء من المطور!", mentions }, { quoted: m });
                }
                
                // إضافة أمر "طرد" للمشرفين والمطور
                if (text.startsWith('طرد') && isAdmin && isBotAdmin) {
                    const user = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (user) await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                }
            }

        } catch (err) {
            console.error(`Error:`, err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// التشغيل
accounts.forEach(acc => startBot(acc));

app.get('/', (req, res) => res.status(200).send('Multi-Bot is Active 🚀'));
app.listen(port, () => console.log(`Server running`));
