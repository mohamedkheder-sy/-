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
const port = 5000;
const host = '0.0.0.0';

// إعدادات البوت
const settings = {
    phoneNumber: "201066706529", // قم بتغيير هذا الرقم فقط عند الحاجة
    ownerName: "Mohammed kheder",
    botName: "Azhar Bot 🤖"
};

let currentPairingCode = "";
let connectionStatus = "Disconnected";

async function startBot() {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // آلية ربط الكود (Pairing Code)
    if (!sock.authState.creds.registered) {
        console.log("⏳ جاري تحضير كود الربط...");
        await delay(8000); 
        try {
            const code = await sock.requestPairingCode(settings.phoneNumber);
            currentPairingCode = code;
            console.log(`\n🔥 كود الربط الخاص بك هو: ${code}\n`);
        } catch (err) {
            console.error('❌ فشل طلب كود الربط:', err);
            if (err.message && (err.message.includes('rate-overlimit') || err.message.includes('429'))) {
                connectionStatus = "Rate Limited (Too many attempts)";
                console.log("\n⚠️ تجاوزت المحاولات المسموح بها\nأجريت الكثير من المحاولات لربط جهاز يرجى إعادة المحاولة لاحقا.\n");
            }
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            connectionStatus = "Disconnected";
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            connectionStatus = "Connected ✅";
            console.log('✅ تم الاتصال بنجاح!');
        } else if (connection === 'connecting') {
            connectionStatus = "Connecting...";
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message || m.key.fromMe) return;

            const remoteJid = m.key.remoteJid;
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || "").trim().toLowerCase();
            
            const isGroup = remoteJid.endsWith('@g.us');
            const sender = m.key.participant || m.key.remoteJid;
            
            // تحسين التحقق من المالك
            const isOwner = sender.includes(settings.phoneNumber);

            if (isGroup) {
                // تعريف المشرفين (ضروري لعمل الأكواد)
                const groupMetadata = await sock.groupMetadata(remoteJid).catch(() => null);
                if (!groupMetadata) return;
                
                const participants = groupMetadata.participants;
                // تصحيح: التحقق من وجود خاصية admin (تكون 'admin' أو 'superadmin')
                const groupAdmins = participants.filter(p => p.admin !== null && p.admin !== undefined).map(p => p.id);
                
                // تنظيف الأرقام من أي رموز إضافية
                const cleanNumber = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';

                // الحصول على معرف البوت من بيانات المستخدم المتصل
                const botJid = sock.user.id;
                const botClean = cleanNumber(botJid);
                
                // تحسين التعرف على البوت كمشرف بالبحث عن رقم البوت في قائمة معرفات المشرفين
                const isBotAdmin = groupAdmins.some(jid => {
                    const cleanJid = cleanNumber(jid);
                    return cleanJid === botClean || botClean.includes(cleanJid) || cleanJid.includes(botClean);
                });
                
                const senderClean = cleanNumber(sender);
                // التحقق المباشر: هل الرقم موجود في قائمة المشرفين؟
                const isAdmin = groupAdmins.some(jid => {
                    const cleanJid = cleanNumber(jid);
                    return cleanJid === senderClean || senderClean.includes(cleanJid) || cleanJid.includes(senderClean);
                }) || isOwner;

                // طباعة تشخيصية في الكونسول فقط عند استلام رسالة
                console.log(`[Group] ${groupMetadata.subject} | Sender: ${senderClean} | IsAdmin: ${isAdmin} | BotAdmin: ${isBotAdmin} | Admins: ${groupAdmins.map(cleanNumber).join(', ')}`);

                // --- أوامر المشرفين ---

                // أمر طرد
                if (text.startsWith('طرد')) {
                    if (!isAdmin) return await sock.sendMessage(remoteJid, { text: '⛔ للمشرفين فقط!' }, { quoted: m });
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    
                    const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message.extendedTextMessage?.contextInfo?.participant;
                    
                    if (user) {
                        try {
                            if (cleanNumber(user) === botClean || cleanNumber(user) === cleanNumber(settings.phoneNumber)) {
                                return await sock.sendMessage(remoteJid, { text: '❌ لا يمكنني طرد المطور أو البوت!' }, { quoted: m });
                            }
                            await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                            await sock.sendMessage(remoteJid, { text: '✅ تم الطرد بنجاح.' }, { quoted: m });
                        } catch (err) {
                            await sock.sendMessage(remoteJid, { text: '❌ فشل الطرد، تأكد من الصلاحيات.' }, { quoted: m });
                        }
                    } else {
                        await sock.sendMessage(remoteJid, { text: '⚠️ يرجى الإشارة (Mention) للعضو أو الرد على رسالته لطرده.' }, { quoted: m });
                    }
                }

                // أمر قفل
                if (text === 'قفل' && isAdmin) {
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    await sock.groupSettingUpdate(remoteJid, 'announcement');
                    await sock.sendMessage(remoteJid, { text: '🔒 تم قفل المجموعة.' }, { quoted: m });
                }

                // أمر فتح
                if (text === 'فتح' && isAdmin) {
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    await sock.groupSettingUpdate(remoteJid, 'not_announcement');
                    await sock.sendMessage(remoteJid, { text: '🔓 تم فتح المجموعة.' }, { quoted: m });
                }

                // أمر ترقية
                if (text === 'ترقية' && isAdmin) {
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message.extendedTextMessage?.contextInfo?.participant;
                    if (user) {
                        await sock.groupParticipantsUpdate(remoteJid, [user], 'promote');
                        await sock.sendMessage(remoteJid, { text: '✅ تم الترقية.' }, { quoted: m });
                    }
                }

                // أمر تنزيل
                if (text === 'تنزيل' && isAdmin) {
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    const user = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message.extendedTextMessage?.contextInfo?.participant;
                    if (user) {
                        await sock.groupParticipantsUpdate(remoteJid, [user], 'demote');
                        await sock.sendMessage(remoteJid, { text: '✅ تم التنزيل.' }, { quoted: m });
                    }
                }

                // أمر الرابط
                if (text === 'الرابط' && isAdmin) {
                    if (!isBotAdmin) return await sock.sendMessage(remoteJid, { text: '⚠️ ارفعني مشرف (Admin)!' }, { quoted: m });
                    const inviteCode = await sock.groupInviteCode(remoteJid);
                    await sock.sendMessage(remoteJid, { text: `🔗 رابط المجموعة:\nhttps://chat.whatsapp.com/${inviteCode}` });
                }

                // أمر مقلب هكر
                if (text === 'هكر' && isAdmin) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ [نظام الاختراق]: جاري استخراج البيانات...' });
                    await delay(2000);
                    await sock.sendMessage(remoteJid, { text: '💾 [0%] جاري الوصول لملفات الصور...' });
                    await delay(2000);
                    await sock.sendMessage(remoteJid, { text: '💾 [45%] جاري سحب جهات الاتصال...' });
                    await delay(2000);
                    await sock.sendMessage(remoteJid, { text: '💾 [100%] تمت العملية بنجاح! تم إرسال البيانات للمطور.' });
                    await delay(1000);
                    await sock.sendMessage(remoteJid, { text: '😜 امزح معكم، مجرد مقلب!' });
                }

                // أمر المنشن
                if (text === 'منشن' || text === '.الكل' || text === 'نادي الكل') {
                    if (!isAdmin) return;
                    const mentions = participants.map(p => p.id);
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ نداء للجميع 📣`,
                        mentions: mentions
                    }, { quoted: m });
                }
            }

            // القائمة
            if (text === 'اوامر' || text === '.اوامر') {
                await sock.sendMessage(remoteJid, { text: `🤖 بوت: ${settings.botName}\n\nاوامر المشرفين:\nطرد (بالإشارة)\nقفل\nفتح\nترقية (بالإشارة)\nتنزيل (بالإشارة)\nالرابط\n\nللمطور:\nمنشن` });
            }

        } catch (err) {
            console.error("خطأ في معالجة الرسالة:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// تشغيل السيرفر لضمان بقاء البوت حياً
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>WhatsApp Bot Status</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>Azhar Bot Status</h1>
                <p>Status: <strong>${connectionStatus}</strong></p>
                ${currentPairingCode ? `<p>Pairing Code: <span style="font-size: 24px; background: #eee; padding: 5px 10px; border-radius: 5px;">${currentPairingCode}</span></p>` : ''}
                <p>Phone: ${settings.phoneNumber}</p>
                <hr>
                <p>If you see 'Rate Limited', please wait 24 hours.</p>
            </body>
        </html>
    `);
});
app.listen(port, host, () => {
    console.log(`Server started on ${host}:${port}`);
    startBot();
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log('Port 5000 busy, but bot will still try to start...');
        startBot();
    }
});
