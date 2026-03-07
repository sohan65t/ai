/* ============================================================
   MAXIMUS AI — script.js v6.0
   ► PASTE YOUR MISTRAL API KEY BELOW (get free at console.mistral.ai):
============================================================ */
const MISTRAL_API_KEY = "93oblKWH0yX38ND8e9WLY6YhcSQtlFV9";
const MISTRAL_MODEL   = "mistral-large-latest";

/* ============================================================
   ► OPENWEATHER API KEY (get free at openweathermap.org):
   Leave blank to use Mistral AI for weather instead
============================================================ */
const WEATHER_API_KEY = "";   // e.g. "abc123def456..."

/* ========================================================== */

// ─── STATE ───────────────────────────────────────────────────
const state = {
  isAwake:        false,
  isSpeaking:     false,
  isProcessing:   false,
  wakeWord:       "maximus",
  memory:         [],
  alarms:         [],
  contacts:       [],
  chatHistory:    [],       // full conversation history
  uploadedFiles:  [],       // stored uploaded file contexts
  sessionStart:   Date.now(),
  msgCount:       0,
  rec:            null,
  synth:          window.speechSynthesis,
  recRunning:     false,
  _waveInt:       null,
  _startRec:      null,
  lang:           "en-IN",  // default: Indian English
  pendingWakeCmd: "",        // command heard after wake word
};

// ─── BOOT ────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();
  updateDateTime();  setInterval(updateDateTime, 1000);
  updateSessionTimer(); setInterval(updateSessionTimer, 30000);
  initParticles();
  initWaveBars();
  buildSpeechEngine();
  startAlarmChecker();
  checkApiKey();
  renderMemory(); renderAlarms(); renderContacts();
  logActivity("MAXIMUS v6 booted");
  addChat("system", 'Maximus online. Say <b>"Maximus [command]"</b> to get started, or type below.');
});

// ─── LOCALSTORAGE ────────────────────────────────────────────
function loadFromStorage() {
  try {
    state.memory      = JSON.parse(localStorage.getItem("mx_memory")   || "[]");
    state.alarms      = JSON.parse(localStorage.getItem("mx_alarms")   || "[]");
    state.contacts    = JSON.parse(localStorage.getItem("mx_contacts") || "[]");
    // Restore last 40 messages of conversation history
    state.chatHistory = JSON.parse(localStorage.getItem("mx_history")  || "[]");
  } catch(e) {
    state.memory=[]; state.alarms=[]; state.contacts=[]; state.chatHistory=[];
  }
}
const save = {
  memory:   () => { try { localStorage.setItem("mx_memory",   JSON.stringify(state.memory));   } catch(e){} },
  alarms:   () => { try { localStorage.setItem("mx_alarms",   JSON.stringify(state.alarms));   } catch(e){} },
  contacts: () => { try { localStorage.setItem("mx_contacts", JSON.stringify(state.contacts)); } catch(e){} },
  history:  () => { try { localStorage.setItem("mx_history",  JSON.stringify(state.chatHistory.slice(-40))); } catch(e){} },
};

