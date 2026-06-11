const { exec } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');

// ===== إعدادات السيرفر للواجهة HTML =====
const wss = new WebSocket.Server({ port: 8080 });
console.log('🟢 سيرفر الواجهة شغال على: ws://localhost:8080');
console.log('📡 افتح ملف radar.html في المتصفح هسي\n');

wss.on('connection', () => {
  console.log('متصفح اتصل بالرادار');
});

// ===== إعدادات الرادار =====
let lastRSSI = null;
let history = []; // مصفوفة تخزين آخر 20 قراءة عشان البصمة
const WINDOW_SIZE = 20;
let eventCount = 0;

// أمر قراءة RSSI للويندوز
const cmd = 'netsh wlan show interfaces | findstr "Signal"';

// دالة حساب الانحراف المعياري = بصمة التذبذب
function calculateStdDev(arr) {
  if(arr.length === 0) return 0;
  let mean = arr.reduce((a,b) => a + b) / arr.length;
  let variance = arr.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// دالة تخمين الركن - حرفنة لحد ما نعمل معايرة
function guessRoom(stdDev, change) {
  if(stdDev < 1.5) return 0; // فاضي
  if(change > 10) return Math.floor(Math.random() * 4) + 1; // حركة قوية
  return 0;
}

console.log('جاري قراءة إشارة الواي فاي كل ثانية...\n');

setInterval(() => {
  exec(cmd, (error, stdout) => {
    if (error) {
      console.error('خطأ في القراءة:', error.message);
      return;
    }

    const match = stdout.match(/Signal\s*:\s*(\d+)%/);
    if (match) {
      let percent = parseInt(match[1]);
      let rssi = Math.round((percent / 2) - 100); // تحويل % إلى dBm

      // خزن في الهيستوري
      history.push(rssi);
      if(history.length > WINDOW_SIZE) history.shift();

      // احسب البصمة
      let stdDev = calculateStdDev(history);

      // احسب النطة من آخر قراءة
      let change = lastRSSI!== null? Math.abs(rssi - lastRSSI) : 0;

      // خمن الركن
      let room = guessRoom(stdDev, change);

      // اطبع في الـ cmd
      let status = RSSI: ${rssi}dBm | التذبذب: ${stdDev.toFixed(2)} | النطة: ${change.toFixed(1)}dBm;
      if(change > 😎 status += ' 🔥 حركة مكتشفة!';
      if(stdDev > 3.5 && change > 12) status += ' 👻 كائن مجهول!';
      console.log(status);

      // احفظ الحدث لو في نطة قوية
      if(change > 😎 {
        eventCount++;
        let timestamp = new Date().toISOString();
        let eventLine = ${timestamp}, ${lastRSSI?.toFixed(1) || 'N/A'}dBm -> ${rssi.toFixed(1)}dBm, النطة: ${change.toFixed(1)}dBm, التذبذب: ${stdDev.toFixed(2)}\n;
        fs.appendFileSync('wifi_events.csv', eventLine);
      }

      // أرسل للـ HTML عبر WebSocket
      wss.clients.forEach(client => {
        if(client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ rssi, change, stdDev, room }));
        }
      });

      lastRSSI = rssi;
    } else {
      console.log('ما قدرت أقرأ الإشارة - اتأكد انك متصل بواي فاي');
    }
  });
}, 1000); // كل ثانية