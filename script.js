/* =================================================================
   MAIL ADVENTURE — script.js
   -----------------------------------------------------------------
   Todo lo que necesitas cambiar está en CONFIG, al inicio del archivo.
   ================================================================= */

'use strict';

/* -----------------------------------------------------------------
   CONFIGURACIÓN — edita esto para adaptar el proyecto
   ----------------------------------------------------------------- */
const CONFIG = {
  gameURL: 'https://someonee34.itch.io/mail-adventure',

  // Debe coincidir con --t-stage1/2/3 en style.css
  stageDurations: {
    stage1: 550,
    stage2: 700,
    stage3: 800,
  },
  redirectDelay: 250,

  audio: {
    ambientSrc: 'assets/audio/ambient.mp3',
    openSrc: 'assets/audio/open.mp3',
  },

  sparkleCount: 22,
};

/* -----------------------------------------------------------------
   ELEMENTOS
   ----------------------------------------------------------------- */
const invite        = document.getElementById('invite');
const inviteHint     = document.getElementById('inviteHint');
const fadeOut        = document.getElementById('fadeOut');
const soundToggle    = document.getElementById('soundToggle');
const soundIcon      = document.getElementById('soundIcon');
const sparklesRoot   = document.getElementById('sparkles');
const ambientAudioEl = document.getElementById('ambientAudio');
const openAudioEl    = document.getElementById('openAudio');

let isOpening = false;
let audioUnlocked = false;

/* -----------------------------------------------------------------
   PARTÍCULAS — motas doradas flotando (estilo pixel: cuadraditos)
   ----------------------------------------------------------------- */
function spawnSparkles(count){
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++){
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = 30 + Math.random() * 65 + '%';
    s.style.animationDuration = (7 + Math.random() * 9) + 's';
    s.style.animationDelay = (Math.random() * 12) + 's';
    frag.appendChild(s);
  }
  sparklesRoot.appendChild(frag);
}
spawnSparkles(CONFIG.sparkleCount);

/* -----------------------------------------------------------------
   AUDIO — usa assets/audio si existen; si no, Web Audio genera un
   ambiente ligero y una campanilla al abrir la carta.
   ----------------------------------------------------------------- */
let audioCtx = null;
let ambientNodes = null;
let openFileWorks = true;

function getAudioCtx(){
  if (!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

// Ambiente ligero y alegre (dos tonos suaves con vibrato lento),
// pensado para un juego luminoso, no un dron tenebroso.
function startSynthAmbient(){
  const ctx = getAudioCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 1.5);

  const osc1 = ctx.createOscillator(); osc1.type = 'triangle'; osc1.frequency.value = 220;
  const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 330;

  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 4;
  lfo.connect(lfoGain); lfoGain.connect(osc2.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 900;

  osc1.connect(filter); osc2.connect(filter); filter.connect(master);
  osc1.start(); osc2.start(); lfo.start();

  ambientNodes = { master, osc1, osc2, lfo };
}

function stopSynthAmbient(){
  if (!ambientNodes || !audioCtx) return;
  const { master, osc1, osc2, lfo } = ambientNodes;
  master.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + .8);
  setTimeout(() => { [osc1, osc2, lfo].forEach(n => { try { n.stop(); } catch(e){} }); }, 900);
  ambientNodes = null;
}

// Campanilla de "8 bits" ascendente al abrir la carta
function playSynthChime(){
  const ctx = getAudioCtx();
  if (!ctx) return;
  const notes = [392, 523.25, 659.25, 880];
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.55);
  });
}

function playOpenSound(){
  if (openFileWorks){
    openAudioEl.currentTime = 0;
    openAudioEl.play().catch(() => { openFileWorks = false; playSynthChime(); });
  } else {
    playSynthChime();
  }
}

/* -----------------------------------------------------------------
   REPRODUCCIÓN AUTOMÁTICA
   Los navegadores bloquean el audio con sonido hasta que hay una
   interacción del usuario (no es una limitación de este código,
   es una política de Chrome/Safari/Firefox). Por eso:
   1) Intentamos reproducir apenas carga la página.
   2) Si el navegador lo bloquea, reintentamos automáticamente en el
      primer toque/clic/tecla en cualquier parte de la página —
      sin que el usuario tenga que pulsar el botón de sonido.
   ----------------------------------------------------------------- */
