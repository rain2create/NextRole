/** A damped surface, lit from the upper left. Pointer drags create soft folds, not radial rings. */
export function attachAmbientSurface(canvas: HTMLCanvasElement, motion: boolean) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const spacing = 14;
  let width = 0, height = 0, columns = 0, rows = 0;
  let displacement = new Float32Array(0), velocity = new Float32Array(0), nextVelocity = new Float32Array(0);
  let pixels: ImageData;
  let frame = 0, last = 0, enabled = false;
  let previous: { x: number; y: number; time: number } | null = null;
  const palette = getComputedStyle(document.documentElement);
  const readColor = (name: string, fallback: number[]) => {
    const value = palette.getPropertyValue(name).trim();
    return /^#[\da-f]{6}$/i.test(value) ? [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) : fallback;
  };
  const tint = readColor("--clay-a", [200, 233, 224]), shade = readColor("--accent-dark", [17, 99, 93]);
  const rgb = tint.map((value, index) => Math.round(value * .75 + shade[index] * .25));

  function stop() {
    cancelAnimationFrame(frame); frame = 0; last = 0; previous = null;
    displacement.fill(0); velocity.fill(0); nextVelocity.fill(0);
    ctx.clearRect(0, 0, columns, rows);
    canvas.dataset.state = "idle";
  }
  function resize() {
    stop();
    width = innerWidth; height = innerHeight;
    columns = Math.ceil(width / spacing) + 1; rows = Math.ceil(height / spacing) + 1;
    canvas.width = columns; canvas.height = rows;
    displacement = new Float32Array(columns * rows);
    velocity = new Float32Array(columns * rows);
    nextVelocity = new Float32Array(columns * rows);
    pixels = ctx.createImageData(columns, rows);
  }
  function refresh() {
    enabled = motion && fine.matches && !reduced.matches && !document.hidden;
    canvas.dataset.reactive = String(enabled);
    if (!enabled) stop();
  }
  function animate(time: number) {
    // Cap the timestep after a stalled frame so the cloth cannot explode.
    const dt = Math.min((last ? time - last : 16.67) / 16.67, 1.5);
    last = time;
    let energy = 0;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
      const i = y * columns + x, h = displacement[i];
      const neighbours = (displacement[i - 1] + displacement[i + 1] + displacement[i - columns] + displacement[i + columns]) * .25;
      // Strong damping yields a returning soft fold instead of an oscillating water wave.
      nextVelocity[i] = (velocity[i] + ((neighbours - h) * .16 - h * .045) * dt) * Math.pow(.60, dt);
    }
    for (let i = 0; i < displacement.length; i++) {
      velocity[i] = nextVelocity[i];
      displacement[i] = Math.max(-28, Math.min(28, displacement[i] + velocity[i] * dt));
      energy = Math.max(energy, Math.abs(displacement[i]) + Math.abs(velocity[i]));
    }
    if (energy < .025) { stop(); return; }
    pixels.data.fill(0);
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
      const i = y * columns + x;
      const light = (displacement[i + 1] - displacement[i - 1]) * .7 + (displacement[i + columns] - displacement[i - columns]) * .9;
      const alpha = Math.min(light > 0 ? .65 : .18, Math.abs(light) * .11);
      const p = i * 4;
      pixels.data[p] = light > 0 ? 255 : rgb[0];
      pixels.data[p + 1] = light > 0 ? 255 : rgb[1];
      pixels.data[p + 2] = light > 0 ? 255 : rgb[2];
      pixels.data[p + 3] = Math.round(alpha * 255);
    }
    ctx.putImageData(pixels, 0, 0);
    frame = requestAnimationFrame(animate);
  }
  function disturb(x: number, y: number, dx: number, dy: number, strength: number) {
    const radius = 120, length = Math.hypot(dx, dy);
    const ux = dx / length, uy = dy / length;
    for (let row = Math.max(1, Math.floor((y - radius) / spacing)); row < Math.min(rows - 1, (y + radius) / spacing); row++) {
      for (let col = Math.max(1, Math.floor((x - radius) / spacing)); col < Math.min(columns - 1, (x + radius) / spacing); col++) {
        const rx = col * spacing - x, ry = row * spacing - y;
        const along = (rx * ux + ry * uy) / radius, across = (-rx * uy + ry * ux) / radius;
        // A directional ridge/trough follows the swept path; no circle or cursor object is drawn.
        const fold = along * Math.exp(-5 * along * along - 3 * across * across);
        velocity[row * columns + col] += fold * strength * 18;
      }
    }
  }
  function move(event: PointerEvent) {
    if (!enabled || event.pointerType !== "mouse") return;
    const target = event.target;
    // Only the exposed page background can be brushed. Cards, hero copy and controls stay still.
    const background = target instanceof Element && target.matches("html, body, main.app-shell, div, [data-ambient-zone]") &&
      !target.closest("section, article, header, footer, nav, form, details, a, button, input, textarea, select, label, dialog, .workspace-heading, .surface, [role='tablist'], [role='group'], [role='button'], [role='dialog']");
    if (!background) { previous = null; return; }
    const point = { x: event.clientX, y: event.clientY, time: performance.now() };
    if (previous && point.time - previous.time < 160) {
      const dx = point.x - previous.x, dy = point.y - previous.y, distance = Math.hypot(dx, dy);
      if (distance > .5) {
        const samples = Math.min(12, Math.ceil(distance / 18));
        const strength = Math.min(distance / 28, 1.5) / samples;
        for (let step = 1; step <= samples; step++) disturb(previous.x + dx * step / samples, previous.y + dy * step / samples, dx, dy, strength);
        if (!frame) { canvas.dataset.state = "active"; frame = requestAnimationFrame(animate); }
      }
    }
    previous = point;
  }
  const leave = (event: PointerEvent) => { if (event.relatedTarget === null) previous = null; };
  const scroll = () => { previous = null; };
  resize(); refresh();
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerout", leave);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("blur", stop);
  document.addEventListener("visibilitychange", refresh);
  fine.addEventListener("change", refresh);
  reduced.addEventListener("change", refresh);
  return () => {
    stop(); canvas.dataset.reactive = "false";
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerout", leave);
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("blur", stop);
    document.removeEventListener("visibilitychange", refresh);
    fine.removeEventListener("change", refresh);
    reduced.removeEventListener("change", refresh);
  };
}
