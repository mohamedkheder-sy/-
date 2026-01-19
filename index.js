/**
 * بوت واتساب متكامل - إصدار الحب والملصقات
 * تم دمج الميزات الجديدة مع الكود الخاص بك
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    delay,
    downloadMediaMessage, // 👈 إضافة مهمة لتحميل الصور
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const fs = require('fs');

const app = express();
const port = 8000;

// ==========================================
// 🛠️ الإعدادات (حسب ما أرسلت لي)
// ==========================================
const settings = {
    phoneNumber: "201066706529", // رقمك المصري الموجود في الكود
    ownerLID: "70051302523010",   // معرفك الخاص
    ownerName: "Mohammed kheder",
    botName: "Azhar Bot 🤖"
};

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

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
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ انتظر 10 ثوانٍ...");
        await delay(10000); 
        try {
            const cleanNumber = settings.phoneNumber.replace(/\D/g, '');
            const code = await sock.requestPairingCode(cleanNumber);
            console.log(`\n========================================`);
            console.log(`🔥 كود الربط: ${code}`);
            console.log(`========================================\n`);
        } catch (err) {
            console.error('❌ فشل طلب الكود.');
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                fs.rmSync('./auth_info', { recursive: true, force: true });
                startBot();
            } else {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ البوت متصل وجاهز!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const remoteJid = m.key.remoteJid;
            // تعديل لقراءة النص من الصور أيضاً (للملصقات)
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").trim();
            const sender = m.key.participant || m.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            
            // التحقق من المطور
            const cleanOwner = settings.phoneNumber.replace(/\D/g, '');
            const isOwner = sender.includes(cleanOwner) || sender.includes(settings.ownerLID);

            // ==========================================
            // 🆕 1. ميزة صانع الملصقات
            // الاستخدام: ارسل صورة واكتب تحتها "ملصق"
            // ==========================================
            if (text === 'ملصق' || text === 'sticker') {
                if (m.message.imageMessage) {
                    try {
                        const buffer = await downloadMediaMessage(
                            m,
                            'buffer',
                            { },
                            { 
                                logger: pino({ level: 'silent' }),
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );
                        await sock.sendMessage(remoteJid, { sticker: buffer }, { quoted: m });
                    } catch (e) {
                        console.log(e);
                        await sock.sendMessage(remoteJid, { text: '❌ حدث خطأ، حاول مجدداً.' }, { quoted: m });
                    }
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ يجب إرسال صورة وكتابة "ملصق" في الشرح.' }, { quoted: m });
                }
            }

            // ==========================================
            // 🆕 2. ميزة مقياس الحب
            // الاستخدام: حب @منشن
            // ==========================================
            if (text.startsWith('حب')) {
                const percentage = Math.floor(Math.random() * 100) + 1;
                let comment = "";
                if (percentage < 25) comment = "💔 مفيش نصيب، شوف غيرها";
                else if (percentage < 50) comment = "😐 علاقة مشكوك فيها";
                else if (percentage < 75) comment = "😍 في إعجاب متبادل";
                else comment = "💍 جهز الدبلة فوراً!";

                await sock.sendMessage(remoteJid, { 
                    text: `💘 *مقياس الحب:*\n\nالنسبة: ${percentage}%\nالتعليق: ${comment}` 
                }, { quoted: m });
            }

            // لوحة التحكم (تم تحديثها)
            if (text === 'اوامر' || text === 'menu') {
                const menu = `🤖 *بوت ${settings.botName}*\n\n` +
                             `🆕 *الجديد:*\nملصق (مع صورة)\nحب (مع منشن)\n\n` +
                             `👮 *الإدارة:*\nطرد | قفل | فتح\n\n` +
                             `🤡 *الترفيه:*\nهكر @الضحية\n\n` +
                             `👤 *خاص:*\nمنشن\n\n` +
                             `👑 المطور: ${settings.ownerName}`;
                await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
            }

            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants;
                const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
                const isBotAdmin = groupAdmins.includes(botId);
                const isAdmin = groupAdmins.includes(sender) || isOwner;

                // 1. طرد
                if (text.startsWith('طرد')) {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ البوت ليس مشرفاً!' }, { quoted: m });
                    const user = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (user) {
                        await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                        await sock.sendMessage(remoteJid, { text: '✅ تم الطرد.' }, { quoted: m });
                    }
                }

                // 2. قفل
                if (text === 'قفل' && isAdmin && isBotAdmin) {
                    await sock.groupSettingUpdate(remoteJid, 'announcement');
                    await sock.sendMessage(remoteJid, { text: '🔒 تم القفل.' }, { quoted: m });
                }

                // 3. فتح
                if (text === 'فتح' && isAdmin && isBotAdmin) {
                    await sock.groupSettingUpdate(remoteJid, 'not_announcement');
                    await sock.sendMessage(remoteJid, { text: '🔓 تم الفتح.' }, { quoted: m });
                }

                // 4. منشن (للمطور فقط)
                if (text === 'منشن') {
                    if (isOwner) {
                        const mentions = participants.map(p => p.id);
                        await sock.sendMessage(remoteJid, { 
                            text: "📢 *نداء عاجل للجميع!*", 
                            mentions 
                        }, { quoted: m });
                    } else {
                        console.log(`⚠️ محاولة منشن مرفوضة من: ${sender}`);
                    }
                }

                // 5. هكر
                if (text.startsWith('هكر')) {
                    const user = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!user) return await sock.sendMessage(remoteJid, { text: '⚠️ منشن الضحية!' }, { quoted: m });
                    const msg = await sock.sendMessage(remoteJid, { text: '💻 جاري الهجوم...' }, { quoted: m });
                    const steps = ['🔄 حقن ملفات...', '📂 سحب صور...', '✅ تم الاختراق!'];
                    for (let step of steps) {
                        await delay(1500);
                        await sock.sendMessage(remoteJid, { text: step, edit: msg.key });
                    }
                }
            }

        } catch (err) {
            console.error("Error:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

process.on('uncaughtException', (err) => console.log('Err:', err));
process.on('unhandledRejection', (err) => console.log('Err:', err));

app.get('/', (req, res) => res.status(200).send('Bot Online 8000 🚀'));
app.listen(port, () => {
    console.log(`Server on port ${port}`);
    startBot();
});
                    
