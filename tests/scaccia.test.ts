import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { ScacciaCpu, predictArrival } from '../src/games/scaccia/ai/ScacciaCpu';
import {
  IDLE_CONTROL,
  STEP_MS,
  ScacciaMatch,
  assignSides,
  paddleRange,
  type Ball,
  type PaddleControl,
  type ScacciaEvent,
} from '../src/games/scaccia/core/ScacciaMatch';
import { scacciaTuning } from '../src/games/scaccia/tuning';

const T = scacciaTuning;
const idle = () => IDLE_CONTROL;

function match(opts: Partial<{ target: number; timeLimitMs: number | null; seed: number }> = {}) {
  return new ScacciaMatch(
    {
      playerCount: 4,
      sides: [0, 1, 2, 3],
      target: opts.target ?? 5,
      timeLimitMs: opts.timeLimitMs ?? null,
    },
    new Rng(opts.seed ?? 1),
    0,
  );
}

/** Porta la partita in gioco e toglie la palla di partenza (per mettere palle a mano). */
function playing(m: ScacciaMatch): ScacciaMatch {
  m.advanceTo(T.match.intro * 1000 + STEP_MS, idle);
  m.balls = [];
  m.drainEvents();
  return m;
}

function ball(m: ScacciaMatch, b: Partial<Ball>): Ball {
  const full: Ball = {
    id: 1000 + m.balls.length,
    kind: 'gomitolo',
    pos: { x: 0, y: 0 },
    dir: { x: 0, y: 1 },
    speed: 5,
    baseSpeed: 5,
    owner: null,
    spin: 0,
    smashed: false,
    launchAt: 0,
    lastHitAt: -Infinity,
    ...b,
  };
  m.balls.push(full);
  return full;
}

/** Avanza fino a quando succede un evento del tipo dato (o scade il tempo). */
function runUntil(
  m: ScacciaMatch,
  type: ScacciaEvent['type'],
  controls: (p: number) => PaddleControl = idle,
  maxMs = 5000,
): ScacciaEvent[] {
  const seen: ScacciaEvent[] = [];
  const end = m.time + maxMs;
  while (m.time < end) {
    m.advanceTo(m.time + STEP_MS, controls);
    const evs = m.drainEvents();
    seen.push(...evs);
    if (evs.some((e) => e.type === type)) break;
  }
  return seen;
}

describe('Scaccia la palla: lati', () => {
  it('gli umani in basso, in alto, poi ai lati; le CPU nei lati rimasti', () => {
    expect(assignSides(['human', 'cpu', 'cpu', 'cpu'])).toEqual([0, 2, 3, 1]);
    expect(assignSides(['cpu', 'human', 'cpu', 'human'])).toEqual([3, 0, 1, 2]);
    expect(assignSides(['cpu', 'cpu', 'cpu', 'cpu'])).toEqual([0, 2, 3, 1]);
    expect(new Set(assignSides(['human', 'human', 'human', 'human'])).size).toBe(4);
  });
});

describe('Scaccia la palla: palline', () => {
  it('dopo "pronti… via!" parte una palla che prima trema al centro', () => {
    const m = match();
    m.advanceTo(T.match.intro * 1000 - 10, idle);
    expect(m.phase).toBe('intro');
    expect(m.balls).toHaveLength(0);
    m.advanceTo(T.match.intro * 1000 + 20, idle);
    expect(m.phase).toBe('play');
    expect(m.balls).toHaveLength(1);
    const b = m.balls[0];
    expect(b.owner).toBeNull();
    m.advanceTo(m.time + T.spawn.tell * 1000 - 50, idle);
    expect(b.pos).toEqual({ x: 0, y: 0 });
    m.advanceTo(m.time + 200, idle);
    expect(Math.hypot(b.pos.x, b.pos.y)).toBeGreaterThan(0);
  });

  it('ne arriva una nuova ogni tanto, al massimo 3 in campo', () => {
    const m = match();
    // Cuscini fermi al centro: qualche palla passa, ma intanto se ne aggiungono altre.
    let most = 0;
    for (let t = 0; t < 60_000; t += 50) {
      m.advanceTo(t, idle);
      most = Math.max(most, m.balls.length);
      expect(m.balls.length).toBeLessThanOrEqual(T.spawn.max);
    }
    expect(most).toBeGreaterThan(1);
  });

  it('campo vuoto: la palla nuova arriva subito', () => {
    const m = playing(match());
    expect(m.balls).toHaveLength(0);
    m.advanceTo(m.time + STEP_MS, idle);
    expect(m.balls).toHaveLength(1);
  });

  it('rimbalza sui cuscini d’angolo', () => {
    const m = playing(match());
    const b = ball(m, { pos: { x: 2, y: 2 }, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 } });
    const evs = runUntil(m, 'wall');
    expect(evs.some((e) => e.type === 'wall')).toBe(true);
    // Torna verso il centro.
    expect(b.dir.x + b.dir.y).toBeLessThan(0);
  });
});

