/**
 * بوت واتساب متكامل - إصدار الدمج النهائي
 * 1. ميزة المنشن الخاص (للمطور فقط مع حماية LIDs)
 * 2. أدوات إدارة المجموعات (طرد، قفل، فتح...)
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
// استخدام بورت 8000 كما في كودك الشغال
const port = 8000; 

// إعدادات البوت
const settings = {
    phoneNumber: "201066706529", 
    ownerName: "Mohammed kheder",
    botName: "Azhar Bot 🤖"
};

async function startBot() {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🚀 Version: ${version.join('.')} | Latest: ${isLatest}`);

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false, 
        mobile: false,
        browser: ["Windows", "Chrome", "110.0.5481.178"], 
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        connectTimeoutMs: 60000, 
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000
    });

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
            const sender = m.key.participant || m.key.remoteJid;
            
            // تعريفات أساسية
            const isGroup = remoteJid.endsWith('@g.us');
            const senderId = sender.split('@')[0];
            const cleanOwner = settings.phoneNumber.replace(/\D/g, '');
            const isOwner = senderId === cleanOwner;

            // ===========================
            // 🛡️ قسم أوامر المجموعات (Admin)
            // ===========================
            if (isGroup) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants;
                const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                
                // استخراج المشرفين
                const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
                const isBotAdmin = groupAdmins.includes(botNumber);
                const isAdmin = groupAdmins.includes(sender) || isOwner;

                // 1️⃣ أمر طرد العضو (.طرد)
                if (text.startsWith('.طرد') || text.startsWith('.بان')) {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ هذا الأمر للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف (Admin) أولاً!' }, { quoted: m });

                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'remove');
                        await sock.sendMessage(remoteJid, { text: '✅ تم الطرد بنجاح!' }, { quoted: m });
                    } else {
                        await sock.sendMessage(remoteJid, { text: '⚠️ يجب عمل منشن للعضو أو الرد على رسالته.' }, { quoted: m });
                    }
                }

                // 2️⃣ أمر قفل المجموعة (.قفل)
                else if (text === '.قفل') {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف أولاً!' }, { quoted: m });
                    
                    await sock.groupSettingUpdate(remoteJid, 'announcement');
                    await sock.sendMessage(remoteJid, { text: '🔒 تم قفل المجموعة.' }, { quoted: m });
                }

                // 3️⃣ أمر فتح المجموعة (.فتح)
                else if (text === '.فتح') {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف أولاً!' }, { quoted: m });

                    await sock.groupSettingUpdate(remoteJid, 'not_announcement');
                    await sock.sendMessage(remoteJid, { text: '🔓 تم فتح المجموعة.' }, { quoted: m });
                }

                // 4️⃣ أمر رفع مشرف (.رفع)
                else if (text.startsWith('.رفع')) {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'promote');
                        await sock.sendMessage(remoteJid, { text: '🆙 تم ترقيته لمشرف!' }, { quoted: m });
                    }
                }

                // 5️⃣ أمر تنزيل مشرف (.تنزيل)
                else if (text.startsWith('.تنزيل')) {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'demote');
                        await sock.sendMessage(remoteJid, { text: '⬇️ تم إزالة الإشراف عنه!' }, { quoted: m });
                    }
                }

                // 6️⃣ أمر حذف رسالة (.حذف)
                else if (text === '.حذف') {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    if (!m.message.extendedTextMessage?.contextInfo?.stanzaId) return;

                    const key = {
                        remoteJid: remoteJid,
                        fromMe: false,
                        id: m.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: m.message.extendedTextMessage.contextInfo.participant
                    };
                    await sock.sendMessage(remoteJid, { delete: key });
                }
            }

            // ===========================
            // 👤 قسم الأوامر الخاصة بالمطور
            // ===========================

            // 7️⃣ أمر منشن (الخاص المحمي - كودك الأصلي)
            if (text === 'منشن') {
                // قائمة المعرفات الموثوقة (LIDs)
                const allowedLids = ["70051302523010"]; 
                const isLidMatch = allowedLids.some(lid => sender.includes(lid));

                // تسجيل المعلومات للتصحيح الصارم
                console.log(`[AUTH_CHECK] Sender: ${sender}, ID: ${senderId}, Owner: ${cleanOwner}, Result: ${isOwner || isLidMatch}`);

                if (!isOwner && !isLidMatch) {
                    console.log(`[SECURITY] REJECTED mention from unauthorized sender: ${sender}`);
                    return; // البوت لن يفعل أي شيء ولن يرد
                }

                if (remoteJid.endsWith('@g.us')) {
                    console.log(`[DEBUG] Fetching group metadata for: ${remoteJid}`);
                    // لاحظ: قمنا بجلب الميتاداتا سابقاً إذا كان في مجموعة، لكن للأمان نعيد جلبها هنا إذا لزم الأمر
                    // أو نستخدم المتغيرات الموجودة إذا كانت معرفة
                    const groupMetadata = await sock.groupMetadata(remoteJid);
                    const participants = groupMetadata.participants.map(p => p.id);
                    
                    console.log(`[DEBUG] Tagging ${participants.length} participants`);
                    
                    const mentionText = '📢 *نداء عاجل للجميع من المالك* 📢'; 

                    await sock.sendMessage(remoteJid, {
                        text: mentionText,
                        mentions: participants 
                    }, { quoted: m });
                    console.log(`[DEBUG] Mention sent successfully`);
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ هذا الأمر يعمل فقط داخل المجموعات!' }, { quoted: m });
                }
            }

            // 8️⃣ أمر القائمة (المعدل)
            if (text === '.اوامر' || text === '.menu') {
                const menu = `🤖 *قائمة ${settings.botName}*\n\n` +
                             `👮 *أوامر الإدارة:*\n` +
                             `.طرد .قفل .فتح .رفع .تنزيل .حذف\n\n` +
                             `👤 *أوامر المطور:*\n` +
                             `كلمة (منشن) للنداء\n\n` +
                             `👑 المطور: ${settings.ownerName}`;
                await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
            }

        } catch (err) {
            console.error("Error processing message:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

process.on('uncaughtException', (err) => console.error("Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("Unhandled Rejection:", err));

app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(`Bot is Running ✅`);
});
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    startBot();
});
                const isBotAdmin = groupAdmins.includes(botNumber);
                const isAdmin = groupAdmins.includes(sender) || isOwner;

                // 1️⃣ أمر طرد العضو (.طرد)
                if (text.startsWith('.طرد') || text.startsWith('.بان')) {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ هذا الأمر للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف (Admin) أولاً!' }, { quoted: m });

                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'remove');
                        await sock.sendMessage(remoteJid, { text: '✅ تم الطرد بنجاح!' }, { quoted: m });
                    } else {
                        await sock.sendMessage(remoteJid, { text: '⚠️ يجب عمل منشن للعضو أو الرد على رسالته.' }, { quoted: m });
                    }
                }

                // 2️⃣ أمر قفل المجموعة (.قفل)
                else if (text === '.قفل') {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف أولاً!' }, { quoted: m });
                    
                    await sock.groupSettingUpdate(remoteJid, 'announcement');
                    await sock.sendMessage(remoteJid, { text: '🔒 تم قفل المجموعة.' }, { quoted: m });
                }

                // 3️⃣ أمر فتح المجموعة (.فتح)
                else if (text === '.فتح') {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفع البوت مشرف أولاً!' }, { quoted: m });

                    await sock.groupSettingUpdate(remoteJid, 'not_announcement');
                    await sock.sendMessage(remoteJid, { text: '🔓 تم فتح المجموعة.' }, { quoted: m });
                }

                // 4️⃣ أمر رفع مشرف (.رفع)
                else if (text.startsWith('.رفع')) {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'promote');
                        await sock.sendMessage(remoteJid, { text: '🆙 تم ترقيته لمشرف!' }, { quoted: m });
                    }
                }

                // 5️⃣ أمر تنزيل مشرف (.تنزيل)
                else if (text.startsWith('.تنزيل')) {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    let users = m.message.extendedTextMessage?.contextInfo?.participant || m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (users) {
                        await sock.groupParticipantsUpdate(remoteJid, [users], 'demote');
                        await sock.sendMessage(remoteJid, { text: '⬇️ تم إزالة الإشراف عنه!' }, { quoted: m });
                    }
                }

                // 6️⃣ أمر حذف رسالة (.حذف)
                else if (text === '.حذف') {
                    if (!isAdmin) return;
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ لست مشرفاً!' }, { quoted: m });
                    if (!m.message.extendedTextMessage?.contextInfo?.stanzaId) return;

                    const key = {
                        remoteJid: remoteJid,
                        fromMe: false,
                        id: m.message.extendedTextMessage.contextInfo.stanzaId,
                        participant: m.message.extendedTextMessage.contextInfo.participant
                    };
                    await sock.sendMessage(remoteJid, { delete: key });
                }
            }

            // ===========================
            // 👤 قسم الأوامر الخاصة بالمطور
            // ===========================

            // 7️⃣ أمر منشن (الخاص المحمي - كودك الأصلي)
            if (text === 'منشن') {
                // قائمة المعرفات الموثوقة (LIDs)
                const allowedLids = ["70051302523010"]; 
                const isLidMatch = allowedLids.some(lid => sender.includes(lid));

                // تسجيل المعلومات للتصحيح الصارم
                console.log(`[AUTH_CHECK] Sender: ${sender}, ID: ${senderId}, Owner: ${cleanOwner}, Result: ${isOwner || isLidMatch}`);

                if (!isOwner && !isLidMatch) {
                    console.log(`[SECURITY] REJECTED mention from unauthorized sender: ${sender}`);
                    return; // البوت لن يفعل أي شيء ولن يرد
                }

                if (remoteJid.endsWith('@g.us')) {
                    console.log(`[DEBUG] Fetching group metadata for: ${remoteJid}`);
                    // لاحظ: قمنا بجلب الميتاداتا سابقاً إذا كان في مجموعة، لكن للأمان نعيد جلبها هنا إذا لزم الأمر
                    // أو نستخدم المتغيرات الموجودة إذا كانت معرفة
                    const groupMetadata = await sock.groupMetadata(remoteJid);
                    const participants = groupMetadata.participants.map(p => p.id);
                    
                    console.log(`[DEBUG] Tagging ${participants.length} participants`);
                    
                    const mentionText = '📢 *نداء عاجل للجميع من المالك* 📢'; 

                    await sock.sendMessage(remoteJid, {
                        text: mentionText,
                        mentions: participants 
                    }, { quoted: m });
                    console.log(`[DEBUG] Mention sent successfully`);
                } else {
                    await sock.sendMessage(remoteJid, { text: '⚠️ هذا الأمر يعمل فقط داخل المجموعات!' }, { quoted: m });
                }
            }

            // 8️⃣ أمر القائمة (المعدل)
            if (text === '.اوامر' || text === '.menu') {
                const menu = `🤖 *قائمة ${settings.botName}*\n\n` +
                             `👮 *أوامر الإدارة:*\n` +
                             `.طرد .قفل .فتح .رفع .تنزيل .حذف\n\n` +
                             `👤 *أوامر المطور:*\n` +
                             `كلمة (منشن) للنداء\n\n` +
                             `👑 المطور: ${settings.ownerName}`;
                await sock.sendMessage(remoteJid, { text: menu }, { quoted: m });
            }

        } catch (err) {
            console.error("Error processing message:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

process.on('uncaughtException', (err) => console.error("Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("Unhandled Rejection:", err));

app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(`Bot is Running ✅`);
});
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    startBot();
});
