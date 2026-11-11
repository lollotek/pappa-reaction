import './style.css';
import { playerSlots } from './config/controls';
import { tuning } from './config/tuning';
import { createRoundConfig } from './core/roundConfig';
import { Rng } from './core/Rng';
import { RoundMachine } from './core/RoundMachine';
import { Keyboard } from './input/Keyboard';
import { Hud } from './render/Hud';
import { PixelRenderer } from './render/PixelRenderer';
import { MatchScene } from './scenes/MatchScene';

const app = document.getElementById('app');
if (!app) throw new Error('#app mancante');

const pixel = new PixelRenderer(app, tuning.render.targetHeight);
const scene = new MatchScene(playerSlots);
pixel.attachCamera(scene.camera);
const hud = new Hud(app, playerSlots);
const keyboard = new Keyboard(playerSlots);

const seed = Date.now() >>> 0;
const machine = new RoundMachine(
  createRoundConfig(playerSlots.length),
  new Rng(seed),
  performance.now(),
);

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
  // 1. Input in ordine di tempo: ogni pressione è valutata al suo istante esatto.
  for (const input of keyboard.drain()) machine.input(input.player, input.action, input.t);
  machine.advanceTo(now);

  // 2. Eventi della logica → animazioni e HUD.
  for (const e of machine.drainEvents()) {
    scene.onEvent(e);
    hud.onEvent(e, machine);
  }

  // 3. Rendering.
  scene.update(now, machine);
  pixel.render(scene.scene, scene.camera);
  hud.update(now, machine, scene, pixel.layout);

  // 4. Il primo frame che mostra il coperchio aperto è il t0 delle reazioni.
  if (scene.lidIsOpen) machine.markRevealShown(now);

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
      `round ${machine.round} · ${machine.phase} · ${Number.isFinite(left) ? (left / 1000).toFixed(2) + 's' : '…'}` +
      ` · ${machine.content.id}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