describe('Scaccia la palla: rinvii', () => {
  it('il cuscino respinge la palla e la palla prende il colore del gatto', () => {
    const m = playing(match());
    const b = ball(m, { pos: { x: 0.2, y: 1 }, dir: { x: 0, y: 1 } });
    const evs = runUntil(m, 'hit');
    const hit = evs.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ player: 0, smash: false });
    expect(b.owner).toBe(0);
    expect(b.dir.y).toBeLessThan(0);
    // Colpita a destra del centro: va a destra.
    expect(b.dir.x).toBeGreaterThan(0);
    expect(b.speed).toBeGreaterThan(5);
  });

  it('lo smash accelera; muovendosi dà effetto e la traiettoria curva', () => {
    const m = playing(match());
    const b = ball(m, { pos: { x: 0, y: 2.6 }, dir: { x: 0, y: 1 } });
    // Cuscino in corsa verso destra, smash appena prima del contatto.
    const run = (p: number): PaddleControl => (p === 0 ? { axis: 1, target: null } : IDLE_CONTROL);
    m.paddles[0].pos = -0.6;
    m.paddles[0].vel = T.paddle.speed;
    m.advanceTo(m.time + 40, run, [{ player: 0, t: m.time + 1 }]);
    const evs = runUntil(m, 'hit', run, 1000);
    const hit = evs.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ player: 0, smash: true });
    expect(b.speed).toBeGreaterThan(Math.max(T.smash.minSpeed, 5 * T.smash.boost) * 0.99);
    expect(b.spin).not.toBe(0);
    const dir0 = { ...b.dir };
    m.advanceTo(m.time + 300, idle);
    const turned = Math.atan2(b.dir.x, -b.dir.y) - Math.atan2(dir0.x, -dir0.y);
    // Il cuscino correva verso destra (+x): la palla curva verso destra.
    expect(turned).toBeGreaterThan(0.05);
  });

  it('lo smash ha una finestra breve e un tempo di ricarica', () => {
    const m = playing(match());
    m.smash(0, m.time);
    expect(m.swinging(0, m.time)).toBe(true);
    expect(m.swinging(0, m.time + T.smash.window * 1000 + 1)).toBe(false);
    const evs: string[] = [];
    m.smash(0, m.time + 100); // ancora in ricarica
    evs.push(...m.drainEvents().map((e) => e.type));
    expect(evs.filter((e) => e === 'swing')).toHaveLength(1);
  });

  it('palla che rimbalza sul cuscino d’angolo vicino alla porta: il cuscino la salva', () => {
    const m = playing(match());
    // Cuscino verso destra; la palla scende verso la porta, sbatte sul cuscino
    // d'angolo e ne esce quasi parallela alla porta, già vicinissima alla linea.
    m.paddles[0].pos = paddleRange();
    const l = Math.hypot(0.3, 1);
    ball(m, { pos: { x: 2.9, y: 2.6 }, dir: { x: -0.3 / l, y: 1 / l } });
    const evs = runUntil(m, 'hit', idle, 2000);
    expect(evs.some((e) => e.type === 'wall')).toBe(true);
    expect(evs.find((e) => e.type === 'hit')).toMatchObject({ player: 0 });
    expect(evs.some((e) => e.type === 'goal')).toBe(false);
  });

  it('la palla presa di punta dal cuscino rimbalza comunque in campo', () => {
    const m = playing(match());
    m.paddles[0].pos = 0;
    // Arriva di lato, quasi parallela al cuscino, verso la sua punta destra.
    const b = ball(m, { pos: { x: 2.2, y: 3.3 }, dir: { x: -0.997, y: 0.08 } });
    const evs = runUntil(m, 'hit', idle, 1000);
    expect(evs.find((e) => e.type === 'hit')).toMatchObject({ player: 0 });
    expect(b.dir.y).toBeLessThan(0);
  });

  it('il cuscino resta tra i due angoli', () => {
    const m = playing(match());
    m.advanceTo(m.time + 2000, (p) => (p === 0 ? { axis: 1, target: null } : IDLE_CONTROL));
    expect(m.paddles[0].pos).toBeCloseTo(paddleRange(), 5);
    m.advanceTo(m.time + 2000, (p) => (p === 0 ? { axis: 0, target: -99 } : IDLE_CONTROL));
    expect(m.paddles[0].pos).toBeCloseTo(-paddleRange(), 2);
  });
});

