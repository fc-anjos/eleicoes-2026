// Dots arrive packed (see pack() in build.py). They are projected once, with the raw Mercator formula, into U;
// fitting the map to the window is then just a scale and offset of U (project() runs again on every resize).
// Each year has its own dots (n, U, C, and P projected to the screen). The map shows one year, or both side by
// side in compare mode, split by a draggable divider (see layers()).
import { YEARS } from "./data.js";
import { S, YS } from "./state.js";

const decode = (b64) => {
  const bin = atob(b64),
    bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export const DOT = {};
for (const y of YS) {
  const D = YEARS[y].dots,
    n = D.n,
    U = new Float32Array(2 * n),
    C = new Uint8Array(n);
  const bytes = decode(D.b);
  const X = new Uint16Array(bytes.buffer, 0, n),
    Y = new Uint16Array(bytes.buffer, 2 * n, n),
    rad = Math.PI / 180000;
  C.set(bytes.subarray(4 * n, 5 * n));
  for (let i = 0; i < n; i++) {
    U[2 * i] = (X[i] + D.x0) * rad;
    U[2 * i + 1] = -Math.log(Math.tan(Math.PI / 4 + ((Y[i] + D.y0) * rad) / 2));
  }
  // dots come grouped by municipality (in ORDER, feature indices) and within it by polling place: GM holds each
  // municipality's first group, S each group's first dot, GR its row in the place table (-1: none), GP whether it
  // passes
  const cnt = YEARS[y].cnt,
    ng = YEARS[y].ng,
    gbytes = decode(YEARS[y].groups);
  const GR = new Int32Array(gbytes.buffer, 0, ng),
    GC = new Uint16Array(gbytes.buffer, 4 * ng, ng),
    Sg = new Uint32Array(ng + 1),
    GM = new Uint32Array(cnt.length + 1);
  for (let g = 0; g < ng; g++) Sg[g + 1] = Sg[g] + GC[g];
  for (let r = 0; r < cnt.length; r++) GM[r + 1] = GM[r] + cnt[r];
  // GV: each group's exact votes by colour category (K per group), for totals under polling-place filters
  const vb = decode(YEARS[y].gvotes),
    GV = YEARS[y].gv16 ? new Uint16Array(vb.buffer) : new Uint32Array(vb.buffer);
  DOT[y] = { n, U, C, S: Sg, GM, GR, GV, GP: new Uint8Array(ng).fill(1), P: new Float32Array(2 * n) };
  delete D.b;
  delete YEARS[y].groups;
  delete YEARS[y].gvotes;
}

// screen positions (before zoom) for the current projection scale and offset
export function project(proj) {
  const k = proj.scale(),
    [tx, ty] = proj.translate();
  for (const y of YS) {
    const { n, U, P } = DOT[y];
    for (let i = 0; i < n; i++) {
      P[2 * i] = U[2 * i] * k + tx;
      P[2 * i + 1] = U[2 * i + 1] * k + ty;
    }
  }
}

// what to draw, and in which columns: one year across the map, or each year on its side of the divider
export function layers() {
  const { w } = S,
    sx = Math.round(S.SPLIT * w);
  return S.COMPARE
    ? [
        { ...DOT[YS[1]], x0: 0, x1: sx },
        { ...DOT[YS[0]], x0: sx, x1: w },
      ]
    : [{ ...DOT[S.YEAR], x0: 0, x1: w }];
}
