// Fletcher's mark: a single-color pixel cupid. Drawn in currentColor so CSS
// decides the color, and rendered as crisp SVG rects (one per horizontal run).

// Head, wings, and a heart for a body.
const MARK = {
  wings: [[0, 3], [13, 16]],
  rows: [
    '.......###.......',
    '......#####......',
    '#.....#####.....#',
    '##.....###.....##',
    '###...........###',
    '####..##.##..####',
    '.###.#######.###.',
    '..##..#####..##..',
    '.......###.......',
    '........#........',
  ],
};

function rects(rows) {
  let out = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let run = 1;
      while (row[x + run] === row[x]) run++;
      if (row[x] === '#') out += `<rect x="${x}" y="${y}" width="${run}" height="1"/>`;
      x += run;
    }
  });
  return out;
}

// Square viewBox with the sprite centered, so every mark sits the same in a circle.
function frame(rows) {
  const w = Math.max(...rows.map((r) => r.length));
  const size = Math.max(w, rows.length);
  return `${-(size - w) / 2} ${-(size - rows.length) / 2} ${size} ${size}`;
}

/** Wings-up frame: wing columns lift one row. */
function flapped({ rows, wings }) {
  const inWing = (x) => wings.some(([a, b]) => x >= a && x <= b);
  const h = rows.length;
  return rows.map((row, y) =>
    [...row].map((ch, x) => (inWing(x) ? (y + 1 < h ? rows[y + 1][x] : '.') : ch)).join(''),
  );
}

/** Static Fletcher. */
export function cupidSVG() {
  const { rows } = MARK;
  return `<svg class="cupid" viewBox="${frame(rows)}" shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="Fletcher" xmlns="http://www.w3.org/2000/svg">${rects(rows)}</svg>`;
}

/** Fletcher with two wing frames that CSS alternates (.wing-a / .wing-b). */
export function cupidFlyingSVG() {
  const mark = MARK;
  const up = flapped(mark);
  return `<svg class="cupid cupid--flying" viewBox="${frame(mark.rows)}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g class="wing-a">${rects(mark.rows)}</g><g class="wing-b">${rects(up)}</g></svg>`;
}

/** Tiny pixel heart, used for flourishes. */
export function pixelHeartSVG(color = 'currentColor') {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  return `<svg class="pixel-heart" viewBox="0 0 7 6" shape-rendering="crispEdges" fill="${color}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${rects(rows)}</svg>`;
}