describe('Scaccia la palla: punti', () => {
  it('palla neutra in porta: −1 a chi la subisce (mai sotto 0), nessuno guadagna', () => {
    const m = playing(match());
    m.scores = [1, 0, 0, 0];
    m.paddles[0].pos = -paddleRange(); // cuscino lontano: la palla passa
    ball(m, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 } });
    const goal = runUntil(m, 'goal').find((e) => e.type === 'goal');
    expect(goal).toMatchObject({ side: 0, conceder: 0, scorer: null });
    expect(m.scores).toEqual([0, 0, 0, 0]);
    m.paddles[0].pos = -paddleRange();
    ball(m, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 } });
    runUntil(m, 'goal');
    expect(m.scores).toEqual([0, 0, 0, 0]);
  });

  it('palla toccata: +1 all’ultimo che l’ha toccata, −1 a chi la subisce', () => {
    const m = playing(match());
    m.scores = [2, 0, 0, 0];
    m.paddles[0].pos = -paddleRange();
    ball(m, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 }, owner: 2 });
    runUntil(m, 'goal');
    expect(m.scores).toEqual([1, 0, 1, 0]);
  });

  it('autogol: solo −1', () => {
    const m = playing(match());
    m.scores = [2, 0, 0, 0];
    m.paddles[0].pos = -paddleRange();
    ball(m, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 }, owner: 0 });
    runUntil(m, 'goal');
    expect(m.scores).toEqual([1, 0, 0, 0]);
  });

  it('vince chi arriva per primo ai punti stabiliti', () => {
    const m = playing(match({ target: 3 }));
    m.scores = [0, 0, 2, 0];
    m.paddles[0].pos = -paddleRange();
    ball(m, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 }, owner: 2 });
    runUntil(m, 'goal');
    expect(m.phase).toBe('final');
    expect(m.winner).toBe(2);
    expect(m.standings?.[0]).toBe(2);
    expect(m.balls).toHaveLength(0);
  });

  it('a tempo: allo scadere vince chi è in testa; a pari punti si va allo spareggio', () => {
    // I punti si fissano appena prima dello scadere (intanto le palle segnano).
    const lead = playing(match({ timeLimitMs: 10_000 }));
    lead.advanceTo(lead.playStart + 10_000 - 20, idle);
    lead.scores = [0, 2, 1, 0];
    lead.advanceTo(lead.playStart + 10_000 + 20, idle);
    expect(lead.phase).toBe('final');
    expect(lead.winner).toBe(1);

    const tie = playing(match({ timeLimitMs: 10_000 }));
    tie.advanceTo(tie.playStart + 10_000 - 20, idle);
    tie.scores = [2, 2, 0, 0];
    tie.advanceTo(tie.playStart + 10_000 + 20, idle);
    expect(tie.phase).toBe('play');
    expect(tie.suddenDeath).toBe(true);
    tie.balls = [];
    tie.paddles[0].pos = -paddleRange();
    ball(tie, { pos: { x: 1.5, y: 3 }, dir: { x: 0, y: 1 }, owner: 3 });
    tie.drainEvents();
    runUntil(tie, 'goal');
    expect(tie.phase).toBe('final');
    expect(tie.winner).toBe(1);
  });
});

describe('Scaccia la palla: CPU', () => {
  it('prevede dove arriva una palla', () => {
    const m = playing(match());
    const b = ball(m, { pos: { x: 1, y: 0 }, dir: { x: 0, y: 1 } });
    const a = predictArrival(b, 0, T, m.time, true);
    expect(a?.along).toBeCloseTo(1, 1);
    expect(predictArrival(b, 2, T, m.time, true)).toBeNull();
  });

  it('una CPU para una palla dritta', () => {
    const m = playing(match());
    const cpu = new ScacciaCpu(0, T.cpu.difficile, new Rng(5));
    ball(m, { pos: { x: 1.6, y: -1 }, dir: { x: 0, y: 1 }, speed: 4, baseSpeed: 4 });
    const evs = runUntil(m, 'hit', (p) => (p === 0 ? cpu.control(m.time, m) : IDLE_CONTROL));
    expect(evs.find((e) => e.type === 'hit')).toMatchObject({ player: 0 });
  });

  it('partite tra CPU: finiscono, e la difficile subisce meno gol della facile', () => {
    const conceded = { facile: 0, difficile: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const m = match({ seed, target: 5 });
      const profiles = [T.cpu.difficile, T.cpu.facile, T.cpu.difficile, T.cpu.facile];
      const cpus = profiles.map((pr, i) => new ScacciaCpu(i, pr, new Rng(seed * 31 + i)));
      let t = 0;
      while (m.phase !== 'final' && t < 15 * 60_000) {
        t += 16;
        const controls = cpus.map((c) => c.control(m.time, m));
        m.advanceTo(
          t,
          (p) => controls[p],
          cpus.flatMap((c) => c.drainSmashes()),
        );
        for (const e of m.drainEvents()) {
          if (e.type === 'goal') conceded[e.conceder % 2 === 0 ? 'difficile' : 'facile']++;
        }
      }
      expect(m.phase).toBe('final');
    }
    expect(conceded.difficile).toBeLessThan(conceded.facile * 0.75);
  });

  it('stessa partita con lo stesso seed', () => {
    const run = () => {
      const m = match({ seed: 9 });
      const cpus = [0, 1, 2, 3].map((i) => new ScacciaCpu(i, T.cpu.normale, new Rng(100 + i)));
      for (let t = 0; t < 30_000; t += 16) {
        const controls = cpus.map((c) => c.control(m.time, m));
        m.advanceTo(
          t,
          (p) => controls[p],
          cpus.flatMap((c) => c.drainSmashes()),
        );
      }
      return [...m.scores, m.ballCount];
    };
    expect(run()).toEqual(run());
  });
});
