#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ===== PIN CONFIGURATION =====
#define SPI_SCK   25
#define SPI_MISO  26
#define SPI_MOSI  27
#define RFID_VCC   4
#define ACTIVE_READERS 4
const byte READER_SS[4]  = {33, 17, 16, 21};
const byte READER_RST[4] = {32, 22, 14, 13};
#define LED_PIN 2

// ===== LOG RING BUFFER =====
#define LOG_LINES 100
#define LOG_LINE_LEN 120
char logBuffer[LOG_LINES][LOG_LINE_LEN];
int logHead = 0;       // next write position
int logCount = 0;       // total lines written (for sequence tracking)
unsigned long logTimes[LOG_LINES]; // millis timestamp per line

void logMsg(const char* msg) {
    Serial.println(msg);
    strncpy(logBuffer[logHead], msg, LOG_LINE_LEN - 1);
    logBuffer[logHead][LOG_LINE_LEN - 1] = '\0';
    logTimes[logHead] = millis();
    logHead = (logHead + 1) % LOG_LINES;
    logCount++;
}

void logf(const char* fmt, ...) {
    char buf[LOG_LINE_LEN];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    logMsg(buf);
}

// ===== HARDCODED DEFAULTS =====
// These are used on first boot. Can be overridden via the config portal (192.168.4.1).
// After first save, the portal values take precedence (stored in NVS flash).
#define DEFAULT_BACKEND_URL "https://ttdnd-game.vercel.app"
#define DEFAULT_PLATE_ID    "plate-1"
#define DEFAULT_API_TOKEN   "6522745c-ed55-48f1-a48d-55a93e35fa1f"

// ===== GLOBALS =====
MFRC522 readers[ACTIVE_READERS];
Preferences prefs;
String wifiSSID = "";
String wifiPass = "";
String backendUrl = "";
String plateId = "";
String apiToken = "";
unsigned long lastCardTime[4] = {0, 0, 0, 0};
const unsigned long DEBOUNCE_MS = 3000;
WebServer server(80);
DNSServer dnsServer;

// ===== WIFI STATE MACHINE =====
enum WifiState { WIFI_IDLE, WIFI_CONNECTING, WIFI_CONNECTED, WIFI_RECONNECTING };
WifiState wifiState = WIFI_IDLE;
unsigned long wifiStateStart = 0;
const unsigned long WIFI_CONNECT_TIMEOUT = 10000;   // 10s to connect
const unsigned long WIFI_RECONNECT_INTERVAL = 15000; // 15s between reconnect attempts
unsigned long lastWifiAttempt = 0;

bool isWifiConnected() {
    return wifiState == WIFI_CONNECTED;
}

// ===== BACKEND HEALTH =====
bool backendReachable = false;
unsigned long lastHealthCheck = 0;
unsigned long lastScanTime = 0;
const unsigned long HEALTH_CHECK_INTERVAL = 45000; // 45s between health checks
const unsigned long HEALTH_IDLE_AFTER = 30000;     // only check when idle for 30s

// ===== CARD MANAGER LOCK =====
bool cardManagerActive = false;
unsigned long cardManagerLastActivity = 0;
const unsigned long CARD_MANAGER_TIMEOUT = 120000; // Auto-deactivate after 2 min

// ===== SCAN QUEUE (offline retry) =====
struct PendingScan {
    bool active;
    int readerIndex;
    String rfidUid;
    int cardNumber;       // -1 if not read from memory
    uint8_t retries;
    unsigned long nextRetryAt;
};

#define MAX_QUEUE 12
PendingScan scanQueue[MAX_QUEUE];

void initScanQueue() {
    for (int i = 0; i < MAX_QUEUE; i++) {
        scanQueue[i].active = false;
    }
}

int queueCount() {
    int count = 0;
    for (int i = 0; i < MAX_QUEUE; i++) {
        if (scanQueue[i].active) count++;
    }
    return count;
}

bool enqueueScan(int readerIndex, const String &uid, int cardNumber) {
    for (int i = 0; i < MAX_QUEUE; i++) {
        if (!scanQueue[i].active) {
            scanQueue[i].active = true;
            scanQueue[i].readerIndex = readerIndex;
            scanQueue[i].rfidUid = uid;
            scanQueue[i].cardNumber = cardNumber;
            scanQueue[i].retries = 0;
            scanQueue[i].nextRetryAt = millis() + 2000; // first retry in 2s
            logf("[Queue] Enqueued scan: reader %d, uid %s (queue: %d)", readerIndex, uid.c_str(), queueCount());
            return true;
        }
    }
    logMsg("[Queue] FULL — scan dropped!");
    return false;
}

// Forward declarations
void connectWiFiAsync();
bool sendScanHTTP(int readerIndex, const String &uid, int cardNumber);
void sendTestScan(int readerIndex, const String &uid, int cardNumber);

