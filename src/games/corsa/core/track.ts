import { corsaTuning, type CorsaTuning } from '../tuning';

/**
 * Geometria della pista di Corsa pazza: un anello tra due rettangoli dagli
 * angoli arrotondati. Coordinate (x, y); y è la profondità nella scena 3D
 * (verso la camera = giù sullo schermo). Si corre in senso antiorario sullo
 * schermo; il traguardo è a metà del rettilineo in basso.
 */

export interface Vec {
  x: number;
  y: number;
}

/** Distanza con segno dal bordo di un rettangolo arrotondato (negativa dentro) e normale uscente. */
export function roundBox(
  p: Vec,
  half: { x: number; y: number; r: number },
): { d: number; nx: number; ny: number } {
  const sx = p.x < 0 ? -1 : 1;
  const sy = p.y < 0 ? -1 : 1;
  const qx = Math.abs(p.x) - (half.x - half.r);
  const qy = Math.abs(p.y) - (half.y - half.r);
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy);
    return { d: l - half.r, nx: (sx * qx) / l, ny: (sy * qy) / l };
  }
  if (qx > qy) return { d: qx - half.r, nx: sx, ny: 0 };
  return { d: qy - half.r, nx: 0, ny: sy };
}

/**
 * Corregge una posizione perché il cerchio di raggio `radius` stia dentro la
 * pista. Restituisce la spinta applicata (verso l'interno della pista) o null
 * se non ha toccato nulla.
 */
export function keepOnTrack(
  pos: Vec,
  radius: number,
  t: CorsaTuning = corsaTuning,
): { x: number; y: number } | null {
  let pushed: { x: number; y: number } | null = null;
  const outer = roundBox(pos, t.track.outer);
  if (outer.d > -radius) {
    const k = outer.d + radius;
    pos.x -= outer.nx * k;
    pos.y -= outer.ny * k;
    pushed = { x: -outer.nx, y: -outer.ny };
  }
  const inner = roundBox(pos, t.track.inner);
  if (inner.d < radius) {
    const k = radius - inner.d;
    pos.x += inner.nx * k;
    pos.y += inner.ny * k;
    pushed = { x: inner.nx, y: inner.ny };
  }
  return pushed;
}

/** Un tratto della linea mediana: rettilineo o arco di cerchio. */
type Piece =
  | { kind: 'line'; a: Vec; b: Vec; len: number }
  | { kind: 'arc'; c: Vec; r: number; from: number; to: number; len: number };

/** Lunghezza della linea mediana. */
export function laneLength(t: CorsaTuning = corsaTuning): number {
  return pieces(t).reduce((s, p) => s + p.len, 0);
}

const cache = new WeakMap<CorsaTuning, Piece[]>();

/** Tratti della mediana, in senso di marcia (antiorario sullo schermo), dal traguardo. */
function pieces(t: CorsaTuning): Piece[] {
  const hit = cache.get(t);
  if (hit) return hit;
  const { x: a, y: b, r } = t.track.mid;
  const sx = a - r;
  const sy = b - r;
  const line = (ax: number, ay: number, bx: number, by: number): Piece => ({
    kind: 'line',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    len: Math.hypot(bx - ax, by - ay),
  });
  const arc = (cx: number, cy: number, from: number, to: number): Piece => ({
    kind: 'arc',
    c: { x: cx, y: cy },
    r,
    from,
    to,
    len: Math.abs(to - from) * r,
  });
  const h = Math.PI / 2;
  const list = [
    line(0, b, sx, b), // in basso, verso destra
    arc(sx, sy, h, 0), // angolo in basso a destra
    line(a, sy, a, -sy), // a destra, verso l'alto
    arc(sx, -sy, 0, -h), // angolo in alto a destra
    line(sx, -b, -sx, -b), // in alto, verso sinistra
    arc(-sx, -sy, -h, -2 * h), // angolo in alto a sinistra
    line(-a, -sy, -a, sy), // a sinistra, verso il basso
    arc(-sx, sy, 2 * h, h), // angolo in basso a sinistra
    line(-sx, b, 0, b), // in basso, verso il traguardo
  ];
  cache.set(t, list);
  return list;
}