// ─── DATE / TIME ─────────────────────────────────────────────
function updateDateTime() {
  const n = new Date();
  document.getElementById("timeDisplay").textContent =
    n.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  document.getElementById("dateDisplay").textContent =
    n.toLocaleDateString("en-IN", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
}
function getNow() {
  return new Date().toLocaleString("en-IN",
    { weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function updateSessionTimer() {
  const m = Math.floor((Date.now()-state.sessionStart)/60000);
  const el = document.getElementById("sessionTime");
  if (el) el.textContent = m<60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
}

// ─── PARTICLES ───────────────────────────────────────────────
function initParticles() {
  const cv=document.getElementById("particleCanvas"), cx=cv.getContext("2d");
  let W,H,pts=[];
  const resize=()=>{ W=cv.width=innerWidth; H=cv.height=innerHeight; };
  resize(); addEventListener("resize",resize);
  for(let i=0;i<80;i++) pts.push({
    x:Math.random()*innerWidth, y:Math.random()*innerHeight,
    vx:(Math.random()-.5)*.45, vy:(Math.random()-.5)*.45,
    r:Math.random()*1.8+.3, ph:Math.random()*Math.PI*2
  });
  (function draw(){
    cx.clearRect(0,0,W,H);
    pts.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.ph+=.007;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0;
      if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      const a=(Math.sin(p.ph)*.5+.5)*.5;
      cx.beginPath(); cx.arc(p.x,p.y,p.r,0,Math.PI*2);
      cx.fillStyle=`rgba(0,229,255,${a})`; cx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<110){
        cx.beginPath(); cx.moveTo(pts[i].x,pts[i].y); cx.lineTo(pts[j].x,pts[j].y);
        cx.strokeStyle=`rgba(0,229,255,${.1*(1-d/110)})`; cx.lineWidth=.5; cx.stroke();
      }
    }
    requestAnimationFrame(draw);
  })();
}

// ─── WAVE BARS ───────────────────────────────────────────────
function initWaveBars() {
  const bars=document.querySelectorAll(".wave-bar");
  state.startWave=()=>{
    clearInterval(state._waveInt);
    state._waveInt=setInterval(()=>bars.forEach(b=>{
      b.style.height=(4+Math.random()*30)+"px";
      b.style.opacity=(.35+Math.random()*.65).toString();
    }),70);
  };
  state.stopWave=()=>{
    clearInterval(state._waveInt);
    bars.forEach(b=>{ b.style.height="4px"; b.style.opacity=".2"; });
  };
}

// ─── LANGUAGE SUPPORT ────────────────────────────────────────
const LANG_MAP = {
  "en-IN":  "English (India)",
  "hi-IN":  "Hindi",
  "ta-IN":  "Tamil",
  "te-IN":  "Telugu",
  "kn-IN":  "Kannada",
  "ml-IN":  "Malayalam",
  "mr-IN":  "Marathi",
  "gu-IN":  "Gujarati",
  "bn-IN":  "Bengali",
  "pa-IN":  "Punjabi",
  "ur-IN":  "Urdu",
  "en-US":  "English (US)",
  "en-GB":  "English (UK)",
};

function setLanguage(lang) {
  state.lang = lang;
  try { localStorage.setItem("mx_lang", lang); } catch(e){}
  // Rebuild speech engine with new language
  if (state.rec) { try { state.rec.abort(); } catch(e){} state.recRunning=false; }
  setTimeout(()=>{ state._startRec && state._startRec(); }, 300);
  const name = LANG_MAP[lang] || lang;
  addChat("system", `🌐 Language set to <b>${name}</b>`);
  speak(`Language changed to ${name}`);
  logActivity(`Lang: ${name}`);
}

// ─── SPEECH ENGINE ───────────────────────────────────────────
// Design: non-continuous single-utterance, restarted after each result.
// This is most reliable for long sentences and works across languages.
function buildSpeechEngine() {
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ addChat("system","⚠️ Speech recognition requires Chrome or Edge. Use text input."); return; }

  // Restore saved language
  try { const sl=localStorage.getItem("mx_lang"); if(sl) state.lang=sl; } catch(e){}

  function makeRec() {
    const r=new SR();
    r.continuous      = false;   // single utterance = full clean results, no timeout issues
    r.interimResults  = true;    // show live text while speaking
    r.lang            = state.lang;
    r.maxAlternatives = 5;       // check up to 5 alternatives for best match

    r.onstart = () => {
      state.recRunning = true;
      if(state.isAwake) { setListenUI(true); state.startWave(); }
    };

    r.onend = () => {
      state.recRunning = false;
      if(!state.isSpeaking) setTimeout(startRec, 120);
    };

    r.onerror = (e) => {
      state.recRunning = false;
      if(["network","audio-capture","service-not-allowed","not-allowed"].includes(e.error)){
        addChat("system",`⚠️ Mic error: ${e.error}. Allow microphone in browser settings.`);
        setTimeout(startRec, 2000); return;
      }
      setTimeout(startRec, 150);   // no-speech / aborted → restart quickly
    };

    r.onresult = (e) => {
      if(state.isSpeaking) return;

      // Build final + interim from all alternatives — pick highest confidence
      let finalTxt="", interimTxt="";
      for(let i=e.resultIndex; i<e.results.length; i++) {
        let best=e.results[i][0].transcript, bestConf=e.results[i][0].confidence||0;
        for(let a=1; a<e.results[i].length; a++){
          const c=e.results[i][a].confidence||0;
          if(c>bestConf){ best=e.results[i][a].transcript; bestConf=c; }
        }
        if(e.results[i].isFinal) finalTxt+=best+" ";
        else interimTxt+=best;
      }

      const live=(finalTxt||interimTxt).trim();
      if(live) document.getElementById("transcriptContent").textContent=live;
      if(finalTxt.trim()) handleSpeech(finalTxt.trim());
    };
    return r;
  }

  function startRec(){
    if(state.recRunning || state.isSpeaking) return;
    try { state.rec=makeRec(); state.rec.start(); }
    catch(err){ console.warn("Rec err:",err); setTimeout(startRec,600); }
  }

  state._startRec = startRec;
  startRec();
}

function resumeRec(){
  if(state.rec){ try{state.rec.abort();}catch(e){} }
  state.recRunning=false;
  setTimeout(()=>state._startRec&&state._startRec(), 350);
}

// ─── WAKE WORD + COMMAND FLOW ─────────────────────────────────
// New design: "Maximus open YouTube" → parse wake+command in same utterance
// Also: say "Maximus" alone → activated → next utterance is the command
function handleSpeech(text) {
  const lo = text.toLowerCase().trim();

  if(!state.isAwake) {
    // Check if wake word is present
    if(lo.includes(state.wakeWord)) {
      // Extract anything after "Maximus" as an inline command
      const afterWake = text.replace(/maximus/gi,"").trim();
      wakeUp();
      // If there's a command after "Maximus", process it immediately
      if(afterWake.length > 2) {
        setTimeout(()=>processInput(afterWake), 400);
      }
    }
    return;
  }

  // Sleep commands
  if(/^(stop|sleep|shut up|go to sleep|deactivate|quiet|bye|goodbye)/i.test(lo)){
    goSleep(); return;
  }

  // Language switch commands
  const langCmd = lo.match(/(?:speak|switch|change|set)(?:\s+(?:to|in|language))?\s+(hindi|tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|punjabi|urdu|english)/i);
  if(langCmd){
    const langName = langCmd[1].toLowerCase();
    const langCode = {
      hindi:"hi-IN", tamil:"ta-IN", telugu:"te-IN", kannada:"kn-IN",
      malayalam:"ml-IN", marathi:"mr-IN", gujarati:"gu-IN",
      bengali:"bn-IN", punjabi:"pa-IN", urdu:"ur-IN", english:"en-IN"
    }[langName];
    if(langCode){ setLanguage(langCode); return; }
  }

  if(text.trim().length > 1) processInput(text.trim());
}

// ─── WAKE / SLEEP ────────────────────────────────────────────
function wakeUp() {
  state.isAwake = true;
  setOrbMode("listen");
  document.getElementById("orbWave").classList.add("active");
  setStatusBadge("LISTENING","active");
  setStateText("ACTIVE — LISTENING","Say a command or ask anything");
  addChat("system",'🟢 <b>Maximus activated.</b> Listening — say your command now.');
  logActivity("Wake word triggered");
  speak("Yes?");
}

function goSleep() {
  state.isAwake = false;
  setOrbMode("idle");
  document.getElementById("orbWave").classList.remove("active");
  setStatusBadge("STANDBY","");
  setStateText('SAY "MAXIMUS" TO WAKE',"Passive monitoring active");
  setListenUI(false); state.stopWave&&state.stopWave();
  addChat("system",'💤 Maximus standby. Say <b>"Maximus"</b> to reactivate.');
  logActivity("Sleep mode");
  speak("Okay, going to sleep.");
}
function toggleListen(){ if(state.isAwake) goSleep(); else { wakeUp(); speak("Yes, how can I help?"); } }

// ─── MAIN PROCESSOR ──────────────────────────────────────────
async function processInput(text) {
  if(state.isProcessing) return;
  state.isProcessing = true;
  state.msgCount++;
  const mc=document.getElementById("msgCount"); if(mc) mc.textContent=state.msgCount;
  addChat("user", text);
  document.getElementById("transcriptContent").textContent="Processing…";

  // 1. Local action?
  const action = detectAction(text);
  if(action){
    syncOpen(action);         // fire URL/app opens immediately (beats popup blocker)
    await runAction(action, text);
    state.isProcessing=false; return;
  }

  // 2. Memory save?
  if(/\b(remember|remind me|don'?t forget|note that|save this|add task)\b/i.test(text)){
    const r=saveMemory(text); addChat("assistant",r); speak(r);
    state.isProcessing=false; return;
  }

  // 3. AI — with full conversation history
  const tid=addChat("assistant","Thinking…",true);
  try{
    const reply=await callMistral(text);
    updateChat(tid,reply); speak(reply); logActivity("AI replied");
  }catch(err){
    const msg="I had trouble reaching my AI core. Check your API key.";
    updateChat(tid,msg); speak(msg); console.error(err);
  }
  state.isProcessing=false;
}

// ─── SYNC OPEN (fires before any await — beats popup blocker) ─
function syncOpen(action){
  if(action.type==="url")      openURL(action.url);
  if(action.type==="search")   openURL(searchURL(action.engine, action.query));
  if(action.type==="spotify")  openURL(`https://open.spotify.com/search/${encodeURIComponent(action.song)}`);
  if(action.type==="whatsapp") openWhatsApp(action);
  if(action.type==="app")      triggerApp(action.app);
}

function searchURL(engine, query){
  const q=encodeURIComponent(query);
  return {
    youtube:   `https://www.youtube.com/results?search_query=${q}`,
    google:    `https://www.google.com/search?q=${q}`,
    instagram: `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/\s+/g,""))}`,
    chatgpt:   `https://chatgpt.com/?q=${q}`,
  }[engine] || `https://www.google.com/search?q=${q}`;
}

// ─── SAFE URL OPENER ─────────────────────────────────────────
function openURL(url){
  try{
    const a=document.createElement("a");
    a.href=url;
    if(url.startsWith("http")){ a.target="_blank"; a.rel="noopener noreferrer"; }
    else a.rel="noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  }catch(e){}
  try{ window.open(url,"_blank"); }catch(e){}
}

function triggerApp(app){
  const protos={calculator:"calculator://",settings:"ms-settings:",vscode:"vscode://",outlook:"outlook:"};
  if(protos[app]) openURL(protos[app]);
}

// ─── WHATSAPP DESKTOP OPENER ──────────────────────────────────
function openWhatsApp(action){
  // Smart 3-tier contact resolver
  const cn=action.contact.toLowerCase().trim();
  let found = state.contacts.find(c=>c.name.toLowerCase()===cn)                                    // exact
           || state.contacts.find(c=>c.name.toLowerCase().includes(cn)||cn.includes(c.name.toLowerCase())) // partial
           || state.contacts.find(c=>c.name.toLowerCase().startsWith(cn.split(/\s+/)[0]));         // first word

  const phone  = found?.phone || action.contact;
  const digits = phone.replace(/\D/g,"");

  if(digits.length>=7){
    const url=action.msg
      ? `whatsapp://send?phone=${digits}&text=${encodeURIComponent(action.msg)}`
      : `whatsapp://send?phone=${digits}`;
    openURL(url);
    // Web fallback after 2.8s if desktop app isn't installed
    setTimeout(()=> openURL(action.msg
      ? `https://wa.me/${digits}?text=${encodeURIComponent(action.msg)}`
      : `https://wa.me/${digits}`), 2800);

    const info=found
      ? `✅ Opening WhatsApp for <b>${found.name}</b>${action.msg?` — "<i>${action.msg}</i>"`:""} — press Send!`
      : `✅ Opening WhatsApp${action.msg?` — message pre-filled`:""}. Press Send!`;
    setTimeout(()=>addChat("system",info),100);
  } else {
    openURL("whatsapp://"); setTimeout(()=>openURL("https://web.whatsapp.com"),2000);
    setTimeout(()=>{
      addChat("system",`⚠️ No number found for "<b>${action.contact}</b>". Click <b>＋ Add Contact</b> and save their WhatsApp number (with country code, e.g. 919876543210).`);
      speak(`I couldn't find ${action.contact} in your contacts. Please add their phone number using the Add Contact button.`);
    },200);
  }
}

// ─── ACTION DETECTOR ─────────────────────────────────────────
function detectAction(text){
  const t=text.toLowerCase().trim();

  // ── SITES ──
  const sites={
    google:"https://google.com", youtube:"https://youtube.com",
    whatsapp:"whatsapp://", spotify:"https://open.spotify.com",
    instagram:"https://instagram.com", chatgpt:"https://chatgpt.com",
    github:"https://github.com", twitter:"https://twitter.com",
    reddit:"https://reddit.com", gmail:"https://mail.google.com",
    linkedin:"https://linkedin.com", facebook:"https://facebook.com",
    netflix:"https://netflix.com", amazon:"https://amazon.in",
    maps:"https://maps.google.com", flipkart:"https://flipkart.com",
    hotstar:"https://hotstar.com", prime:"https://primevideo.com",
    "stack overflow":"https://stackoverflow.com",
    paytm:"https://paytm.com", phonepe:"https://phonepe.com",
  };
  for(const[name,url] of Object.entries(sites)){
    if(new RegExp(`(open|go to|launch|visit|navigate to|show me)\\s+${name.replace(" ","\\s+")}`,`i`).test(t))
      return {type:"url",url,name};
  }

  // Raw domain
  const dm=t.match(/(?:open|go to|visit|launch)\s+([\w-]+\.(?:com|net|org|io|co|in|dev|ai|app|edu|gov)(?:\/\S*)?)/i);
  if(dm) return {type:"url",url:`https://${dm[1]}`,name:dm[1]};

  // ── WEATHER ──
  const wxQ=t.match(/(?:what(?:'s| is)(?: the)?|how(?:'s| is)(?: the)?|tell me(?: the)?)\s+weather(?:\s+(?:in|at|of|for)\s+(.+?))?(?:\s+(?:today|now|tomorrow|this week))?$/i)
    || t.match(/weather(?:\s+(?:in|at|of|for)\s+(.+?))?(?:\s+(?:today|now|tomorrow|this week))?/i);
  if(wxQ){ const city=(wxQ[1]||"").trim()||"current location"; return {type:"weather",city}; }

  // ── SEARCH ──
  const ytQ=t.match(/(?:search|find|play)\s+(.+?)\s+on youtube/i);
  if(ytQ) return {type:"search",engine:"youtube",query:ytQ[1]};

  const gQ=t.match(/(?:search|google|look up)\s+(.+?)(?:\s+on google)?$/i);
  if(gQ&&!t.includes("youtube")&&!t.includes("instagram")&&!t.includes("chatgpt"))
    return {type:"search",engine:"google",query:gQ[1]};

  const igQ=t.match(/search\s+(.+?)\s+on instagram/i);
  if(igQ) return {type:"search",engine:"instagram",query:igQ[1]};

  const cgQ=t.match(/(?:search|ask)\s+(.+?)\s+on chatgpt/i)||t.match(/ask chatgpt (.+)/i);
  if(cgQ) return {type:"search",engine:"chatgpt",query:cgQ[1]};

  // ── SPOTIFY ──
  const spQ=t.match(/play\s+(.+?)\s+(?:on\s+)?spotify/i)||t.match(/spotify\s+play\s+(.+)/i);
  if(spQ) return {type:"spotify",song:spQ[1]};

  // ── WHATSAPP — handles "saying"/"sing"/"sang"/"say"/"that" and all mishearings ──
  {
    const waTriggered=/^(send\s+(?:a\s+)?(?:message|msg|text)\s+to|message|msg|whatsapp|text|tell|inform)\s+/i.test(t);
    if(waTriggered){
      const rest=text.replace(/^(send\s+(?:a\s+)?(?:message|msg|text)\s+to|message|msg|whatsapp|text|tell|inform)\s+/i,"").trim();

      // Split on ALL mishearings of "saying" — sing/sang/sayin/say/said/says/that
      const splitRe=/\s+(?:saying|sing|sang|sayin|says|said|say|to say|and say|telling|tell|that|ko|ko bol)\s+/i;
      const parts=rest.split(splitRe);

      if(parts.length>=2){
        const contact=parts[0].replace(/\s+on\s+(whatsapp|wa)$/i,"").trim();
        const msg=parts.slice(1).join(" ").trim();
        if(contact && msg) return {type:"whatsapp",contact,msg};
      }

      // "on whatsapp" at end = open chat
      const onWA=rest.match(/^(.+?)\s+on\s+whatsapp$/i);
      if(onWA) return {type:"whatsapp",contact:onWA[1].trim(),msg:""};

      // No separator — treat entire rest as contact name
      if(rest.length>1 && !rest.includes("."))
        return {type:"whatsapp",contact:rest.trim(),msg:""};
    }
  }

  // ── EMAIL ──
  const emailMatch=
    t.match(/(?:write|compose|send|draft)\s+(?:an?\s+)?email\s+to\s+(.+?)\s+(?:about|regarding|for|saying|to|on)\s+(.+)/i)||
    t.match(/(?:write|compose|send|draft)\s+(?:an?\s+)?email\s+to\s+(.+)/i);
  if(emailMatch) return {type:"email",contact:emailMatch[1].trim(),topic:(emailMatch[2]||"").trim()};

  // ── ALARMS ──
  const alarmQ=
    t.match(/set\s+(?:an?\s+)?alarm\s+(?:for|at)\s+(.+)/i)||
    t.match(/wake\s+me\s+(?:up\s+)?(?:at|by)\s+(.+)/i)||
    t.match(/remind\s+me\s+(?:to\s+.+?\s+)?(?:at|by)\s+(.+)/i);
  if(alarmQ) return {type:"set_alarm",timeStr:alarmQ[1].trim()};

  // ── APPS ──
  const appChecks=[
    [/(open|launch)\s+(vs\s*code|visual\s*studio\s*code|vscode)/i,"vscode"],
    [/(open|launch)\s+notepad/i,"notepad"],
    [/(open|launch)\s+calculator/i,"calculator"],
    [/(open|launch)\s+(file\s*)?(manager|explorer)/i,"explorer"],
    [/(open|launch)\s+settings/i,"settings"],
    [/(open|launch)\s+task\s*manager/i,"taskmgr"],
    [/(open|launch)\s+paint/i,"mspaint"],
    [/(open|launch)\s+(cmd|command\s*prompt)/i,"cmd"],
    [/(open|launch)\s+(terminal|powershell)/i,"powershell"],
    [/(open|launch)\s+word/i,"winword"],
    [/(open|launch)\s+excel/i,"excel"],
    [/(open|launch)\s+powerpoint/i,"powerpnt"],
    [/(open|launch)\s+outlook/i,"outlook"],
  ];
  for(const[re,app] of appChecks){ if(re.test(t)) return {type:"app",app}; }

  // ── CODE ──
  const codeM=
    t.match(/write\s+(?:a\s+)?(.+?)\s+(?:code|script|program|function|class)\s+(?:for|that|to|which)\s+(.+)/i)||
    t.match(/write\s+(?:a\s+)?(.+?)\s+(?:code|script|program)\s+(?:in|on|to)\s+notepad/i)||
    t.match(/(?:generate|create|build|make)\s+(?:a\s+)?(.+?)\s+(?:code|script|program|function)/i);
  if(codeM) return {type:"code",lang:codeM[1],task:codeM[2]||"",notepad:t.includes("notepad")};

  // ── DATETIME ──
  if(/what(?:'s| is)\s+the\s+(time|date|day)|current\s+(time|date|day)|today'?s\s+date/i.test(t))
    return {type:"datetime"};

  return null;
}

// ─── ACTION RUNNER ────────────────────────────────────────────
async function runAction(action, originalText){
  let reply="";
  switch(action.type){

    case "url":
      reply=`Opening ${action.name}.`;
      logActivity(`Opened: ${action.name}`); break;

    case "search":{
      const eng=action.engine.charAt(0).toUpperCase()+action.engine.slice(1);
      reply=`Searching "${action.query}" on ${eng}.`;
      logActivity(`Search: ${action.query}`); break;
    }

    case "spotify":
      reply=`Opening Spotify — searching for "${action.song}".`;
      logActivity(`Spotify: ${action.song}`); break;

    case "whatsapp":
      // openWhatsApp() already ran in syncOpen — it handles its own replies
      logActivity(`WhatsApp: ${action.contact}`);
      state.isProcessing=false; return;

    case "weather":{
      const tid=addChat("assistant","Checking weather…",true);
      speak("Let me check the weather.");
      try{
        const wx=await getWeather(action.city);
        updateChat(tid,wx); speak(wx.replace(/<[^>]+>/g," "));
      }catch(e){ updateChat(tid,"Could not fetch weather right now."); }
      logActivity(`Weather: ${action.city}`);
      state.isProcessing=false; return;
    }

    case "email":{
      const cFound=state.contacts.find(c=>c.name.toLowerCase()===action.contact.toLowerCase().trim());
      const toEmail=cFound?.email||"";
      const tid=addChat("assistant","Composing your email…",true);
      speak("Composing your email now.");
      try{
        const raw=await callMistral(
          `Write a professional email. Recipient: "${action.contact}". Topic: "${action.topic||"general"}".
Return ONLY valid JSON: {"subject":"...","body":"..."} — no markdown, no extra text.`
        );
        let parsed={subject:`Email to ${action.contact}`,body:raw};
        try{ parsed=JSON.parse(raw.replace(/```json|```/g,"").trim()); }
        catch(e){
          const sm=raw.match(/"subject"\s*:\s*"([^"]+)"/);
          const bm=raw.match(/"body"\s*:\s*"([\s\S]+?)"\s*[}\n]/);
          if(sm) parsed.subject=sm[1];
          if(bm) parsed.body=bm[1].replace(/\\n/g,"\n");
        }
        updateChat(tid,`✅ Email composed for <b>${action.contact}</b>. Opening editor…`);
        document.getElementById("emailTo").value=toEmail;
        document.getElementById("emailSubject").value=parsed.subject;
        document.getElementById("emailBody").value=parsed.body;
        showModal("emailModal");
        reply="Email ready! Review it and click Send.";
      }catch(err){
        updateChat(tid,"Could not compose — check your API key.");
        reply="Email composition failed.";
      }
      logActivity(`Email: ${action.contact}`); break;
    }

    case "set_alarm":
      reply=parseAndSetAlarm(action.timeStr);
      logActivity(`Alarm: ${action.timeStr}`); break;

    case "app":
      reply=await launchApp(action.app);
      logActivity(`App: ${action.app}`); break;

    case "code":{
      const tid=addChat("assistant",`Writing ${action.lang} code…`,true);
      speak(`Writing ${action.lang} code for you.`);
      try{
        const code=await callMistral(
          `You are an expert programmer. Write clean, complete, well-commented ${action.lang} code.
Task: ${action.task||originalText}
Requirements:
- Include all necessary imports/dependencies
- Add comments explaining each section
- Handle errors properly
- Make it production-ready
Return ONLY the code, no explanation before or after.`
        );
        const formatted=`<pre><code>${code.replace(/</g,"&lt;")}</code></pre>`;
        updateChat(tid, formatted);
        try{ await navigator.clipboard.writeText(code); }catch(e){}
        if(action.notepad){
          reply=`✅ ${action.lang} code written and copied to clipboard. Open Notepad (Win+R → notepad → Enter) and press Ctrl+V.`;
        } else {
          reply=`✅ ${action.lang} code written and copied to clipboard!`;
        }
        speak(reply.replace(/<[^>]+>/g," "));
      }catch(err){
        updateChat(tid,"Code generation failed. Check your API key.");
        reply="Code generation failed.";
      }
      logActivity(`Code: ${action.lang}`);
      state.isProcessing=false; return;
    }

    case "datetime":
      reply=`It is currently ${getNow()}.`;
      logActivity("Datetime"); break;
  }

  addChat("assistant",reply); speak(reply);
}

// ─── APP LAUNCHER ────────────────────────────────────────────
async function launchApp(app){
  const labels={vscode:"VS Code",notepad:"Notepad",calculator:"Calculator",
    explorer:"File Explorer",settings:"Settings",taskmgr:"Task Manager",
    mspaint:"Paint",cmd:"Command Prompt",powershell:"PowerShell",
    winword:"Word",excel:"Excel",powerpnt:"PowerPoint",outlook:"Outlook"};
  const exes={notepad:"notepad.exe",taskmgr:"taskmgr.exe",mspaint:"mspaint.exe",
    cmd:"cmd.exe",powershell:"powershell.exe",explorer:"explorer.exe",
    winword:"winword.exe",excel:"excel.exe",powerpnt:"powerpnt.exe"};
  const label=labels[app]||app;
  if(["calculator","settings","vscode","outlook"].includes(app)) return `Opening ${label}!`;
  const exe=exes[app]||app;
  try{ await navigator.clipboard.writeText(exe); }catch(e){}
  return `Press <b>Win+R</b>, paste with Ctrl+V, then press Enter to open <b>${label}</b>. Command copied!`;
}

// ─── WEATHER ─────────────────────────────────────────────────
async function getWeather(city){
  // Use OpenWeather API if key is provided, else use Mistral
  if(WEATHER_API_KEY && WEATHER_API_KEY.length > 5){
    const url=city==="current location"
      ? `https://api.openweathermap.org/data/2.5/weather?q=Mumbai&appid=${WEATHER_API_KEY}&units=metric`
      : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_API_KEY}&units=metric`;
    const res=await fetch(url);
    const d=await res.json();
    if(d.cod!==200) throw new Error("City not found");
    const desc=d.weather[0].description;
    const temp=Math.round(d.main.temp);
    const feels=Math.round(d.main.feels_like);
    const hum=d.main.humidity;
    const wind=Math.round(d.wind.speed*3.6);
    return `🌤️ <b>Weather in ${d.name}</b><br>
${desc.charAt(0).toUpperCase()+desc.slice(1)}, <b>${temp}°C</b> (feels like ${feels}°C)<br>
Humidity: ${hum}% · Wind: ${wind} km/h`;
  } else {
    // Fallback: ask Mistral for weather knowledge
    const r=await callMistral(`What is the typical weather in ${city} right now (${new Date().toLocaleString("en-IN",{month:"long"})})? Give a brief 2-3 line answer.`);
    return `🌤️ <b>Weather info for ${city}</b> (from AI knowledge):<br>${r}<br><small>For real-time weather, add your OpenWeather API key in script.js line 11.</small>`;
  }
}

// ─── ALARM SYSTEM ────────────────────────────────────────────
function parseAndSetAlarm(timeStr){
  let h=-1,m=0;
  const clean=timeStr.toLowerCase().replace(/tomorrow|today/g,"").trim();

  const hm=clean.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if(hm){
    h=parseInt(hm[1]); m=parseInt(hm[2]);
    const ap=(hm[3]||"").toLowerCase();
    if(ap==="pm"&&h<12) h+=12;
    if(ap==="am"&&h===12) h=0;
  } else {
    const hOnly=clean.match(/(\d{1,2})\s*(am|pm)/i);
    if(hOnly){
      h=parseInt(hOnly[1]);
      const ap=hOnly[2].toLowerCase();
      if(ap==="pm"&&h<12) h+=12;
      if(ap==="am"&&h===12) h=0;
    }
  }

  if(h<0||h>23) return `Couldn't understand that time. Try "Set alarm for 7:30 AM".`;

  const lm=timeStr.match(/(?:to|for)\s+(.+?)\s+(?:at|by|\d)/i);
  const label=lm?lm[1]:timeStr.replace(/(?:set alarm|alarm|reminder|wake me up|remind me|at|for|by)\s*/gi,"").trim()||"Alarm";

  const id=Date.now();
  state.alarms.push({id,h,m,label,repeat:"once",active:true,notified:false});
  save.alarms(); renderAlarms();

  const tl=`${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"}`;
  return `⏰ Alarm set for <b>${tl}</b> — "${label}"`;
}

function renderAlarms(){
  const el=document.getElementById("alarmList");
  const ac=document.getElementById("alarmCount");
  if(ac) ac.textContent=state.alarms.filter(a=>a.active).length;
  if(!state.alarms.length){
    el.innerHTML=`<div class="mem-empty">No alarms.<br>Say "Set alarm for 7am"</div>`; return;
  }
  el.innerHTML=state.alarms.map(a=>{
    const tl=`${a.h%12||12}:${String(a.m).padStart(2,"0")} ${a.h<12?"AM":"PM"}`;
    return `<div class="alarm-item">
      <span class="alarm-time"><span class="${a.active?"alarm-active-dot":""}"></span>${tl}</span>
      <span class="alarm-label-txt">${a.label}</span>
      <span class="alarm-repeat">${a.repeat}</span>
      <button class="alarm-del" onclick="deleteAlarm(${a.id})">×</button>
    </div>`;
  }).join("");
}
function deleteAlarm(id){ state.alarms=state.alarms.filter(a=>a.id!==id); save.alarms(); renderAlarms(); }

function startAlarmChecker(){
  setInterval(()=>{
    const now=new Date(), nowH=now.getHours(), nowM=now.getMinutes(), nowS=now.getSeconds();
    if(nowS>20) return;
    state.alarms.forEach(alarm=>{
      if(!alarm.active||alarm.notified) return;
      if(alarm.h===nowH&&alarm.m===nowM){
        alarm.notified=true;
        triggerAlarm(alarm);
        if(alarm.repeat!=="once") setTimeout(()=>{ alarm.notified=false; },65000);
        else alarm.active=false;
        save.alarms(); renderAlarms();
      }
    });
  },15000);
}

function triggerAlarm(alarm){
  const tl=`${alarm.h%12||12}:${String(alarm.m).padStart(2,"0")} ${alarm.h<12?"AM":"PM"}`;
  const msg=`Alarm! ${alarm.label} — it's ${tl}.`;
  document.getElementById("alarmAlertText").textContent=`${alarm.label.toUpperCase()} — ${tl}`;
  document.getElementById("alarmAlert").classList.add("show");
  playAlarmSound(); speak(msg);
  addChat("system",`⏰ ${msg}`); logActivity(`Alarm fired: ${alarm.label}`);
}

function playAlarmSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const beep=(t,f,d)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value=f; o.type="sine";
      g.gain.setValueAtTime(.5,t); g.gain.exponentialRampToValueAtTime(.001,t+d);
      o.start(t); o.stop(t+d);
    };
    const t=ctx.currentTime;
    beep(t,.880,.2); beep(t+.25,.880,.2); beep(t+.5,1.1,.3);
    beep(t+.9,.880,.2); beep(t+1.15,.880,.2); beep(t+1.4,1.1,.3);
  }catch(e){}
}
function dismissAlarm(){ document.getElementById("alarmAlert").classList.remove("show"); }

