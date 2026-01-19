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
    phoneNumber: "201061475436", // رقمك (المسموح له فقط باستخدام المنشن)
    ownerName: "mohamm3d",
    botName: "mohamm3d"
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
