import './style.css';
import { CpuPlayer } from './ai/CpuPlayer';
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

const app = document.getElementById('app');
if (!app) throw new Error('#app mancante');

const pixel = new PixelRenderer(app, tuning.render.targetHeight);
const scene = new MatchScene(playerSlots);
pixel.attachCamera(scene.camera);
// Chi gioca: parametri URL provvisori (?cpu=2,3,4&diff=normale&seed=123), vedi matchSetup.ts.
const setup = parseMatchSetup(location.search, playerSlots.length);
const hud = new Hud(
  app,
  playerSlots,
  setup.cpu.map((isCpu) => (isCpu ? `CPU ${setup.difficulty}` : null)),
);
const keyboard = new Keyboard(playerSlots);

let seed = 0;
let machine!: MatchMachine;
let driver!: MatchDriver;

function newMatch(t: number, fixedSeed?: number): void {
  seed = (fixedSeed ?? Math.random() * 2 ** 32) >>> 0;
  machine = new MatchMachine(createMatchConfig(playerSlots.length), new Rng(seed), t);
  // Ogni CPU ha il suo Rng derivato dal seed: la stessa partita si può rigiocare.
  const cpus = setup.cpu.flatMap((isCpu, p) =>
    isCpu ? [new CpuPlayer(p, tuning.cpu[setup.difficulty], new Rng(seed + 7919 * (p + 1)))] : [],
  );
  driver = new MatchDriver(machine, cpus);
  scene.reset();
  hud.reset();
}
newMatch(performance.now(), setup.seed);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && machine.phase === 'final') newMatch(e.timeStamp);
});

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

let fpsFrames = 0;
let fpsSince = performance.now();
let fps = 0;

function frame(now: number): void {
  // 1. Input umani e CPU in ordine di tempo: ogni pressione vale al suo istante esatto.
  const events = driver.step(now, keyboard.drain());

  // 2. Eventi della logica → animazioni e HUD.
  for (const e of events) {
    scene.onEvent(e);
    hud.onEvent(e, machine);
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
}
requestAnimationFrame(frame);