// ─── ALARM MODAL ─────────────────────────────────────────────
function showAlarmModal(){ showModal("alarmModal"); }
function saveAlarm(){
  const label=document.getElementById("alarmLabel").value.trim()||"Alarm";
  const timeVal=document.getElementById("alarmTime").value;
  const repeat=document.getElementById("alarmRepeat").value;
  if(!timeVal){ alert("Please pick a time."); return; }
  const[hStr,mStr]=timeVal.split(":");
  const h=parseInt(hStr), m=parseInt(mStr);
  state.alarms.push({id:Date.now(),h,m,label,repeat,active:true,notified:false});
  save.alarms(); renderAlarms(); closeModal("alarmModal");
  const tl=`${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"}`;
  const msg=`Alarm set for ${tl} — ${label}.`;
  addChat("assistant",msg); speak(msg);
}

// ─── MEMORY ──────────────────────────────────────────────────
function saveMemory(text){
  const m={id:Date.now(),text,time:new Date().toLocaleString()};
  state.memory.push(m); save.memory(); renderMemory();
  const hasDT=/\d{1,2}[:\-\/]\d{1,2}|am|pm|\btoday\b|\btomorrow\b|\b(mon|tue|wed|thu|fri|sat|sun)/i.test(text);
  if(hasDT){ const ar=parseAndSetAlarm(text); return `Noted: "${text}". ${ar}`; }
  return `Saved to memory: "${text}".`;
}
function renderMemory(){
  const el=document.getElementById("memoryList");
  const mc=document.getElementById("memCount");
  const mr=document.getElementById("memCountR");
  if(mc) mc.textContent=state.memory.length;
  if(mr) mr.textContent=state.memory.length;
  if(!state.memory.length){
    el.innerHTML=`<div class="mem-empty">No memories yet.<br>Say "Remember…" to add.</div>`; return;
  }
  el.innerHTML=state.memory.map(m=>`
    <div class="mem-item">
      <span class="mem-text">${m.text}</span>
      <span class="mem-ts">${m.time}</span>
      <button class="mem-del" onclick="deleteMem(${m.id})">×</button>
    </div>`).join("");
}
function deleteMem(id){ state.memory=state.memory.filter(m=>m.id!==id); save.memory(); renderMemory(); }