// ===== PORTAL HTML =====
const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RFID Game Reader</title>
<style>
body{font-family:sans-serif;max-width:400px;margin:40px auto;padding:0 20px;background:#1a1a2e;color:#eee}
h1{color:#e94560;text-align:center}
label{display:block;margin-top:15px;font-weight:bold}
input{width:100%;padding:10px;margin-top:5px;border:1px solid #444;border-radius:5px;background:#16213e;color:#eee;box-sizing:border-box}
button,.btn{width:100%;padding:12px;margin-top:10px;background:#e94560;color:#fff;border:none;border-radius:5px;font-size:16px;cursor:pointer;box-sizing:border-box}
button:hover,.btn:hover{background:#c73651}
.btn-scan{background:#0f3460;margin-top:5px}
.btn-scan:hover{background:#1a4f8a}
.btn-forget{background:#555;margin-top:10px;font-size:13px;padding:8px}
.btn-forget:hover{background:#c0392b}
.btn-debug{background:#2d6a4f;margin-top:15px}
.btn-debug:hover{background:#40916c}
.status{margin-top:20px;padding:15px;background:#16213e;border-radius:5px;font-size:14px}
.ok{color:#0f0}.err{color:#f44}.warn{color:#f90}
#nets{margin-top:8px;max-height:200px;overflow-y:auto}
.net{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin:4px 0;background:#16213e;border:1px solid #333;border-radius:5px;cursor:pointer}
.net:hover{border-color:#e94560}
.net .name{font-weight:bold}
.net .info{font-size:12px;color:#999}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<h1>RFID Game Reader</h1>
<form action="/save" method="POST">
<label>WiFi Network</label>
<input name="ssid" id="ssid" value="%SSID%" required placeholder="Select or type network name">
<button type="button" class="btn btn-scan" onclick="scanWifi()">Scan for Networks</button>
<div id="nets"></div>
<label>WiFi Password</label>
<input name="pass" value="%PASS%">
<label>Backend URL</label>
<input name="url" value="%URL%" placeholder="https://your-app.vercel.app">
<label>Plate ID</label>
<input name="plate" value="%PLATE%" placeholder="e.g. plate-1">
<label>API Token</label>
<input name="token" value="%TOKEN%" placeholder="Paste token from admin panel" type="password">
<button type="submit">Save & Connect</button>
</form>
<div class="status">
<b>Status:</b><br>
WiFi: <span class="%WIFI_CLASS%">%WIFI_STATUS%</span><br>
Backend: <span class="%BACKEND_CLASS%">%BACKEND_STATUS%</span><br>
Readers: %READERS%<br>
Queue: %QUEUE%<br>
Free heap: %HEAP% bytes
</div>
%FORGET_BTN%
<a href="/cardmgr"><button type="button" class="btn" style="background:#0f3460;margin-top:10px">Card Manager</button></a>
<a href="/debug"><button type="button" class="btn btn-debug">Debug Console</button></a>
<script>
function scanWifi(){
var d=document.getElementById('nets');
d.innerHTML='<p style="text-align:center"><span class="spin">&#9696;</span> Scanning...</p>';
fetch('/scan').then(r=>r.json()).then(nets=>{
if(!nets.length){d.innerHTML='<p>No networks found</p>';return;}
d.innerHTML='';
nets.forEach(n=>{
var el=document.createElement('div');
el.className='net';
el.innerHTML='<span><span class="name">'+n.ssid+'</span><br><span class="info">'+(n.open?'Open':'Secured')+'</span></span><span class="info">'+n.rssi+' dBm</span>';
el.onclick=function(){document.getElementById('ssid').value=n.ssid;d.innerHTML='';};
d.appendChild(el);
});
}).catch(()=>{d.innerHTML='<p class="err">Scan failed</p>';});
}
</script>
</body>
</html>
)rawliteral";

// ===== DEBUG CONSOLE HTML =====
const char DEBUG_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Debug Console</title>
<style>
*{box-sizing:border-box}
body{font-family:monospace;margin:0;padding:12px;background:#0a0a0a;color:#0f0;font-size:13px}
h2{color:#e94560;margin:0 0 10px;font-family:sans-serif}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.bar a,.bar button{padding:6px 14px;background:#222;color:#aaa;border:1px solid #444;border-radius:4px;text-decoration:none;font-size:12px;cursor:pointer;font-family:sans-serif}
.bar a:hover,.bar button:hover{background:#333;color:#fff}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}
.stat{background:#111;border:1px solid #222;border-radius:4px;padding:8px 10px}
.stat .label{color:#888;font-size:11px;font-family:sans-serif}
.stat .value{color:#0f0;font-size:15px;font-weight:bold;margin-top:2px}
.stat .value.warn{color:#f90}
.stat .value.err{color:#f44}
#term{background:#0d0d0d;border:1px solid #222;border-radius:4px;padding:10px;height:55vh;overflow-y:auto;white-space:pre-wrap;word-break:break-all;line-height:1.5}
.ts{color:#555}
.paused-banner{text-align:center;color:#f90;padding:4px;font-family:sans-serif;font-size:12px}
</style>
</head>
<body>
<h2>Debug Console</h2>
<div class="bar">
<a href="/">Settings</a>
<button onclick="clearTerm()">Clear</button>
<button id="pauseBtn" onclick="togglePause()">Pause</button>
<button onclick="location.reload()">Refresh</button>
</div>
<div class="stats">
<div class="stat"><div class="label">Free Heap</div><div class="value" id="heap">-</div></div>
<div class="stat"><div class="label">Min Free Heap</div><div class="value" id="minHeap">-</div></div>
<div class="stat"><div class="label">Sketch Size</div><div class="value" id="sketch">-</div></div>
<div class="stat"><div class="label">Free Sketch Space</div><div class="value" id="freeSketch">-</div></div>
<div class="stat"><div class="label">PSRAM</div><div class="value" id="psram">-</div></div>
<div class="stat"><div class="label">Uptime</div><div class="value" id="uptime">-</div></div>
<div class="stat"><div class="label">WiFi RSSI</div><div class="value" id="rssi">-</div></div>
<div class="stat"><div class="label">Scan Queue</div><div class="value" id="queue">-</div></div>
</div>
<div id="pausedMsg" class="paused-banner" style="display:none">-- PAUSED --</div>
<div id="term"></div>
<script>
var lastSeq=0,paused=false;
function fmt(ms){
var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);
return String(h).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function fmtBytes(b){
if(b>1048576)return (b/1048576).toFixed(1)+' MB';
if(b>1024)return (b/1024).toFixed(1)+' KB';
return b+' B';
}
function poll(){
if(paused)return;
fetch('/api/logs?since='+lastSeq).then(r=>r.json()).then(d=>{
// Update stats
document.getElementById('heap').textContent=fmtBytes(d.freeHeap);
document.getElementById('heap').className='value'+(d.freeHeap<50000?' warn':'')+(d.freeHeap<20000?' err':'');
document.getElementById('minHeap').textContent=fmtBytes(d.minFreeHeap);
document.getElementById('minHeap').className='value'+(d.minFreeHeap<30000?' warn':'');
document.getElementById('sketch').textContent=fmtBytes(d.sketchSize);
document.getElementById('freeSketch').textContent=fmtBytes(d.freeSketchSpace);
document.getElementById('psram').textContent=d.psramSize>0?fmtBytes(d.freePsram)+' / '+fmtBytes(d.psramSize):'None';
document.getElementById('uptime').textContent=fmt(d.uptime);
document.getElementById('rssi').textContent=d.rssi!=0?d.rssi+' dBm':'N/A';
document.getElementById('queue').textContent=d.queueSize;
document.getElementById('queue').className='value'+(d.queueSize>0?' warn':'');
// Append log lines
if(d.lines&&d.lines.length){
var t=document.getElementById('term');
d.lines.forEach(function(l){
t.innerHTML+='<span class="ts">['+fmt(l.t)+']</span> '+l.m.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'\n';
});
t.scrollTop=t.scrollHeight;
lastSeq=d.seq;
}
}).catch(()=>{});
}
function clearTerm(){document.getElementById('term').innerHTML='';}
function togglePause(){
paused=!paused;
document.getElementById('pauseBtn').textContent=paused?'Resume':'Pause';
document.getElementById('pausedMsg').style.display=paused?'block':'none';
}
setInterval(poll,800);
poll();
</script>
</body>
</html>
)rawliteral";

// ===== CARD MANAGER HTML =====
const char CARDMGR_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card Manager</title>
<style>
*{box-sizing:border-box}
body{font-family:sans-serif;margin:0;padding:16px;background:#1a1a2e;color:#eee;max-width:440px;margin:0 auto}
h2{color:#e94560;margin:0 0 16px;text-align:center;font-size:22px}
.nav{display:flex;gap:8px;margin-bottom:16px;justify-content:center}
.nav a{padding:8px 16px;background:#222;color:#aaa;border:1px solid #444;border-radius:6px;text-decoration:none;font-size:13px}
.nav a:hover{background:#333;color:#fff}
.card{background:#16213e;border:1px solid #333;border-radius:10px;padding:20px;margin-bottom:14px}
.card h3{margin:0 0 8px;color:#fff;font-size:17px}
.card p{margin:0 0 14px;color:#888;font-size:13px;line-height:1.4}
.btn{width:100%;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;color:#fff}
.btn:disabled{opacity:0.5;cursor:not-allowed}
.btn-read{background:#0f3460}
.btn-read:hover:not(:disabled){background:#1a5a9a}
.btn-write{background:#2d6a4f}
.btn-write:hover:not(:disabled){background:#40916c}
.btn-wipe{background:#c0392b}
.btn-wipe:hover:not(:disabled){background:#e74c3c}
.num-input{width:100%;padding:14px;font-size:24px;text-align:center;background:#0d0d0d;border:2px solid #333;border-radius:8px;color:#fff;margin-bottom:12px;font-weight:bold}
.num-input:focus{border-color:#2d6a4f;outline:none}
.msg{margin-top:12px;padding:14px;border-radius:8px;font-size:15px;text-align:center;display:none;font-weight:bold}
.msg.show{display:block}
.msg.ok{background:#1b4332;border:1px solid #2d6a4f;color:#95d5b2}
.msg.err{background:#3d0000;border:1px solid #c0392b;color:#ff6b6b}
.msg.warn{background:#3d2e00;border:1px solid #f59e0b;color:#fcd34d}
.msg.wait{background:#0a1628;border:1px solid #0f3460;color:#a2d2ff}
.big-num{font-size:48px;text-align:center;color:#0f0;font-weight:bold;margin:10px 0}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<h2>Card Manager</h2>
<div class="nav">
<a href="/">Settings</a>
<a href="/debug">Debug</a>
</div>

<div class="card">
<h3>Read Card</h3>
<p>Place a card on the reader, then press Read.</p>
<button class="btn btn-read" id="readBtn" onclick="readCard()">Read Card</button>
<div class="msg" id="readMsg"></div>
</div>

<div class="card">
<h3>Write Number to Card</h3>
<p>Type a number, place the card on the reader, then press Write.</p>
<input type="number" class="num-input" id="writeNum" min="1" max="9999" placeholder="Enter number (1-9999)">
<button class="btn btn-write" id="writeBtn" onclick="writeCard()">Write to Card</button>
<div class="msg" id="writeMsg"></div>
</div>

<div class="card">
<h3>Wipe Card</h3>
<p>Place a card on the reader, then press Wipe to erase it.</p>
<button class="btn btn-wipe" id="wipeBtn" onclick="wipeCard()">Wipe Card</button>
<div class="msg" id="wipeMsg"></div>
</div>

<script>
function show(id,html,cls){var e=document.getElementById(id);e.innerHTML=html;e.className='msg show '+cls;}
function hide(id){document.getElementById(id).className='msg';}
function lock(id,t){var b=document.getElementById(id);b.disabled=true;b.dataset.t=b.textContent;b.innerHTML='<span class="spin">&#9696;</span> '+t;}
function unlock(id){var b=document.getElementById(id);b.disabled=false;b.textContent=b.dataset.t;}

function readCard(){
lock('readBtn','Reading...');hide('readMsg');
fetch('/api/card/read').then(r=>r.json()).then(d=>{
unlock('readBtn');
if(d.error){show('readMsg',d.error,'err');return;}
if(d.hasNumber){
show('readMsg','This card is:<div class="big-num">#'+d.number+'</div>UID: '+d.uid,'ok');
}else{
show('readMsg','This card has no number.<br>UID: '+d.uid+'<br>Please wipe it first, then write a number.','warn');
}
}).catch(e=>{unlock('readBtn');show('readMsg','Could not reach the reader. Try again.','err');});
}

function writeCard(){
var n=parseInt(document.getElementById('writeNum').value);
if(!n||n<1||n>9999){show('writeMsg','Please enter a number between 1 and 9999.','err');return;}
lock('writeBtn','Writing...');hide('writeMsg');
fetch('/api/card/write',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({number:n})
}).then(r=>r.json()).then(d=>{
unlock('writeBtn');
if(d.error){show('writeMsg',d.error,'err');return;}
show('writeMsg','Card is now <b>#'+d.number+'</b>','ok');
}).catch(e=>{unlock('writeBtn');show('writeMsg','Could not reach the reader. Try again.','err');});
}

function wipeCard(){
lock('wipeBtn','Wiping...');hide('wipeMsg');
fetch('/api/card/wipe',{method:'POST'}).then(r=>r.json()).then(d=>{
unlock('wipeBtn');
if(d.error){show('wipeMsg',d.error,'err');return;}
show('wipeMsg','Card wiped successfully! It is now blank.','ok');
}).catch(e=>{unlock('wipeBtn');show('wipeMsg','Could not reach the reader. Try again.','err');});
}

// Tell ESP32 to resume scanning when leaving Card Manager
window.addEventListener('beforeunload',function(){navigator.sendBeacon('/api/card/exit','');});
// Also handle link clicks (beforeunload may not fire on mobile nav)
document.querySelectorAll('.nav a').forEach(function(a){a.addEventListener('click',function(){fetch('/api/card/exit',{method:'POST'});});});
</script>
</body>
</html>
)rawliteral";

// ===== HELPERS =====
String uidToString(byte *uid, byte size) {
    String s = "";
    for (byte i = 0; i < size; i++) {
        if (i > 0) s += ":";
        if (uid[i] < 0x10) s += "0";
        s += String(uid[i], HEX);
    }
    s.toUpperCase();
    return s;
}

void blinkLED(int times, int ms) {
    for (int i = 0; i < times; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(ms);
        digitalWrite(LED_PIN, LOW);
        if (i < times - 1) delay(ms);
    }
}

// ===== CONFIG =====
void loadConfig() {
    prefs.begin("rfid", true);
    wifiSSID = prefs.getString("ssid", "");
    wifiPass = prefs.getString("pass", "");
    backendUrl = prefs.getString("url", "");
    plateId = prefs.getString("plate", "");
    apiToken = prefs.getString("token", "");
    prefs.end();

    // Apply hardcoded defaults for fields that are still empty
    if (backendUrl.length() == 0) backendUrl = DEFAULT_BACKEND_URL;
    if (plateId.length() == 0)    plateId = DEFAULT_PLATE_ID;
    if (apiToken.length() == 0)   apiToken = DEFAULT_API_TOKEN;

    logMsg("Config loaded:");
    logf("  SSID:  %s", wifiSSID.c_str());
    logf("  URL:   %s", backendUrl.c_str());
    logf("  Plate: %s", plateId.c_str());
    logf("  Token: %s", apiToken.length() > 0 ? "****" : "(not set)");
}

void saveConfig() {
    prefs.begin("rfid", false);
    prefs.putString("ssid", wifiSSID);
    prefs.putString("pass", wifiPass);
    prefs.putString("url", backendUrl);
    prefs.putString("plate", plateId);
    prefs.putString("token", apiToken);
    prefs.end();
    logMsg("Config saved");
}

// ===== WEB PORTAL =====
String buildPortalPage() {
    String html = String(PORTAL_HTML);
    html.replace("%SSID%", wifiSSID);
    html.replace("%PASS%", wifiPass);
    html.replace("%URL%", backendUrl);
    html.replace("%PLATE%", plateId);
    html.replace("%TOKEN%", apiToken);
    html.replace("%WIFI_STATUS%", isWifiConnected() ? "Connected (" + WiFi.localIP().toString() + ")" : "Not connected");
    html.replace("%WIFI_CLASS%", isWifiConnected() ? "ok" : "err");
    html.replace("%BACKEND_STATUS%", backendReachable ? "Reachable" : "Unknown");
    html.replace("%BACKEND_CLASS%", backendReachable ? "ok" : "warn");
    html.replace("%READERS%", String(ACTIVE_READERS) + " active");
    html.replace("%QUEUE%", String(queueCount()) + " pending");
    html.replace("%HEAP%", String(ESP.getFreeHeap()));
    if (wifiSSID.length() > 0) {
        html.replace("%FORGET_BTN%",
            "<form action='/forget' method='POST'>"
            "<button type='submit' class='btn btn-forget'>Forget Network (" + wifiSSID + ")</button>"
            "</form>");
    } else {
        html.replace("%FORGET_BTN%", "");
    }
    return html;
}

void handlePortalRoot() {
    server.send(200, "text/html", buildPortalPage());
}

void handlePortalSave() {
    wifiSSID = server.arg("ssid");
    wifiPass = server.arg("pass");
    backendUrl = server.arg("url");
    plateId = server.arg("plate");
    apiToken = server.arg("token");
    if (backendUrl.endsWith("/")) {
        backendUrl = backendUrl.substring(0, backendUrl.length() - 1);
    }
    saveConfig();
    server.send(200, "text/html",
        "<html><body style='font-family:sans-serif;text-align:center;background:#1a1a2e;color:#eee;padding:40px'>"
        "<h2>Saved!</h2><p>Connecting to WiFi...</p>"
        "<p>Config portal stays at <b>192.168.4.1</b></p>"
        "</body></html>");
    delay(500);
    connectWiFiAsync();
}

void handleForgetNetwork() {
    wifiSSID = "";
    wifiPass = "";
    saveConfig();
    WiFi.disconnect();
    wifiState = WIFI_IDLE;
    backendReachable = false;
    digitalWrite(LED_PIN, LOW);
    logMsg("Network forgotten, WiFi disconnected");
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
}

// ===== WIFI SCAN =====
void handleWifiScan() {
    logMsg("Scanning WiFi networks...");
    int n = WiFi.scanNetworks();
    logf("Found %d networks", n);
    String json = "[";
    for (int i = 0; i < n; i++) {
        if (i > 0) json += ",";
        json += "{\"ssid\":\"";
        String ssid = WiFi.SSID(i);
        ssid.replace("\"", "\\\"");
        json += ssid;
        json += "\",\"rssi\":";
        json += String(WiFi.RSSI(i));
        json += ",\"open\":";
        json += (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "true" : "false";
        json += "}";
    }
    json += "]";
    WiFi.scanDelete();
    server.send(200, "application/json", json);
}

// ===== DEBUG CONSOLE =====
void handleDebugPage() {
    server.send(200, "text/html", String(DEBUG_HTML));
}

void handleLogsAPI() {
    int since = server.arg("since").toInt();

    // Build JSON response with logs + system stats
    String json = "{";

    // System stats
    json += "\"freeHeap\":" + String(ESP.getFreeHeap());
    json += ",\"minFreeHeap\":" + String(ESP.getMinFreeHeap());
    json += ",\"sketchSize\":" + String(ESP.getSketchSize());
    json += ",\"freeSketchSpace\":" + String(ESP.getFreeSketchSpace());
    json += ",\"psramSize\":" + String(ESP.getPsramSize());
    json += ",\"freePsram\":" + String(ESP.getFreePsram());
    json += ",\"uptime\":" + String(millis());
    json += ",\"rssi\":" + String(isWifiConnected() ? WiFi.RSSI() : 0);
    json += ",\"apClients\":" + String(WiFi.softAPgetStationNum());
    json += ",\"queueSize\":" + String(queueCount());
    json += ",\"seq\":" + String(logCount);

    // Log lines since last request
    json += ",\"lines\":[";
    int available = min(logCount, LOG_LINES);
    int newLines = logCount - since;
    if (newLines < 0) newLines = available; // client reset
    if (newLines > available) newLines = available;

    bool first = true;
    int startIdx = (logHead - newLines + LOG_LINES) % LOG_LINES;
    for (int i = 0; i < newLines; i++) {
        int idx = (startIdx + i) % LOG_LINES;
        if (!first) json += ",";
        first = false;
        json += "{\"t\":" + String(logTimes[idx]) + ",\"m\":\"";
        // Escape JSON special chars
        for (int c = 0; logBuffer[idx][c] != '\0'; c++) {
            char ch = logBuffer[idx][c];
            if (ch == '"') json += "\\\"";
            else if (ch == '\\') json += "\\\\";
            else if (ch == '\n') json += "\\n";
            else if (ch >= 32) json += ch;
        }
        json += "\"}";
    }
    json += "]}";

    server.send(200, "application/json", json);
}

// ===== CARD MANAGER FUNCTIONS =====
//
// Card data format (16 bytes in sector 1, block 0 = absolute block 4):
//   Bytes 0-3:  "GAME" magic header
//   Bytes 4-7:  Card number as uint32 little-endian
//   Bytes 8-15: Zero padding
//
#define CARD_DATA_BLOCK 4   // Sector 1, block 0
#define CARD_MAGIC "GAME"

// Wait for a card to be present, with timeout.
// Fully resets the reader first to clear any stale crypto/auth state,
// then uses WUPA to detect cards in both IDLE and HALT state.
bool waitForCard(MFRC522 &reader, unsigned long timeoutMs) {
    // Full reset: clear crypto state and reinitialize the reader
    reader.PCD_StopCrypto1();
    reader.PCD_Init();
    delay(20);

    unsigned long start = millis();
    while (millis() - start < timeoutMs) {
        // WUPA wakes cards in both IDLE and HALT state.
        // PICC_IsNewCardPresent() sends REQA which misses halted cards.
        byte atqa[2];
        byte atqaLen = sizeof(atqa);
        reader.PCD_WriteRegister(reader.BitFramingReg, 0x07);
        MFRC522::StatusCode s = reader.PICC_WakeupA(atqa, &atqaLen);
        if (s == MFRC522::STATUS_OK || s == MFRC522::STATUS_COLLISION) {
            if (reader.PICC_ReadCardSerial()) {
                return true;
            }
        }
        delay(50);
    }
    return false;
}

// Authenticate sector 1 using factory default key (FFFFFFFFFFFF).
bool authSector1(MFRC522 &reader) {
    MFRC522::MIFARE_Key key;
    memset(key.keyByte, 0xFF, 6);
    byte trailer = 7; // sector 1 trailer block
    MFRC522::StatusCode s = reader.PCD_Authenticate(
        MFRC522::PICC_CMD_MF_AUTH_KEY_A, trailer, &key, &(reader.uid));
    if (s != MFRC522::STATUS_OK) {
        logf("[CardMgr] Auth failed: %s", reader.GetStatusCodeName(s));
    }
    return s == MFRC522::STATUS_OK;
}

// Read card number from MIFARE memory. Returns -1 if no valid number found.
int readCardNumber(MFRC522 &reader) {
    if (!authSector1(reader)) {
        return -1;
    }

    byte buffer[18];
    byte bufLen = sizeof(buffer);
    MFRC522::StatusCode status = reader.MIFARE_Read(CARD_DATA_BLOCK, buffer, &bufLen);

    if (status != MFRC522::STATUS_OK) {
        return -1;
    }

    // Check for GAME magic header
    if (buffer[0] != 'G' || buffer[1] != 'A' || buffer[2] != 'M' || buffer[3] != 'E') {
        return -1;
    }

    uint32_t num = buffer[4] | (buffer[5] << 8) | (buffer[6] << 16) | (buffer[7] << 24);
    return (int)num;
}

void handleCardManagerPage() {
    cardManagerActive = true;
    cardManagerLastActivity = millis();
    logMsg("[CardMgr] Activated — scanning paused");
    server.send(200, "text/html", String(CARDMGR_HTML));
}

void handleCardRead() {
    cardManagerActive = true;
    cardManagerLastActivity = millis();
    MFRC522 &reader = readers[0];

    if (!waitForCard(reader, 3000)) {
        server.send(200, "application/json",
            "{\"error\":\"No card detected. Place a card on the reader and try again.\"}");
        return;
    }

    String uid = uidToString(reader.uid.uidByte, reader.uid.size);
    logf("[CardMgr] Read card UID: %s", uid.c_str());

    if (!authSector1(reader)) {
        reader.PICC_HaltA();
        reader.PCD_StopCrypto1();
        logf("[CardMgr] Read aborted — auth failed for UID: %s", uid.c_str());
        server.send(200, "application/json",
            "{\"error\":\"Cannot read this card. Try wiping it first.\"}");
        return;
    }

    byte buffer[18];
    byte bufLen = sizeof(buffer);
    MFRC522::StatusCode status = reader.MIFARE_Read(CARD_DATA_BLOCK, buffer, &bufLen);

    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();

    if (status != MFRC522::STATUS_OK) {
        server.send(200, "application/json",
            "{\"error\":\"Card read failed. Try wiping it first.\"}");
        return;
    }

    // Check for GAME magic header
    bool hasNumber = (buffer[0] == 'G' && buffer[1] == 'A' &&
                      buffer[2] == 'M' && buffer[3] == 'E');

    JsonDocument doc;
    doc["uid"] = uid;
    doc["hasNumber"] = hasNumber;

    if (hasNumber) {
        uint32_t num = buffer[4] | (buffer[5] << 8) |
                       (buffer[6] << 16) | (buffer[7] << 24);
        doc["number"] = num;
        logf("[CardMgr] Card #%u", num);
    } else {
        logMsg("[CardMgr] Card has no valid number");
    }

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
}

void handleCardWrite() {
    if (server.method() != HTTP_POST) {
        server.send(405, "application/json", "{\"error\":\"POST required\"}");
        return;
    }

    JsonDocument reqDoc;
    DeserializationError err = deserializeJson(reqDoc, server.arg("plain"));
    if (err) {
        server.send(400, "application/json", "{\"error\":\"Invalid request.\"}");
        return;
    }

    int number = reqDoc["number"] | 0;
    if (number < 1 || number > 9999) {
        server.send(200, "application/json",
            "{\"error\":\"Please enter a number between 1 and 9999.\"}");
        return;
    }

    cardManagerActive = true;
    cardManagerLastActivity = millis();
    MFRC522 &reader = readers[0];
    if (!waitForCard(reader, 3000)) {
        server.send(200, "application/json",
            "{\"error\":\"No card detected. Place a card on the reader and try again.\"}");
        return;
    }

    logf("[CardMgr] Writing #%d to card", number);

    if (!authSector1(reader)) {
        reader.PICC_HaltA();
        reader.PCD_StopCrypto1();
        logMsg("[CardMgr] Write aborted — auth failed");
        server.send(200, "application/json",
            "{\"error\":\"Cannot write to this card. Try wiping it first.\"}");
        return;
    }

    // Build data block: GAME + uint32 LE + zeros
    byte data[16] = {0};
    data[0] = 'G'; data[1] = 'A'; data[2] = 'M'; data[3] = 'E';
    data[4] = (byte)(number & 0xFF);
    data[5] = (byte)((number >> 8) & 0xFF);
    data[6] = (byte)((number >> 16) & 0xFF);
    data[7] = (byte)((number >> 24) & 0xFF);

    MFRC522::StatusCode status = reader.MIFARE_Write(CARD_DATA_BLOCK, data, 16);
    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();

    if (status != MFRC522::STATUS_OK) {
        server.send(200, "application/json",
            "{\"error\":\"Write failed. Try wiping the card first.\"}");
        logf("[CardMgr] Write failed: %s", reader.GetStatusCodeName(status));
        return;
    }

    String resp = "{\"success\":true,\"number\":" + String(number) + "}";
    server.send(200, "application/json", resp);
    logf("[CardMgr] Write OK: card is now #%d", number);
}

void handleCardWipe() {
    if (server.method() != HTTP_POST) {
        server.send(405, "application/json", "{\"error\":\"POST required\"}");
        return;
    }

    cardManagerActive = true;
    cardManagerLastActivity = millis();
    MFRC522 &reader = readers[0];
    if (!waitForCard(reader, 3000)) {
        server.send(200, "application/json",
            "{\"error\":\"No card detected. Place a card on the reader and try again.\"}");
        return;
    }

    String uid = uidToString(reader.uid.uidByte, reader.uid.size);
    MFRC522::PICC_Type piccType = reader.PICC_GetType(reader.uid.sak);
    String typeName = String(reader.PICC_GetTypeName(piccType));
    logf("[CardMgr] Wiping card UID: %s  Type: %s", uid.c_str(), typeName.c_str());

    if (!authSector1(reader)) {
        reader.PICC_HaltA();
        reader.PCD_StopCrypto1();
        logf("[CardMgr] Wipe aborted — auth failed for UID: %s", uid.c_str());
        String errMsg = "{\"error\":\"Auth failed for this card (";
        errMsg += typeName.c_str();
        errMsg += "). It may use a non-standard key.\"}";
        server.send(200, "application/json", errMsg);
        return;
    }

    // Zero out the data block
    byte zeroBlock[16] = {0};
    MFRC522::StatusCode status = reader.MIFARE_Write(CARD_DATA_BLOCK, zeroBlock, 16);
    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();

    if (status != MFRC522::STATUS_OK) {
        server.send(200, "application/json",
            "{\"error\":\"Wipe failed. The card may be write-protected.\"}");
        logf("[CardMgr] Wipe failed: %s", reader.GetStatusCodeName(status));
        return;
    }

    server.send(200, "application/json", "{\"success\":true}");
    logf("[CardMgr] Card wiped: %s", uid.c_str());
}

void handleCardManagerExit() {
    cardManagerActive = false;
    logMsg("[CardMgr] Deactivated — scanning resumed");
    server.send(200, "application/json", "{\"success\":true}");
}

// ===== CAPTIVE PORTAL DETECTION =====
void handleRedirect() {
    server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
    server.send(302, "text/plain", "");
}

void handleNotFound() {
    // Don't redirect /debug or /api paths
    String uri = server.uri();
    if (uri.startsWith("/debug") || uri.startsWith("/api/") || uri.startsWith("/cardmgr")) {
        server.send(404, "text/plain", "Not found");
        return;
    }
    handleRedirect();
}

// ===== WIFI (non-blocking) =====
void connectWiFiAsync() {
    if (wifiSSID.length() == 0) {
        logMsg("No WiFi SSID configured");
        wifiState = WIFI_IDLE;
        return;
    }

    logf("Connecting to WiFi: %s", wifiSSID.c_str());
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    wifiState = WIFI_CONNECTING;
    wifiStateStart = millis();
    lastWifiAttempt = millis();
}

void updateWiFiState() {
    unsigned long now = millis();

    switch (wifiState) {
        case WIFI_IDLE:
            // If we have SSID but aren't connected, try periodically
            if (wifiSSID.length() > 0 && (now - lastWifiAttempt >= WIFI_RECONNECT_INTERVAL)) {
                connectWiFiAsync();
            }
            break;

        case WIFI_CONNECTING:
        case WIFI_RECONNECTING:
            if (WiFi.status() == WL_CONNECTED) {
                wifiState = WIFI_CONNECTED;
                logf("WiFi connected! IP: %s", WiFi.localIP().toString().c_str());
                digitalWrite(LED_PIN, HIGH);
                backendReachable = false; // re-check on next health ping
            } else if (now - wifiStateStart >= WIFI_CONNECT_TIMEOUT) {
                logMsg("WiFi connection timed out");
                wifiState = WIFI_IDLE;
                lastWifiAttempt = now;
                WiFi.disconnect();
            }
            break;

        case WIFI_CONNECTED:
            if (WiFi.status() != WL_CONNECTED) {
                logMsg("WiFi disconnected");
                wifiState = WIFI_RECONNECTING;
                wifiStateStart = now;
                backendReachable = false;
                WiFi.reconnect();
            }
            break;
    }
}

// ===== HTTP SEND (supports HTTPS) =====
bool sendScanHTTP(int readerIndex, const String &uid, int cardNumber) {
    if (!isWifiConnected() || backendUrl.length() == 0 || plateId.length() == 0) {
        return false;
    }

    String url = backendUrl + "/api/hardware/scan";
    logf("POST %s", url.c_str());

    HTTPClient http;
    bool isHttps = backendUrl.startsWith("https://");

    if (isHttps) {
        WiFiClientSecure *client = new WiFiClientSecure();
        client->setInsecure(); // skip cert verification — we have bearer token auth
        http.begin(*client, url);
    } else {
        http.begin(url);
    }

    http.addHeader("Content-Type", "application/json");
    if (apiToken.length() > 0) {
        http.addHeader("Authorization", "Bearer " + apiToken);
    }
    http.setTimeout(8000); // 8s timeout for HTTPS handshake overhead

    JsonDocument doc;
    doc["plateId"] = plateId;
    doc["readerIndex"] = readerIndex;
    doc["rfidUid"] = uid;
    if (cardNumber > 0) {
        doc["cardNumber"] = cardNumber;
    }

    String body;
    serializeJson(doc, body);
    logf("  Body: %s", body.c_str());

    int httpCode = http.POST(body);
    bool success = false;

    if (httpCode > 0) {
        String response = http.getString();
        logf("  Response [%d]: %s", httpCode, response.c_str());
        backendReachable = true;
        lastHealthCheck = millis(); // successful POST counts as health check

        if (httpCode == 200) {
            blinkLED(2, 100);  // Success: 2 flashes
            success = true;
        } else if (httpCode == 401) {
            logMsg("  ERROR: Invalid API token — not retrying");
            blinkLED(6, 50);
            success = true; // don't retry auth errors
        } else if (httpCode == 409) {
            logMsg("  No active game — sending test scan instead");
            http.end();
            sendTestScan(readerIndex, uid, cardNumber);
            return true; // handled via test-scan
        } else if (httpCode == 404) {
            logMsg("  ERROR: Unknown card (not registered)");
            blinkLED(4, 50);
            success = true; // don't retry — card not in system
        } else if (httpCode >= 500) {
            logMsg("  Server error — will retry");
            blinkLED(3, 150);
            // success stays false → will be queued for retry
        } else {
            logf("  Unexpected status %d — not retrying", httpCode);
            blinkLED(4, 50);
            success = true;
        }
    } else {
        logf("  HTTP error: %s", http.errorToString(httpCode).c_str());
        backendReachable = false;
        blinkLED(3, 150); // Connection error: 3 slow flashes
        // success stays false → will be queued for retry
    }

    http.end();
    return success;
}

// ===== TEST SCAN (verify card outside a game) =====
void sendTestScan(int readerIndex, const String &uid, int cardNumber) {
    String url = backendUrl + "/api/hardware/test-scan";
    logf("[TestScan] POST %s", url.c_str());

    HTTPClient http;
    bool isHttps = backendUrl.startsWith("https://");

    if (isHttps) {
        WiFiClientSecure *client = new WiFiClientSecure();
        client->setInsecure();
        http.begin(*client, url);
    } else {
        http.begin(url);
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + apiToken);
    http.setTimeout(8000);

    JsonDocument doc;
    doc["rfidUid"] = uid;
    doc["readerIndex"] = readerIndex;
    if (cardNumber > 0) {
        doc["cardNumber"] = cardNumber;
    }

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);

    if (httpCode == 200) {
        String response = http.getString();
        logf("[TestScan] OK: %s", response.c_str());

        // Parse response to show card info
        JsonDocument respDoc;
        DeserializationError err = deserializeJson(respDoc, response);
        if (!err) {
            const char* status = respDoc["status"] | "unknown";
            if (strcmp(status, "verified") == 0) {
                int num = respDoc["cardNumber"] | 0;
                const char* text = respDoc["cardText"] | "";
                logf("[TestScan] VERIFIED: Card #%d = \"%s\"", num, text);
                blinkLED(3, 200); // Slow triple blink = verified
            } else {
                logf("[TestScan] Card not verified: %s", status);
                blinkLED(5, 80); // Quick 5 flashes = needs attention
            }
        }
    } else if (httpCode > 0) {
        logf("[TestScan] Error [%d]: %s", httpCode, http.getString().c_str());
        blinkLED(4, 50);
    } else {
        logf("[TestScan] HTTP error: %s", http.errorToString(httpCode).c_str());
    }

    http.end();
}

// ===== BACKEND HEALTH CHECK =====
void checkBackendHealth() {
    if (!isWifiConnected() || backendUrl.length() == 0 || plateId.length() == 0) return;

    unsigned long now = millis();

    // Only check when idle (no scans recently) and interval has passed
    if (now - lastScanTime < HEALTH_IDLE_AFTER) return;
    if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) return;
    lastHealthCheck = now;

    String url = backendUrl + "/api/hardware/scan?plateId=" + plateId;

    HTTPClient http;
    bool isHttps = backendUrl.startsWith("https://");

    if (isHttps) {
        WiFiClientSecure *client = new WiFiClientSecure();
        client->setInsecure();
        http.begin(*client, url);
    } else {
        http.begin(url);
    }

    http.setTimeout(5000);
    int httpCode = http.GET();

    bool wasReachable = backendReachable;

    if (httpCode > 0) {
        backendReachable = true;
        if (!wasReachable) {
            logf("[Health] Backend reachable (HTTP %d)", httpCode);
        }
    } else {
        backendReachable = false;
        logf("[Health] Backend unreachable: %s", http.errorToString(httpCode).c_str());
    }

    http.end();
}

// ===== RFID SCANNING =====
void initReaders() {
    logMsg("Powering on RFID module(s)...");
    digitalWrite(RFID_VCC, HIGH);
    delay(200);

    SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, READER_SS[0]);

    for (int i = 0; i < ACTIVE_READERS; i++) {
        readers[i].PCD_Init(READER_SS[i], READER_RST[i]);
        delay(50);
        byte v = readers[i].PCD_ReadRegister(MFRC522::VersionReg);
        logf("Reader %d: version 0x%02X - %s",
            i + 1, v,
            (v == 0x00 || v == 0xFF) ? "NOT DETECTED" : "OK");
    }
}

// Process one reader per call to keep the loop responsive with 4 readers.
int nextReaderToCheck = 0;

void checkReaders() {
    // Skip scanning while Card Manager is active
    if (cardManagerActive) {
        // Auto-deactivate after timeout (user left the page)
        if (millis() - cardManagerLastActivity > CARD_MANAGER_TIMEOUT) {
            cardManagerActive = false;
            logMsg("[CardMgr] Auto-deactivated (timeout)");
        }
        return;
    }

    unsigned long now = millis();

    // Round-robin through readers, one per loop iteration
    int i = nextReaderToCheck;
    nextReaderToCheck = (nextReaderToCheck + 1) % ACTIVE_READERS;

    if (now - lastCardTime[i] < DEBOUNCE_MS) return;

    if (!readers[i].PICC_IsNewCardPresent() || !readers[i].PICC_ReadCardSerial()) {
        return;
    }

    String uid = uidToString(readers[i].uid.uidByte, readers[i].uid.size);
    lastCardTime[i] = now;
    lastScanTime = now;
    logf("[Reader %d] Card detected: %s", i + 1, uid.c_str());

    // Read card number from MIFARE memory
    int cardNumber = readCardNumber(readers[i]);

    // Always halt + stop crypto after we're done with this reader
    readers[i].PICC_HaltA();
    readers[i].PCD_StopCrypto1();

    if (cardNumber > 0) {
        logf("[Reader %d] Card number: #%d", i + 1, cardNumber);
    } else {
        logf("[Reader %d] No card number in memory, using UID only", i + 1);
    }

    blinkLED(1, 50); // Acknowledge scan

    // Attempt HTTP send
    bool sent = sendScanHTTP(i + 1, uid, cardNumber);

    if (!sent) {
        // Queue for retry
        enqueueScan(i + 1, uid, cardNumber);
        blinkLED(3, 80); // Queued feedback: 3 quick flashes
    }
}

// ===== PROCESS SCAN QUEUE =====
void processScanQueue() {
    if (!isWifiConnected()) return;

    unsigned long now = millis();

    // Process at most one queued item per loop to stay responsive
    for (int i = 0; i < MAX_QUEUE; i++) {
        if (!scanQueue[i].active) continue;
        if (now < scanQueue[i].nextRetryAt) continue;

        PendingScan &scan = scanQueue[i];
        logf("[Queue] Retry #%d: reader %d, uid %s", scan.retries + 1, scan.readerIndex, scan.rfidUid.c_str());

        bool sent = sendScanHTTP(scan.readerIndex, scan.rfidUid, scan.cardNumber);

        if (sent) {
            logf("[Queue] Success on retry #%d", scan.retries + 1);
            scan.active = false;
        } else {
            scan.retries++;
            if (scan.retries >= 5) {
                logf("[Queue] Giving up after %d retries: reader %d, uid %s",
                    scan.retries, scan.readerIndex, scan.rfidUid.c_str());
                scan.active = false;
                blinkLED(6, 50); // Give-up feedback
            } else {
                // Exponential backoff: 2s, 4s, 8s, 16s, 30s cap
                unsigned long backoff = (1UL << scan.retries) * 2000UL;
                if (backoff > 30000) backoff = 30000;
                scan.nextRetryAt = now + backoff;
                logf("[Queue] Next retry in %lu ms", backoff);
            }
        }

        break; // Only process one per loop
    }
}

// ===== LED STATUS =====
unsigned long lastLedToggle = 0;
bool ledState = false;
unsigned long lastDoubleBlink = 0;
int doubleBlikStep = 0;

void updateLED() {
    unsigned long now = millis();

    // During blink sequences (blinkLED), don't interfere
    // The state patterns are only for idle state

    if (isWifiConnected()) {
        if (queueCount() > 0) {
            // WiFi OK but queue has items: slow pulse
            if (now - lastLedToggle >= 300) {
                lastLedToggle = now;
                ledState = !ledState;
                digitalWrite(LED_PIN, ledState ? HIGH : LOW);
            }
        } else if (!backendReachable && backendUrl.length() > 0) {
            // WiFi OK but backend unreachable: double-blink every 2s
            unsigned long phase = now % 2000;
            if (phase < 100) {
                digitalWrite(LED_PIN, HIGH);
            } else if (phase < 200) {
                digitalWrite(LED_PIN, LOW);
            } else if (phase < 300) {
                digitalWrite(LED_PIN, HIGH);
            } else {
                digitalWrite(LED_PIN, LOW);
            }
        } else {
            // All good: solid on
            digitalWrite(LED_PIN, HIGH);
        }
    } else if (wifiState == WIFI_CONNECTING || wifiState == WIFI_RECONNECTING) {
        // Connecting: fast blink
        if (now - lastLedToggle >= 250) {
            lastLedToggle = now;
            ledState = !ledState;
            digitalWrite(LED_PIN, ledState ? HIGH : LOW);
        }
    } else if (wifiSSID.length() > 0) {
        // Has SSID but not connected: slow blink
        if (now - lastLedToggle >= 1000) {
            lastLedToggle = now;
            ledState = !ledState;
            digitalWrite(LED_PIN, ledState ? HIGH : LOW);
        }
    } else {
        // No config: off
        digitalWrite(LED_PIN, LOW);
    }
}

// ===== SETUP =====
void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

    pinMode(RFID_VCC, OUTPUT);
    digitalWrite(RFID_VCC, LOW);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    Serial.begin(115200);
    delay(1000);

    logMsg("=============================");
    logMsg("  RFID Game Reader v2.0");
    logf("  Active readers: %d", ACTIVE_READERS);
    logf("  Sketch size: %u / %u bytes", ESP.getSketchSize(), ESP.getSketchSize() + ESP.getFreeSketchSpace());
    logf("  Free heap: %u bytes", ESP.getFreeHeap());
    logMsg("=============================");

    loadConfig();
    initScanQueue();

    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP("RFID-GameReader", "gamemaster");
    logf("Config portal: http://%s", WiFi.softAPIP().toString().c_str());

    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(53, "*", WiFi.softAPIP());
    logMsg("DNS captive portal active");

    // Web server routes
    server.on("/", handlePortalRoot);
    server.on("/save", HTTP_POST, handlePortalSave);
    server.on("/scan", handleWifiScan);
    server.on("/forget", HTTP_POST, handleForgetNetwork);
    server.on("/debug", handleDebugPage);
    server.on("/api/logs", handleLogsAPI);
    server.on("/cardmgr", handleCardManagerPage);
    server.on("/api/card/read", handleCardRead);
    server.on("/api/card/write", HTTP_POST, handleCardWrite);
    server.on("/api/card/wipe", HTTP_POST, handleCardWipe);
    server.on("/api/card/exit", HTTP_POST, handleCardManagerExit);
    // Captive portal detection
    server.on("/generate_204", handleRedirect);
    server.on("/gen_204", handleRedirect);
    server.on("/hotspot-detect.html", handleRedirect);
    server.on("/canonical.html", handleRedirect);
    server.on("/success.txt", handleRedirect);
    server.on("/connecttest.txt", handleRedirect);
    server.on("/redirect", handleRedirect);
    server.on("/ncsi.txt", handleRedirect);
    server.onNotFound(handleNotFound);
    server.begin();

    if (wifiSSID.length() > 0) {
        connectWiFiAsync();
    }

    initReaders();

    logMsg("=== READY ===");
    logf("Config portal: http://%s", WiFi.softAPIP().toString().c_str());
}

// ===== LOOP =====
void loop() {
    dnsServer.processNextRequest();
    server.handleClient();
    updateWiFiState();
    checkReaders();
    processScanQueue();
    checkBackendHealth();
    updateLED();
    delay(10);
}
