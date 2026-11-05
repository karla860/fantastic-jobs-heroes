(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const NOISE = "<>/{}[]=:;$#%*+~01";
  const RAMP = " .·:-=+*#%";

  // One job's trip across the board, in ms. A new listing lands every four seconds.
  const PHASES = { raw: 800, into: 600, chip: 1100, out: 500, land: 1000 };
  const CYCLE = Object.values(PHASES).reduce((sum, value) => sum + value, 0);

  const PITCH = 10; // Spacing between parallel traces.
  const PIN_PITCH = 14; // Spacing between pins, and between the traces that meet them.
  const BEVEL = 14; // Matches --bevel in the CSS.

  const hero = document.querySelector("[data-hero]");
  const board = document.querySelector("[data-circuit]");
  const headline = document.querySelector(".headline");
  const copyBody = document.querySelector(".intro__body");
  const copyCtas = document.querySelector(".ctas");
  const rawModule = document.querySelector("[data-raw]");
  const markupEl = document.querySelector("[data-markup]");
  const asciiEl = document.querySelector("[data-ascii]");
  const chip = document.querySelector("[data-chip]");
  const jsonEl = document.querySelector("[data-json]");
  const windowEl = document.querySelector("[data-window]");
  const list = document.querySelector("[data-list]");
  const logoGrid = document.querySelector(".logos ul");

  let clock = 0;
  let lastFrame = 0;
  let inTraces = [];
  let outTraces = [];
  let chipOutline = null;
  let rows = [];
  let landedCycle = -1;
  let landedRow = null;
  let shownMarkup = "";
  let shownJson = "";
  let asciiSize = { cols: 40, rows: 10 };

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => value * value * (3 - 2 * value);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent?.append(node);
    return node;
  }

  // Stable pseudo-random, so the board and the noise look the same on every load.
  function hash(a, b) {
    const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  /* ---------- The board ---------- */

  // Half-pixel coordinates keep 1px lines crisp.
  const crisp = (value) => Math.round(value) + 0.5;

  // A parallel copy of an octilinear route, mitred at each bend so spacing stays even.
  function offsetRoute(points, distance) {
    const normal = (a, b) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    };
    return points.map((point, index) => {
      const before = normal(points[Math.max(index - 1, 0)], points[Math.max(index, 1)]);
      const after = normal(points[Math.min(index, points.length - 2)], points[Math.min(index + 1, points.length - 1)]);
      const mx = before[0] + after[0];
      const my = before[1] + after[1];
      const length = Math.hypot(mx, my) || 1;
      const scale = distance / ((mx / length) * before[0] + (my / length) * before[1]);
      return [point[0] + (mx / length) * scale, point[1] + (my / length) * scale];
    });
  }

  const toPath = (points) => points.map(([x, y], index) => `${index ? "L" : "M"}${crisp(x)} ${crisp(y)}`).join("");

  function buildBoard() {
    board.replaceChildren();
    const width = hero.clientWidth;
    const base = hero.getBoundingClientRect();
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left - base.left,
        right: rect.right - base.left,
        top: rect.top - base.top,
        bottom: rect.bottom - base.top,
        width: rect.width,
        height: rect.height,
        midX: rect.left - base.left + rect.width / 2,
        midY: rect.top - base.top + rect.height / 2,
      };
    };

    const raw = box(rawModule);
    const die = box(chip);
    const app = box(windowEl);
    const stacked = die.top >= raw.bottom;
    const lines = [...headline.querySelectorAll("span")].map((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      return box(range);
    });
    const body = box(copyBody);
    const copyLeft = Math.min(body.left, ...lines.map((line) => line.left));
    const copyRight = Math.max(body.right, ...lines.map((line) => line.right));

    const traces = [];
    const vias = [];
    const pulses = [];

    const addLine = (points) => traces.push(toPath(points));
    const addVia = ([x, y]) => vias.push([crisp(x), crisp(y)]);

    // A bundle of parallel traces following one route.
    function bundle(points, count, pitch, { viaEnd = false, pulse = [], reverse = false } = {}) {
      for (let i = 0; i < count; i += 1) {
        const route = offsetRoute(points, (i - (count - 1) / 2) * pitch);
        addLine(route);
        if (viaEnd) addVia(route[route.length - 1]);
        if (pulse.includes(i)) pulses.push({ d: toPath(reverse ? [...route].reverse() : route), delay: i * 1.3 + points[0][1] * 0.013 });
      }
    }

    // Traces fanning in from a page edge, ending in a clean stair of vias.
    function fan(side, y, count, reach) {
      const flip = (x) => (side === "left" ? x : width - x);
      for (let i = 0; i < count; i += 1) {
        const lineY = y + i * PITCH;
        const end = reach - i * PITCH;
        const route = [[flip(-2), lineY], [flip(end), lineY], [flip(end + 12), lineY + 12]];
        addLine(route);
        addVia(route[2]);
        if (i === 1) pulses.push({ d: toPath(side === "left" ? route : [...route].reverse()), delay: y * 0.02 });
      }
    }

    // An IC footprint, wired in from the page edge.
    function component(side, y, size, pins) {
      const flip = (x) => (side === "left" ? x : width - x);
      const reach = Math.min(side === "left" ? roomLeft : roomRight, size + 120) - size;
      const near = reach;
      const far = reach + size;
      const left = Math.min(flip(near), flip(far));
      svg("rect", { x: crisp(left), y: crisp(y), width: size, height: size, class: "circuit__body" }, board);
      svg("circle", { cx: left + 8, cy: y + 8, r: 2, class: "circuit__dot" }, board);
      const start = y + (size - (pins - 1) * PIN_PITCH) / 2;
      for (let i = 0; i < pins; i += 1) {
        const py = start + i * PIN_PITCH;
        addLine([[flip(-2), py], [flip(near), py]]);
        addLine([[flip(far), py], [flip(far + 7), py]]);
        const px = left + start - y + i * PIN_PITCH;
        addLine([[px, y], [px, y - 7]]);
        addLine([[px, y + size], [px, y + size + 7]]);
      }
    }

    const topRun = 128; // The buses run just under the nav.

    /* The two buses that feed the page: career sites in on the left, out to products on the right. */
    let roomLeft = 0;
    let roomRight = 0;
    if (!stacked) {
      const feedX = Math.min(raw.left + raw.width * 0.3, copyLeft - 52);
      const exitX = Math.max(app.left + app.width * 0.7, copyRight + 52);

      // The chip's top pins, routed out to meet both buses in the band under the CTAs.
      const bandY = Math.min(raw.top, app.top, die.top) - 34;
      if (box(copyCtas).bottom + 24 < bandY - 15) {
        const fromLeft = die.left + die.width * 0.3;
        const fromRight = die.right - die.width * 0.3;
        bundle([[fromLeft, die.top - 7], [fromLeft, bandY + 24], [fromLeft - 24, bandY], [feedX + 44, bandY]], 4, PITCH, { viaEnd: true, pulse: [1], reverse: true });
        bundle([[fromRight, die.top - 7], [fromRight, bandY + 24], [fromRight + 24, bandY], [exitX - 44, bandY]], 4, PITCH, { viaEnd: true, pulse: [2] });
      }

      if (feedX - 25 > raw.left + BEVEL) {
        bundle([[-2, topRun], [feedX - 44, topRun], [feedX, topRun + 44], [feedX, raw.top]], 6, PITCH, { pulse: [1, 4] });
        roomLeft = feedX - 25 - 44;
      }
      if (exitX + 25 < app.right - 8) {
        bundle([[exitX, app.top], [exitX, topRun + 44], [exitX + 44, topRun], [width + 2, topRun]], 6, PITCH, { pulse: [1, 4] });
        roomRight = width - exitX - 25 - 44;
      }

      // The sides, between the buses and the page edge.
      [["left", roomLeft], ["right", roomRight]].forEach(([side, room]) => {
        if (room < 64) return;
        const edge = side === "left" ? raw : app;
        let y = topRun + 60;
        let turn = side === "left" ? 0 : 1;
        while (y < edge.top - 64) {
          const useChip = turn % 2 === 0 && room >= 110 && y + 80 < edge.top - 24;
          if (useChip) {
            component(side, y + 8, 56, 3);
            y += 100;
          } else {
            const count = 3 + Math.floor(hash(y, turn) * 3);
            fan(side, y, count, Math.max(36, room * (0.55 + hash(turn, y) * 0.42)));
            y += count * PITCH + 44;
          }
          turn += 1;
        }
      });

      // Into the side of the raw card and out of the side of the window, when there's margin.
      if (raw.left > 30) {
        bundle([[-2, raw.midY + 34], [raw.left - 46, raw.midY + 34], [raw.left - 12, raw.midY], [raw.left, raw.midY]], 4, PITCH, { pulse: [2] });
      }
      if (width - app.right > 30) {
        bundle([[app.right, app.midY], [app.right + 12, app.midY], [app.right + 46, app.midY + 34], [width + 2, app.midY + 34]], 4, PITCH, { pulse: [1] });
      }
    }

    const strip = box(logoGrid);

    /* Traces from the underside of each card, down into the logo block.
       When stacked, only the last card has clear board beneath it. */
    (stacked ? [app] : [raw, die, app]).forEach((card) => {
      const count = 5;
      for (let i = 0; i < count; i += 1) {
        const x = card.midX + (i - (count - 1) / 2) * PIN_PITCH;
        const route = [[x, card.bottom], [x, strip.top]];
        addLine(route);
        addVia(route[1]);
      }
    });

    /* The logo block's cell dividers, and pins along its underside. */
    [...logoGrid.children].map(box).forEach((cell) => {
      if (cell.right < strip.right - 1) addLine([[cell.right, cell.top], [cell.right, cell.bottom]]);
      if (cell.bottom < strip.bottom - 1) addLine([[cell.left, cell.bottom], [cell.right, cell.bottom]]);
    });
    for (let x = strip.left + BEVEL + 14; x < strip.right - BEVEL - 8; x += PIN_PITCH) {
      addLine([[x, strip.bottom], [x, strip.bottom + 7]]);
    }

    /* Card outlines, bevelled and drawn in the same language as the routing. */
    const bevelPath = (card) => {
      const b = BEVEL;
      return `M${crisp(card.left + b)} ${crisp(card.top)}H${crisp(card.right - 1 - b)}L${crisp(card.right - 1)} ${crisp(card.top + b)}V${crisp(card.bottom - 1 - b)}L${crisp(card.right - 1 - b)} ${crisp(card.bottom - 1)}H${crisp(card.left + b)}L${crisp(card.left)} ${crisp(card.bottom - 1 - b)}V${crisp(card.top + b)}Z`;
    };

    /* The chip's pins, all the way round. */
    for (let x = die.left + BEVEL + 14; x < die.right - BEVEL - 8; x += PIN_PITCH) {
      addLine([[x, die.top - 7], [x, die.top]]);
      addLine([[x, die.bottom], [x, die.bottom + 7]]);
    }
    for (let y = die.top + BEVEL + 14; y < die.bottom - BEVEL - 8; y += PIN_PITCH) {
      addLine([[die.left - 7, y], [die.left, y]]);
      addLine([[die.right, y], [die.right + 7, y]]);
    }

    /* The signal path through the cards: lit up by the animation. */
    const jog = 28;
    const signal = (start, end) => {
      if (stacked) {
        const mid = (start[1] + end[1]) / 2;
        const reach = Math.abs(end[0] - start[0]) / 2;
        return [start, [start[0], mid - reach], [end[0], mid + reach], end];
      }
      const mid = (start[0] + end[0]) / 2;
      const reach = Math.abs(end[1] - start[1]) / 2;
      return [start, [mid - reach, start[1]], [mid + reach, end[1]], end];
    };
    const wired = (from, to) => [-2, -1, 0, 1, 2].map((i) => {
      const d = i * PIN_PITCH;
      return signal(from(d), to(d));
    });
    const inRoutes = stacked
      ? wired((d) => [raw.midX + jog + d, raw.bottom], (d) => [die.midX + d, die.top])
      : wired((d) => [raw.right, raw.midY + jog + d], (d) => [die.left, die.midY + d]);
    const outRoutes = stacked
      ? wired((d) => [die.midX + d, die.bottom], (d) => [app.midX + jog + d, app.top])
      : wired((d) => [die.right, die.midY + d], (d) => [app.left, app.midY + jog + d]);
    [...inRoutes, ...outRoutes].forEach(addLine);

    // Everything so far goes down as one layer, so all the lines match exactly.
    svg("path", { d: traces.join(""), class: "circuit__traces" }, board);
    vias.forEach(([cx, cy]) => svg("circle", { cx, cy, r: 2.5, class: "circuit__via" }, board));

    svg("path", { d: bevelPath(raw), class: "circuit__outline" }, board);
    chipOutline = svg("path", { d: bevelPath(die), class: "circuit__outline" }, board);
    svg("path", { d: bevelPath(strip), class: "circuit__outline" }, board);

    pulses.forEach(({ d, delay }) => {
      const pulse = svg("path", { d, class: "circuit__pulse", pathLength: 1000 }, board);
      pulse.style.animationDelay = `${-delay}s`;
    });

    const lit = (route) => {
      const d = toPath(route);
      const glow = svg("path", { d, class: "trace-lit", visibility: "hidden" }, board);
      const group = svg("g", { visibility: "hidden" }, board);
      svg("rect", { x: -9, y: -9, width: 18, height: 18, rx: 3, class: "packet-plate" }, group);
      const glyph = svg("text", { class: "packet" }, group);
      return { path: glow, group, glyph, length: glow.getTotalLength() };
    };
    inTraces = inRoutes.slice(1, 4).map(lit);
    outTraces = outRoutes.slice(1, 4).map(lit);
  }

  function drawPackets(traces, progress, glyphs) {
    traces.forEach((trace, index) => {
      const local = ease(clamp01(progress * 1.35 - index * 0.14));
      const active = progress > 0 && progress < 1 && local > 0 && local < 1;
      trace.path.setAttribute("visibility", active ? "visible" : "hidden");
      trace.group.setAttribute("visibility", active ? "visible" : "hidden");
      if (!active) return;
      const head = local * trace.length;
      const tail = Math.max(0, head - 90);
      trace.path.setAttribute("stroke-dasharray", `0 ${tail} ${head - tail} ${trace.length}`);
      const point = trace.path.getPointAtLength(head);
      trace.group.setAttribute("transform", `translate(${point.x} ${point.y})`);
      trace.glyph.textContent = glyphs[index % glyphs.length];
    });
  }

  /* ---------- The content of each stage ---------- */

  const sourceOf = (job) => job.raw?.source ?? job.source;

  function markupLines(job) {
    const source = sourceOf(job);
    return [
      source ? `<!-- ${source} -->` : "<!-- career site -->",
      `<h1>${job.title}</h1>`,
      `<span>${job.raw?.location ?? job.location}</span>`,
      "<p>░░░░ ░░░░░░░ ░░ ░░░░░ ░░░░░░",
      "░░░ ░░░░░░░░ ░░░░ ░░ ░░░░░░░</p>",
    ];
  }

  function jsonRows(job) {
    // salary strings are "$185k–$215k"; used only for the jobs that have no ai block.
    const [salaryMin] = job.salary.match(/\d+/g).map((value) => Number(value) * 1000);
    const skills = (job.ai?.ai_key_skills ?? job.skills).slice(0, 2);
    return [
      ["title", JSON.stringify(job.title)],
      ["organization", JSON.stringify(job.organization)],
      ["locations_derived", JSON.stringify([job.location])],
      ["ai_salary_min_value", String(job.ai?.ai_salary_min_value ?? salaryMin)],
      ["ai_experience_level", JSON.stringify(job.experience)],
      ["ai_work_arrangement", JSON.stringify(job.arrangement)],
      ["ai_key_skills", JSON.stringify(skills).replaceAll('","', '", "')],
    ];
  }

  function drawMarkup(job, progress) {
    const lines = markupLines(job);
    const total = lines.reduce((sum, line) => sum + line.length, 0);
    let left = Math.floor(total * progress);
    const typed = lines.map((line) => {
      const part = line.slice(0, Math.max(0, left));
      left -= line.length;
      return part;
    });
    const text = typed.join("\n");
    if (text !== shownMarkup) {
      shownMarkup = text;
      markupEl.textContent = text;
    }
  }

  // A rolling density field of characters: the unread web, before anything's been structured.
  function drawAscii(time) {
    const { cols, rows: rowCount } = asciiSize;
    const t = Math.floor(time / 90) * 0.09;
    let out = "";
    for (let y = 0; y < rowCount; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const wave = Math.sin(x * 0.22 + t * 1.3) + Math.sin(y * 0.5 - t) + Math.sin((x + y) * 0.13 + t * 0.7);
        const level = (wave + 3) / 6;
        const jitter = hash(x, y + Math.floor(t * 4)) * 0.16;
        out += RAMP[Math.floor(clamp01(level + jitter - 0.08) * (RAMP.length - 1))];
      }
      out += "\n";
    }
    asciiEl.textContent = out;
  }

  function drawJson(job, progress) {
    const data = jsonRows(job);
    const count = Math.ceil(progress * data.length * 1.02);
    const key = `${job.title}|${count}`;
    if (key === shownJson) return;
    shownJson = key;
    jsonEl.replaceChildren(...data.map(([name, value], index) => {
      const isAI = name.startsWith("ai_");
      const line = el("div", isAI && index < count ? "json-line json-line--ai" : "json-line");
      if (index < count) {
        line.append(el("span", "k", `"${name}"`), ": ", el("span", "v", value), index < data.length - 1 ? "," : "");
      }
      return line;
    }));
  }

  function buildRow(job) {
    const node = el("div", "row");
    const logo = el("img", "row__logo");
    logo.src = `assets/logos/companies/${job.logo}.jpg`;
    logo.alt = "";
    const title = el("div", "row__title", job.title);
    const meta = el("div", "row__meta", `${job.organization} · ${job.location}`);
    const text = el("div", "row__text");
    text.append(title, meta);
    const head = el("div", "row__head");
    head.append(logo, text);

    const arrangement = job.arrangement === "Remote Solely" ? "Remote" : job.arrangement;
    const values = el("div", "row__values");
    const chips = [`✦ ${job.salary}`, `${job.experience.replace("-", "–")} yrs`, arrangement].map((label) => el("b", "", label));
    values.append(...chips);
    node.append(head, values);

    const parts = [title, meta, ...chips].map((part) => ({ node: part, text: part.textContent }));
    return { node, parts };
  }

  // Characters resolve left to right, out of the noise.
  function decode(row, progress, time) {
    row.parts.forEach((part, partIndex) => {
      const reveal = Math.floor(clamp01(progress * 1.25 - partIndex * 0.05) * part.text.length);
      const bucket = Math.floor(time / 55);
      let out = part.text.slice(0, reveal);
      for (let i = reveal; i < part.text.length; i += 1) {
        out += part.text[i] === " " ? " " : NOISE[Math.floor(hash(i + partIndex * 40, bucket) * NOISE.length)];
      }
      part.node.textContent = out;
    });
  }

  function restoreRow(row) {
    row.parts.forEach((part) => {
      part.node.textContent = part.text;
    });
    row.node.classList.remove("is-decoding");
  }

  function placeRows() {
    const rowHeight = rows[0]?.node.offsetHeight ?? 87;
    rows.forEach((row, index) => {
      row.node.style.transform = `translateY(${index * rowHeight}px)`;
      row.node.style.opacity = index > 2 ? "0" : "1";
    });
  }

  function landRow(job) {
    const row = buildRow(job);
    row.node.classList.add("is-decoding");
    row.node.style.opacity = "0";
    list.prepend(row.node);
    row.node.style.transform = `translateY(-${row.node.offsetHeight}px)`;
    rows.forEach(restoreRow);
    rows.unshift(row);
    // Commit the starting position so the slide-in actually transitions.
    void row.node.offsetHeight;
    placeRows();
    rows.splice(4).forEach((old) => old.node.remove());
    return row;
  }

  /* ---------- The timeline ---------- */

  const jobAt = (cycle) => window.JOBS[((cycle % window.JOBS.length) + window.JOBS.length) % window.JOBS.length];

  function draw(time) {
    const cycle = Math.floor(time / CYCLE);
    const job = jobAt(cycle);
    let t = time - cycle * CYCLE;

    const phase = {};
    Object.entries(PHASES).forEach(([name, length]) => {
      phase[name] = clamp01(t / length);
      t -= length;
    });

    drawAscii(time);
    drawMarkup(job, ease(phase.raw));
    drawPackets(inTraces, phase.into, ["<", "/", "%"]);
    drawJson(phase.into >= 1 ? job : jobAt(cycle - 1), phase.into >= 1 ? phase.chip : 1);
    chipOutline.classList.toggle("is-working", phase.into >= 1 && phase.chip < 1);
    drawPackets(outTraces, phase.out, ["{", "✦", "}"]);

    // A new row lands the moment the output traces finish.
    if (phase.out >= 1 && landedCycle !== cycle) {
      landedCycle = cycle;
      landedRow = landRow(job);
    }
    if (landedRow && landedCycle === cycle) {
      if (phase.land < 0.72) {
        decode(landedRow, phase.land / 0.72, time);
      } else if (landedRow.node.classList.contains("is-decoding")) {
        restoreRow(landedRow);
      }
    }
  }

  function frame(now) {
    clock += Math.min(now - lastFrame, 50);
    lastFrame = now;
    draw(clock);
    requestAnimationFrame(frame);
  }

  function measureAscii() {
    const probe = getComputedStyle(asciiEl);
    const size = parseFloat(probe.fontSize) || 11.5;
    asciiSize = {
      cols: Math.ceil((asciiEl.clientWidth || 260) / (size * 0.62)) + 1,
      rows: Math.ceil((asciiEl.clientHeight || 136) / (parseFloat(probe.lineHeight) || 13)) + 1,
    };
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      buildBoard();
      measureAscii();
      placeRows();
    }, 120);
  });

  function init() {
    measureAscii();
    buildBoard();

    // The window opens with the last three jobs of the loop, so the first to land isn't a repeat.
    window.JOBS.slice(-3).reverse().forEach((job) => {
      const row = buildRow(job);
      list.append(row.node);
      rows.push(row);
    });
    placeRows();

    draw(clock);
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  (document.fonts?.ready ?? Promise.resolve()).then(init);
})();