// ─── CONTACTS ────────────────────────────────────────────────
function renderContacts(){
  const el=document.getElementById("contactsList");
  if(!state.contacts.length){ el.innerHTML=`<div class="mem-empty">No contacts.</div>`; return; }
  el.innerHTML=state.contacts.map(c=>`
    <div class="contact-item">
      <span class="contact-name">👤 ${c.name}</span>
      <span class="contact-info">${c.phone||"no phone"} · ${c.email||"no email"}</span>
      <button class="contact-del" onclick="deleteContact(${c.id})">×</button>
    </div>`).join("");
}
function showContactModal(){ showModal("contactModal"); }
function saveContact(){
  const name=document.getElementById("contactName").value.trim();
  const phone=document.getElementById("contactPhone").value.trim();
  const email=document.getElementById("contactEmail").value.trim();
  if(!name){ alert("Name is required."); return; }
  state.contacts.push({id:Date.now(),name,phone,email});
  save.contacts(); renderContacts(); closeModal("contactModal");
  document.getElementById("contactName").value="";
  document.getElementById("contactPhone").value="";
  document.getElementById("contactEmail").value="";
  addChat("system",`✅ Contact saved: ${name}`);
}
function deleteContact(id){ state.contacts=state.contacts.filter(c=>c.id!==id); save.contacts(); renderContacts(); }