export interface LanePoint {
  /** Ascissa curvilinea sulla mediana, 0 = traguardo, in [0, lunghezza). */
  s: number;
  /** Distanza dalla mediana (positiva verso l'esterno). */
  off: number;
}

/** Punto della mediana più vicino a `p`: dove si è nel giro e quanto si è larghi. */
export function project(p: Vec, t: CorsaTuning = corsaTuning): LanePoint {
  let best = { dist: Infinity, s: 0, off: 0 };
  let base = 0;
  for (const piece of pieces(t)) {
    let q: Vec;
    let along: number;
    let outward: number;
    if (piece.kind === 'line') {
      const dx = piece.b.x - piece.a.x;
      const dy = piece.b.y - piece.a.y;
      const u = Math.max(
        0,
        Math.min(1, ((p.x - piece.a.x) * dx + (p.y - piece.a.y) * dy) / (piece.len * piece.len)),
      );
      q = { x: piece.a.x + dx * u, y: piece.a.y + dy * u };
      along = u * piece.len;
      // Verso l'interno della pista = a sinistra di chi corre: (ty, −tx).
      outward = -((p.x - q.x) * (dy / piece.len) + (p.y - q.y) * (-dx / piece.len));
    } else {
      const dir = piece.to > piece.from ? 1 : -1;
      let ang = Math.atan2(p.y - piece.c.y, p.x - piece.c.x);
      const lo = Math.min(piece.from, piece.to);
      const hi = Math.max(piece.from, piece.to);
      // Porta l'angolo nell'intorno dell'arco, poi lo blocca agli estremi.
      while (ang < lo - Math.PI) ang += 2 * Math.PI;
      while (ang > hi + Math.PI) ang -= 2 * Math.PI;
      ang = Math.max(lo, Math.min(hi, ang));
      q = { x: piece.c.x + Math.cos(ang) * piece.r, y: piece.c.y + Math.sin(ang) * piece.r };
      along = (dir > 0 ? ang - piece.from : piece.from - ang) * piece.r;
      // Il centro dell'arco è dentro: più lontano dal centro = più esterno.
      outward = Math.hypot(p.x - piece.c.x, p.y - piece.c.y) - piece.r;
    }
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (dist < best.dist - 1e-9) best = { dist, s: base + along, off: outward };
    base += piece.len;
  }
  return { s: best.s, off: best.off };
}

/** Punto sulla mediana a `s` (anche oltre un giro), con direzione di marcia (versore). */
export function lanePoint(
  s: number,
  off = 0,
  t: CorsaTuning = corsaTuning,
): { x: number; y: number; tx: number; ty: number } {
  const list = pieces(t);
  const total = list.reduce((sum, p) => sum + p.len, 0);
  let rest = ((s % total) + total) % total;
  for (const piece of list) {
    if (rest <= piece.len) {
      let x: number;
      let y: number;
      let tx: number;
      let ty: number;
      if (piece.kind === 'line') {
        tx = (piece.b.x - piece.a.x) / piece.len;
        ty = (piece.b.y - piece.a.y) / piece.len;
        x = piece.a.x + tx * rest;
        y = piece.a.y + ty * rest;
        // Esterno = a destra di chi corre: (−ty, tx).
        x += -ty * off;
        y += tx * off;
      } else {
        const dir = piece.to > piece.from ? 1 : -1;
        const ang = piece.from + (dir * rest) / piece.r;
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        x = piece.c.x + cx * (piece.r + off);
        y = piece.c.y + cy * (piece.r + off);
        tx = -cy * dir;
        ty = cx * dir;
      }
      return { x, y, tx, ty };
    }
    rest -= piece.len;
  }
  return { x: 0, y: corsaTuning.track.mid.y, tx: 1, ty: 0 };
}
