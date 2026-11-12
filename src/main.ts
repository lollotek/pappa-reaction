import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './style.css';
import { CpuPlayer } from './ai/CpuPlayer';
import { AudioEngine } from './audio/AudioEngine';
import { GameAudio } from './audio/GameAudio';
import { musicTempo } from './audio/notes';
import { playerSlots } from './config/controls';
import { parseMatchSetup } from './config/matchSetup';
import { tuning } from './config/tuning';
import { createMatchConfig } from './core/matchConfig';
import { MatchMachine } from './core/MatchMachine';
import { Rng } from './core/Rng';
import { MatchDriver } from './game/MatchDriver';
import { Keyboard } from './input/Keyboard';
import { Hud } from './render/Hud';
import { PixelRenderer } from './render/PixelRenderer';
import { MatchScene } from './scenes/MatchScene';
import { Showroom } from './scenes/Showroom';

const app = document.getElementById('app');
if (!app) throw new Error('#app mancante');

const pixel = new PixelRenderer(app, tuning.render.targetHeight);

// Overlay di debug (attiva/disattiva con F3).
const debug = document.getElementById('debug')!;
let showDebug = import.meta.env.DEV;
debug.hidden = !showDebug;
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    showDebug = !showDebug;
    debug.hidden = !showDebug;
  }
});

// Vetrina dei gatti (?vetrina): modelli e pose da vicino, per la revisione grafica.
if (new URLSearchParams(location.search).has('vetrina')) startShowroom(app);
else startMatch(app);

function startShowroom(container: HTMLElement): void {
  const showroom = new Showroom(playerSlots, container);
  pixel.attachCamera(showroom.camera);
  const loop = (now: number) => {
    showroom.update(now);
    pixel.render(showroom.scene, showroom.camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function startMatch(container: HTMLElement): void {
  const scene = new MatchScene(playerSlots);
  pixel.attachCamera(scene.camera);
  // Chi gioca: parametri URL provvisori (?cpu=2,3,4&diff=normale&seed=123), vedi matchSetup.ts.
  const setup = parseMatchSetup(location.search, playerSlots.length);
  const hud = new Hud(
    container,
    playerSlots,
    setup.cpu.map((isCpu) => (isCpu ? `CPU ${setup.difficulty}` : null)),
  );
  const keyboard = new Keyboard(playerSlots);

  // Audio sintetizzato; la musica si ferma al reveal (l'indizio contro le finte del coperchio).
  const audio = new AudioEngine();
  const gameAudio = new GameAudio(audio, { hiccupOnFakeLid: setup.difficulty === 'difficile' });

  let seed = 0;
  let machine!: MatchMachine;
  let driver!: MatchDriver;

  const newMatch = (t: number, fixedSeed?: number) => {
    seed = (fixedSeed ?? Math.random() * 2 ** 32) >>> 0;
    machine = new MatchMachine(createMatchConfig(playerSlots.length), new Rng(seed), t);
    // Ogni CPU ha il suo Rng derivato dal seed: la stessa partita si può rigiocare.
    const cpus = setup.cpu.flatMap((isCpu, p) =>
      isCpu ? [new CpuPlayer(p, tuning.cpu[setup.difficulty], new Rng(seed + 7919 * (p + 1)))] : [],
    );
    driver = new MatchDriver(machine, cpus);
    scene.reset();
    hud.reset();
  };
  newMatch(performance.now(), setup.seed);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && machine.phase === 'final') newMatch(e.timeStamp);
  });

  const refreshAudio = () => {
    hud.setAudioStatus(!audio.ready ? 'locked' : audio.muted ? 'off' : 'on');
    // Audio sbloccato a giro già iniziato: la musica parte subito.
    if (audio.ready && machine.phase === 'circling' && !audio.musicPlaying) {
      audio.startMusic(musicTempo(machine.round, machine.suddenDeath));
    }
  };
  // Solo in sviluppo: accesso da console per test e debug.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __pappa: {
        audio,
        get machine() {
          return machine;
        },
      },
    });
  }
  audio.onChange(refreshAudio);
  refreshAudio();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) audio.toggleMute();
  });

  let fpsFrames = 0;
  let fpsSince = performance.now();
  let fps = 0;

  const frame = (now: number) => {
    // 1. Input umani e CPU in ordine di tempo: ogni pressione vale al suo istante esatto.
    const events = driver.step(now, keyboard.drain());

    // 2. Eventi della logica → animazioni e HUD.
    for (const e of events) {
      scene.onEvent(e);
      hud.onEvent(e, machine);
      gameAudio.onEvent(e, machine);
    }

    // 3. Rendering.
    scene.update(now, machine);
    pixel.render(scene.scene, scene.camera);
    hud.update(now, machine, scene, pixel.layout);

    // 4. Il primo frame che mostra il coperchio aperto è il t0 delle reazioni
    //    (per umani e CPU, che reagiscono solo da qui in poi).
    driver.afterRender(now, scene.lidIsOpen);

    fpsFrames++;
    if (now - fpsSince >= 500) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
    if (showDebug) {
      const l = pixel.layout;
      const left = Math.max(0, machine.phaseEndsAt() - now);
      debug.textContent =
        `${fps} fps · ${l.width}×${l.height} ×${l.scale} · seed ${seed}\n` +
        `round ${machine.round}${machine.suddenDeath ? ' (spareggio)' : ''} · ${machine.phase} · ` +
        `${Number.isFinite(left) ? (left / 1000).toFixed(2) + 's' : '…'} · ${machine.content.id}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