// ─── EMAIL MODAL ─────────────────────────────────────────────
function sendEmail(){
  const to=document.getElementById("emailTo").value.trim();
  const sub=document.getElementById("emailSubject").value.trim();
  const body=document.getElementById("emailBody").value.trim();
  if(!to){ alert("Please enter recipient email."); return; }
  openURL(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`);
  setTimeout(()=>openURL(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`),300);
  closeModal("emailModal");
  addChat("assistant","✅ Email opened in mail app and Gmail. Click Send!");
  speak("Email opened. Please review and send.");
}
function copyEmail(){
  const sub=document.getElementById("emailSubject").value;
  const body=document.getElementById("emailBody").value;
  navigator.clipboard.writeText(`Subject: ${sub}\n\n${body}`)
    .then(()=>addChat("system","📋 Email copied to clipboard."));
}

// ─── MODAL HELPERS ───────────────────────────────────────────
function showModal(id){ document.getElementById(id).classList.add("show"); }
function closeModal(id){ document.getElementById(id).classList.remove("show"); }
document.addEventListener("click",e=>{
  if(e.target.classList.contains("modal-overlay")) e.target.classList.remove("show");
});

// ─── FILE UPLOAD — ALL TYPES ──────────────────────────────────
async function handleFileUpload(ev){
  const files=ev.target.files;
  if(!files.length) return;
  const f=files[0];
  const ext=f.name.split(".").pop().toLowerCase();
  ev.target.value="";

  addChat("system",`📎 File received: <b>${f.name}</b> (${(f.size/1024).toFixed(1)} KB) — analyzing…`);
  speak(`Analyzing ${f.name}`);
  logActivity(`File: ${f.name}`);

  // Image files — send as base64 to Mistral vision
  if(["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext)){
    await analyzeImage(f); return;
  }

  // PDF — read as text via FileReader
  if(ext==="pdf"){
    await analyzeAsText(f, "PDF document"); return;
  }

  // Text-based files
  if(["txt","csv","json","xml","html","htm","md","log","ini","yaml","yml","toml"].includes(ext)){
    await analyzeAsText(f, ext.toUpperCase()+" file"); return;
  }

  // Code files
  if(["js","ts","py","java","c","cpp","cs","php","rb","go","rs","swift","kt","sh","sql"].includes(ext)){
    await analyzeAsText(f, `${ext.toUpperCase()} source code`); return;
  }

  // Excel / CSV
  if(["xlsx","xls"].includes(ext)){
    await analyzeAsText(f, "spreadsheet"); return;
  }

  // PPTX / DOCX — read raw text (limited but useful)
  if(["docx","doc","pptx","ppt"].includes(ext)){
    await analyzeAsText(f, `${ext.toUpperCase()} document`); return;
  }

  // Fallback
  await analyzeAsText(f, "document");
}

async function analyzeImage(file){
  const reader=new FileReader();
  reader.onload=async e=>{
    const b64=e.target.result.split(",")[1];
    const mediaType=file.type||"image/jpeg";
    const tid=addChat("assistant","Analyzing image…",true);
    try{
      // Store file context for follow-up questions
      state.uploadedFiles.push({
        name:file.name, type:"image", data:b64, mediaType,
        summary:"Image file uploaded"
      });

      const res=await fetch("https://api.mistral.ai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${MISTRAL_API_KEY}`},
        body:JSON.stringify({
          model:"pixtral-12b-2409",   // Mistral vision model
          max_tokens:1000,
          messages:[{
            role:"user",
            content:[
              {type:"image_url",image_url:{url:`data:${mediaType};base64,${b64}`}},
              {type:"text",text:`Analyze this image completely. Describe:
1. What you see in detail
2. Any text present (OCR)
3. Objects, people, colors, layout
4. Any data, charts, or diagrams
5. Context and purpose of this image
Be thorough and detailed.`}
            ]
          }]
        })
      });
      const d=await res.json();
      const reply=d.choices?.[0]?.message?.content||"Could not analyze image.";
      // Store summary for follow-up
      state.uploadedFiles[state.uploadedFiles.length-1].summary=reply.substring(0,500);
      updateChat(tid, fmtText(reply));
      speak("Image analyzed. "+reply.substring(0,150));
    }catch(err){
      updateChat(tid,"Image analysis failed. Check your API key or try pixtral model.");
      console.error(err);
    }
  };
  reader.readAsDataURL(file);
}