let ambientPlaying = false;
let startAttemptInFlight = false;

function setSoundUI(playing){
  soundToggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
  soundIcon.textContent = playing ? '🔊' : '🔇';
}

// ctx.resume() se queda colgado para siempre si no hubo un gesto real
// del usuario (el navegador simplemente nunca resuelve esa promesa).
// La carrera contra un timeout evita que eso bloquee todo lo demás,
// incluido el botón de sonido.
function resumeWithTimeout(ctx, ms){
  return Promise.race([
    ctx.resume().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

async function startAmbient(){
  // Ya suena, o ya hay un intento en curso: no hacer nada.
  if (ambientPlaying || startAttemptInFlight) return;
  startAttemptInFlight = true;
  audioUnlocked = true;

  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') {
    await resumeWithTimeout(ctx, 300);
  }

  ambientAudioEl.volume = 0.3;
  try {
    await ambientAudioEl.play();
    ambientPlaying = true;
    setSoundUI(true);
  } catch (e) {
    // El archivo no existe o el navegador bloqueó el audio del <audio>.
    // Probamos el respaldo de Web Audio, pero solo lo damos por
    // exitoso si el contexto realmente quedó "running" (es decir, si
    // este intento vino de un gesto real del usuario). Si no, dejamos
    // ambientPlaying en false para que el próximo gesto reintente.
    startSynthAmbient();
    if (ctx && ctx.state === 'running'){
      ambientPlaying = true;
      setSoundUI(true);
    } else {
      stopSynthAmbient();
    }
  }
  startAttemptInFlight = false;
}

function toggleAmbientSound(){
  if (ambientPlaying){
    ambientAudioEl.pause();
    stopSynthAmbient();
    ambientPlaying = false;
    setSoundUI(false);
  } else {
    startAmbient();
  }
}

soundToggle.addEventListener('click', toggleAmbientSound);
openAudioEl.addEventListener('error', () => { openFileWorks = false; });

// Intento inmediato (funciona si el navegador lo permite, p.ej. si
// la pestaña ya tuvo interacción previa, o en algunos navegadores
// de escritorio con el sonido del sistema habilitado).
startAmbient();

// Respaldo: en cuanto el usuario toque la página de cualquier forma,
// el sonido arranca solo — no hace falta que use el botón. No usamos
// { once:true } porque el primer intento puede fallar igual (por
// ejemplo si el navegador exige un click real y no basta un keydown);
// startAmbient() ya se protege solo contra llamadas repetidas.
['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
  window.addEventListener(evt, startAmbient, { passive: true });
});

/* -----------------------------------------------------------------
   APERTURA DE LA CARTA — secuencia de tres etapas
   ----------------------------------------------------------------- */
function openInvite(){
  if (isOpening) return;
  isOpening = true;

  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();

  invite.classList.add('stage-1');
  if (inviteHint) inviteHint.style.opacity = '0';

  setTimeout(() => {
    invite.classList.add('stage-2');
    playOpenSound();

    setTimeout(() => {
      invite.classList.add('stage-3');
      fadeOut.classList.add('is-active');

      setTimeout(() => {
        window.location.href = CONFIG.gameURL;
      }, CONFIG.stageDurations.stage3 + CONFIG.redirectDelay);

    }, CONFIG.stageDurations.stage2);

  }, CONFIG.stageDurations.stage1);
}

invite.addEventListener('click', openInvite);
invite.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    openInvite();
  }
});

/* -----------------------------------------------------------------
   Respeta "prefers-reduced-motion"
   ----------------------------------------------------------------- */
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  CONFIG.stageDurations.stage1 = 50;
  CONFIG.stageDurations.stage2 = 50;
  CONFIG.stageDurations.stage3 = 50;
  CONFIG.redirectDelay = 100;
}