async function analyzeAsText(file, fileType){
  const reader=new FileReader();
  reader.onload=async e=>{
    let content=e.target.result;
    if(typeof content !== "string") content=new TextDecoder().decode(content);

    const maxLen=12000;
    const truncated=content.length>maxLen;
    const sample=content.substring(0,maxLen);

    // Store for follow-up questions
    state.uploadedFiles.push({
      name:file.name, type:"text", content:sample,
      summary:`${fileType}: ${file.name}`
    });

    const tid=addChat("assistant",`Analyzing ${fileType}…`,true);
    try{
      const prompt=`You are analyzing a ${fileType} named "${file.name}".
${truncated?`(Note: Only the first ${maxLen} characters are shown — file was truncated)`:""}

FILE CONTENT:
${sample}

Please provide:
1. **Summary** — What is this file about?
2. **Key Information** — Important data, facts, or content
3. **Structure** — How is it organized?
4. **Notable Insights** — Anything important the user should know
5. **Data/Numbers** (if any) — Key statistics or figures

Be thorough and detailed. The user may ask follow-up questions about this file.`;

      const reply=await callMistral(prompt, true); // true = inject file context
      // Update stored summary
      state.uploadedFiles[state.uploadedFiles.length-1].summary=reply.substring(0,600);
      updateChat(tid, fmtText(reply));
      speak("File analyzed. "+reply.substring(0,120));
    }catch(err){
      updateChat(tid,"File analysis failed. Check your API key.");
    }
  };
  // Try as text first; binary files will show garbled text but still work
  reader.readAsText(file);
}

// ─── MISTRAL API ─────────────────────────────────────────────
async function callMistral(msg, includeFiles=false){
  if(!MISTRAL_API_KEY||MISTRAL_API_KEY==="PASTE_YOUR_MISTRAL_API_KEY_HERE")
    throw new Error("No API key");

  // Build system prompt with full context
  let sysPrompt=`You are Maximus, a brilliant, highly capable AI assistant — like a personal Jarvis.
Today: ${getNow()}. User's language setting: ${LANG_MAP[state.lang]||state.lang}.

Your capabilities:
- Answer ANY question with depth and accuracy
- Write code in ANY programming language (complete, production-ready, well-commented)
- Analyze files, documents, images, data
- Explain concepts clearly at any level
- Remember the entire conversation history
- Help with any task: writing, analysis, math, science, coding, etc.

Instructions:
- Be natural, confident, and helpful
- For code: always write complete, working code with comments
- For explanations: be thorough but clear
- Remember previous messages — refer to them naturally
- If asked in Hindi or other Indian language, respond in that language
- Keep responses concise unless detail is needed (code/analysis = full detail)`;

  // Add uploaded file contexts if any
  if(includeFiles && state.uploadedFiles.length>0){
    sysPrompt+=`\n\nUploaded files available for reference:\n`;
    state.uploadedFiles.forEach(f=>{
      sysPrompt+=`\n[File: ${f.name}]\n${f.type==="text"?f.content.substring(0,3000):f.summary}\n`;
    });
  } else if(state.uploadedFiles.length>0){
    // Just include summaries for context
    sysPrompt+=`\n\nPreviously analyzed files (summaries):\n`;
    state.uploadedFiles.forEach(f=>{
      sysPrompt+=`- ${f.name}: ${f.summary||"analyzed"}\n`;
    });
  }

  const messages=[{role:"system",content:sysPrompt}];

  // Include FULL conversation history (last 30 turns)
  const history=state.chatHistory.slice(-30);
  messages.push(...history);
  messages.push({role:"user",content:msg});

  const res=await fetch("https://api.mistral.ai/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${MISTRAL_API_KEY}`},
    body:JSON.stringify({model:MISTRAL_MODEL,messages,temperature:0.7,max_tokens:2000})
  });
  if(!res.ok){const e=await res.json().catch(()=>({})); throw new Error(e.message||res.status);}
  const data=await res.json();
  const reply=data.choices[0].message.content.trim();

  // Save to persistent history
  state.chatHistory.push({role:"user",content:msg},{role:"assistant",content:reply});
  if(state.chatHistory.length>60) state.chatHistory.splice(0,2);
  save.history();  // persist conversation across sessions

  return reply;
}

// ─── TTS — INDIAN LANGUAGE SUPPORT ───────────────────────────
function speak(text){
  if(!state.synth) return;
  state.synth.cancel();
  if(state.rec){try{state.rec.abort();}catch(e){} state.recRunning=false;}

  const clean=text
    .replace(/<[^>]+>/g," ")
    .replace(/```[\s\S]*?```/g,"I've written the code.")
    .replace(/`([^`]+)`/g,"$1")
    .replace(/[*_#>\[\]]/g,"")
    .replace(/\n/g," ")
    .trim().substring(0,600);

  const u=new SpeechSynthesisUtterance(clean);
  u.rate=1.0; u.pitch=0.95; u.volume=1;

  // Select voice matching current language
  const voices=state.synth.getVoices();
  const langBase=state.lang.split("-")[0]; // "hi" from "hi-IN"

  // Priority: exact lang match → Indian English → any English
  const prefs=[
    v=>v.lang===state.lang,
    v=>v.lang.startsWith(langBase),
    v=>v.lang==="en-IN",
    v=>v.name.includes("Google UK English Male"),
    v=>v.name.includes("Microsoft David"),
    v=>v.lang.startsWith("en"),
  ];
  for(const p of prefs){
    const v=voices.find(p);
    if(v){u.voice=v; break;}
  }
  u.lang=state.lang;

  u.onstart=()=>{
    state.isSpeaking=true; setOrbMode("speak"); setStatusBadge("SPEAKING","speaking");
    document.getElementById("speakOverlay").classList.add("show");
    setListenUI(false); state.stopWave&&state.stopWave();
  };
  const onDone=()=>{
    state.isSpeaking=false;
    document.getElementById("speakOverlay").classList.remove("show");
    if(state.isAwake){setOrbMode("listen");setStatusBadge("LISTENING","active");setListenUI(true);}
    else{setOrbMode("idle");setStatusBadge("STANDBY","");}
    resumeRec();
  };
  u.onend=onDone; u.onerror=onDone;
  state.synth.speak(u);
}
if(window.speechSynthesis) window.speechSynthesis.onvoiceschanged=()=>{};

// ─── UI HELPERS ──────────────────────────────────────────────
function setOrbMode(mode){
  const o=document.getElementById("orbCore"); o.className="orb-core";
  if(mode==="listen") o.classList.add("listening");
  if(mode==="speak")  o.classList.add("speaking");
}
function setStatusBadge(label,cls){
  const dot=document.getElementById("listenDot"), lbl=document.getElementById("listenLabel");
  dot.className="status-dot"+(cls?" "+cls:"");
  lbl.className="status-label"+(cls?" "+cls:"");
  lbl.textContent=label;
}
function setListenUI(on){
  document.getElementById("micBtn").classList.toggle("active",on);
  if(on) state.startWave&&state.startWave();
  else   state.stopWave&&state.stopWave();
}
function setStateText(main,sub){
  document.getElementById("stateText").textContent=main;
  document.getElementById("stateSub").textContent=sub;
}

// ─── CHAT ────────────────────────────────────────────────────
let _cid=0;
function addChat(role,html,thinking=false){
  const log=document.getElementById("chatLog");
  const id="m"+(_cid++);
  const tag={user:"YOU",assistant:"MAXIMUS",system:"SYS"}[role]||"SYS";
  const d=document.createElement("div");
  d.className=`chat-msg ${role}`; d.id=id;
  d.innerHTML=`<span class="msg-tag">${tag}</span><span class="${thinking?"thinking":""}">${html}</span>`;
  log.appendChild(d); log.scrollTop=99999;
  return id;
}
function updateChat(id,html){
  const el=document.getElementById(id); if(!el) return;
  const sp=el.querySelector("span:last-child");
  sp.className=""; sp.innerHTML=fmtText(html);
  document.getElementById("chatLog").scrollTop=99999;
}
function fmtText(t){
  if(!t) return "";
  return t
    .replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

// ─── TEXT INPUT ──────────────────────────────────────────────
function handleKey(e){ if(e.key==="Enter") submitText(); }
function submitText(){
  const inp=document.getElementById("textInput");
  const txt=inp.value.trim(); if(!txt) return;
  inp.value="";
  if(!state.isAwake){ state.isAwake=true; setOrbMode("listen"); setStatusBadge("ACTIVE","active"); }
  processInput(txt);
}
function quickAction(txt){
  if(!state.isAwake){ state.isAwake=true; setOrbMode("listen"); setStateText("ACTIVE","Quick action"); }
  processInput(txt);
}

// ─── ACTIVITY LOG ────────────────────────────────────────────
function logActivity(txt){
  const log=document.getElementById("activityLog");
  const d=document.createElement("div"); d.className="act-item";
  d.textContent=`[${new Date().toLocaleTimeString()}] ${txt}`;
  log.insertBefore(d,log.firstChild);
  while(log.children.length>25) log.removeChild(log.lastChild);
}

// ─── MOBILE PANEL TOGGLE ─────────────────────────────────────
function toggleMobileMenu(){
  const lp=document.getElementById("leftPanel");
  const rp=document.getElementById("rightPanel");
  const open=lp.classList.contains("open");
  lp.classList.toggle("open",!open);
  rp.classList.toggle("open",!open);
}

// ─── API CHECK ───────────────────────────────────────────────
function checkApiKey(){
  const ok=MISTRAL_API_KEY&&MISTRAL_API_KEY!=="PASTE_YOUR_MISTRAL_API_KEY_HERE";
  const el=document.getElementById("sysStatus");
  if(ok){ el.textContent="ONLINE"; el.style.color="var(--ok)"; }
  else {
    el.textContent="NO KEY"; el.style.color="var(--err)";
    addChat("system",`⚠️ No API key found. Open <b>script.js</b> and paste your Mistral key on line 5.<br>
Get a free key at <a href="https://console.mistral.ai" target="_blank" style="color:var(--c)">console.mistral.ai</a>`);
  }
}

// ─── CLEAR HISTORY ───────────────────────────────────────────
function clearHistory(){
  if(!confirm("Clear all conversation history?")) return;
  state.chatHistory=[];
  save.history();
  document.getElementById("chatLog").innerHTML="";
  addChat("system","🗑️ Conversation history cleared.");
  logActivity("History cleared");
}
function clearFiles(){
  state.uploadedFiles=[];
  addChat("system","🗑️ Uploaded file contexts cleared.");
}