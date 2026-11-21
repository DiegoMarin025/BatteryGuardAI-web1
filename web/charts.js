function showTip(e, html){ const t = $("#tip"); t.innerHTML = html; t.style.opacity = 1; const w = t.offsetWidth; t.style.left = Math.min(e.clientX + 14, innerWidth - w - 12) + "px"; t.style.top = (e.clientY + 14) + "px"; }
const hideTip = () => { $("#tip").style.opacity = 0; };

function drawDonut(el, h, m, l){
  const tot = h + m + l || 1, R = 60, C = 2 * Math.PI * R, parts = [["Alto",h,"--high"],["Medio",m,"--med"],["Bajo",l,"--low"]];
  let off = 0, arcs = "";
  parts.forEach(([n, v, c]) => { const len = v / tot * C; if (v > 0) arcs += `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${css(c)}" stroke-width="16" stroke-dasharray="${Math.max(.5, len - 2).toFixed(2)} ${C}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 80 80)" data-a="arc" data-s="160"><title>${n}: ${nf(v)}</title></circle>`; off += len; });
  el.innerHTML = `<svg viewBox="0 0 160 160" role="img" aria-label="Alto ${h}, medio ${m}, bajo ${l}"><circle cx="80" cy="80" r="${R}" fill="none" stroke="${css("--surface-2")}" stroke-width="16"/>${arcs}
    <text data-a="fade" data-d="500" x="80" y="80" text-anchor="middle" font-family="Sora" font-size="26" font-weight="700" fill="${css("--ink")}">${nf(h)}</text><text x="80" y="99" text-anchor="middle" font-size="11" fill="${css("--muted")}">riesgo alto</text></svg>
    <div class="dl">${parts.map(([n, v, c]) => `<div><i style="background:var(${c})"></i><span>${n}</span><span><b>${nf(v)}</b><span class="p">${pct(v / tot, 1)}</span></span></div>`).join("")}</div>`;
}

function drawCurve(el, list, hiCount){
  const fails = list.filter(b => b.fail === 1).length;
  if (!fails){ el.innerHTML = '<div class="empty">El archivo no trae la columna battery_failure; la curva necesita fallas reales para medirse.</div>'; return; }
  const W = 600, H = 280, L = 40, R = 16, T = 12, B = 30, iw = W - L - R, ih = H - T - B, n = list.length, X = v => L + v * iw, Y = v => T + (1 - v) * ih;
  let cum = 0; const pts = [[0, 0]], step = Math.max(1, Math.floor(n / 260));
  list.forEach((b, i) => { if (b.fail === 1) cum++; if (i % step === 0 || i === n - 1) pts.push([(i + 1) / n, cum / fails]); });
  let capAt = 0; for (let i = 0; i < hiCount; i++) if (list[i].fail === 1) capAt++;
  const mx = hiCount / n, my = capAt / fails, d = pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
  const tk = [0, .25, .5, .75, 1], flip = X(mx) > W - 190, acc = css("--accent");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Inspeccionando ${pct(mx, 1)} de la flota se captura ${pct(my)} de las fallas">
   ${tk.map(t => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="${css("--border")}"/><text class="ax" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${t * 100}%</text><text class="ax" x="${X(t)}" y="${H - 8}" text-anchor="middle">${t * 100}%</text>`).join("")}
   <line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="${css("--border-2")}" stroke-dasharray="4 5"/>
   <text class="ax" x="${X(.66)}" y="${Y(.6)}" transform="rotate(-21 ${X(.66)} ${Y(.6)})">Al azar</text>
   <path data-a="fade" data-d="500" d="${d}L${X(1)} ${Y(0)}L${X(0)} ${Y(0)}Z" fill="${acc}" opacity=".1"/>
   <path data-a="draw" d="${d}" fill="none" stroke="${acc}" stroke-width="2.5" stroke-linejoin="round"/>
   <line x1="${X(mx)}" x2="${X(mx)}" y1="${Y(0)}" y2="${Y(my)}" stroke="${css("--ink")}" stroke-dasharray="2 4" opacity=".6"/>
   <circle data-a="pop" data-d="900" cx="${X(mx)}" cy="${Y(my)}" r="6" fill="${css("--ink")}" stroke="${acc}" stroke-width="3"/>
   <g data-a="fade" data-d="1000" transform="translate(${flip ? X(mx) - 176 : X(mx) + 14} ${Math.min(Y(my) + 12, H - B - 46)})"><rect width="164" height="40" rx="8" fill="${css("--surface")}" stroke="${css("--border-2")}"/><text x="12" y="17" font-size="11" fill="${css("--muted")}">Inspeccionar ${pct(mx, 1)}</text><text x="12" y="32" font-family="Sora" font-size="13" font-weight="700" fill="${css("--ink")}">encuentra ${pct(my)} de fallas</text></g>
  </svg>`;
}

function drawBrands(el, view){
  const by = {};
  view.forEach(b => { if (!b.brand) return; const o = by[b.brand] || (by[b.brand] = {n:0, h:0, m:0}); o.n++; const l = level(b.p); if (l === "high") o.h++; else if (l === "medium") o.m++; });
  const minN = view.length > 400 ? 20 : 1;
  const arr = Object.entries(by).filter(([, o]) => o.n >= minN).map(([k, o]) => ({k, n:o.n, h:o.h / o.n, m:o.m / o.n})).sort((a, b) => (b.h + b.m * .5) - (a.h + a.m * .5)).slice(0, 10);
  if (!arr.length){ el.innerHTML = '<div class="empty">Sin marcas para mostrar.</div>'; return; }
  const W = 600, H = 280, L = 40, R = 8, T = 12, B = 54, iw = W - L - R, ih = H - T - B;
  const top = Math.max(.05, Math.ceil(Math.max(...arr.map(a => a.h + a.m)) * 10) / 10), Y = v => T + ih - (v / top) * ih, bw = iw / arr.length, w = Math.min(30, bw * .5);
  let g = "";
  [0, top / 2, top].forEach(t => g += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="${css("--border")}"/><text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${nf(t * 100)}%</text>`);
  arr.forEach((a, i) => {
    const x = L + i * bw + (bw - w) / 2, yh = Y(a.h), ym = Y(a.h + a.m);
    g += `<g class="bb" data-t="${esc(a.k)}|${a.n}|${a.h}|${a.m}"><rect x="${x - 6}" y="${T}" width="${w + 12}" height="${ih}" fill="transparent"/>
      <g data-a="y" data-s="60"><rect x="${x}" y="${yh}" width="${w}" height="${Math.max(0, Y(0) - yh)}" rx="3" fill="${css("--high")}"/>
      <rect x="${x}" y="${ym}" width="${w}" height="${Math.max(0, yh - ym - 2)}" rx="3" fill="${css("--med")}"/></g>
      <text class="ax" x="${x + w / 2}" y="${H - B + 16}" text-anchor="end" transform="rotate(-32 ${x + w / 2} ${H - B + 16})">${esc(a.k)}</text></g>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Porcentaje de riesgo alto y medio por marca">${g}</svg>`;
  el.querySelectorAll(".bb").forEach(b => { b.addEventListener("mousemove", e => { const [k, n, h, m] = b.dataset.t.split("|"); showTip(e, `<b>${k}</b>${nf(+n)} baterías · alto ${pct(+h, 1)} · medio ${pct(+m, 1)}`); }); b.addEventListener("mouseleave", hideTip); });
}

let scGeo = null;
function drawScatter(cv, view, t = 1){
  if (!cv.offsetParent) return;
  const w = cv.parentElement.clientWidth, h = Math.round(Math.min(330, Math.max(240, w * .48))), dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + "px";
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  const L = 40, R = 10, T = 10, B = 34, xmin = 45, xmax = 100, ymin = -5, ymax = 90;
  const X = v => L + (v - xmin) / (xmax - xmin) * (w - L - R), Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * (h - T - B);
  ctx.font = "11px 'Plus Jakarta Sans', sans-serif"; ctx.fillStyle = css("--muted"); ctx.strokeStyle = css("--border"); ctx.lineWidth = 1;
  for (let v = 50; v <= 100; v += 10){ const x = X(v); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke(); ctx.textAlign = "center"; ctx.fillText(v + "%", x, h - B + 16); }
  for (let v = 0; v <= 90; v += 30){ const y = Y(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(v + "°", L - 6, y + 4); }
  ctx.textAlign = "right"; ctx.fillText("Salud de batería →", w - R, h - 2);
  ctx.save(); ctx.translate(11, T + 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "right"; ctx.fillText("Temp. máx. de celda →", 0, 0); ctx.restore();
  const pts = [], col = {high:css("--high"), medium:css("--med"), low:css("--cell")};
  ["low", "medium", "high"].forEach(lv => {
    ctx.fillStyle = col[lv]; ctx.globalAlpha = (lv === "low" ? .8 : .9) * t;
    view.forEach(b => { const hv = xv(b, "battery_health_percent"), tv = xv(b, "cell_temperature_max"); if (hv == null || tv == null || level(b.p) !== lv) return;
      const x = X(hv), y = Y(tv); ctx.beginPath(); ctx.arc(x, y + (1 - t) * 14, (lv === "low" ? 1.6 : 2.6) * (.4 + .6 * t), 0, 7); ctx.fill(); pts.push([x, y, b]); });
  });
  ctx.globalAlpha = 1; scGeo = pts;
}
function scatterHit(cv, e){
  if (!scGeo) return null; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 100; for (const p of scGeo){ const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd){ bd = d; best = p[2]; } } return best;
}

function drawRank(el, top){
  el.innerHTML = top.length ? top.map((b, i) => { const l = level(b.p); return `<button class="rank-row" data-id="${esc(b.id)}"><span class="i">${i + 1}</span><span class="mono">${esc(b.id)}</span><span class="rank-bar"><span data-a="x" style="width:${(b.p * 100).toFixed(1)}%;background:var(${lvVar(l)})"></span></span><span class="v">${pct(b.p, 1)}</span></button>`; }).join("") : '<div class="empty">Sin baterías.</div>';
}

function drawRadar(el, b){
  const ax = [["cell_temperature_max","Temp. máx."],["internal_resistance","Resistencia"],["BMS_warning_count","Alertas BMS"],["previous_faults","Fallas previas"],["abnormal_voltage_events","Voltaje anómalo"],["cycle_count","Ciclos"],["battery_health_percent","Desgaste"]];
  const W = 440, H = 320, cx = 220, cy = 160, R = 108, n = ax.length, ang = k => -Math.PI / 2 + k * 2 * Math.PI / n, P = (k, r) => [cx + Math.cos(ang(k)) * r, cy + Math.sin(ang(k)) * r];
  const vals = ax.map(([f]) => { const p = pctl(f, xv(b, f)); return p == null ? .5 : (f === "battery_health_percent" ? 1 - p : p); });
  let g = "";
  [.25, .5, .75, 1].forEach(t => g += `<polygon points="${ax.map((_, k) => P(k, R * t).join(",")).join(" ")}" fill="none" stroke="${css(t === .5 ? "--border-2" : "--border")}" ${t === .5 ? 'stroke-dasharray="4 4"' : ""}/>`);
  ax.forEach((a, k) => { const [x, y] = P(k, R), [lx, ly] = P(k, R + 18); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${css("--border")}"/><text class="ax" x="${lx}" y="${ly + 4}" text-anchor="${Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end"}">${a[1]}</text>`; });
  g += `<polygon points="${vals.map((v, k) => P(k, R * v).join(",")).join(" ")}" fill="${css("--accent")}" fill-opacity=".18" stroke="${css("--accent")}" stroke-width="2" stroke-linejoin="round" data-a="pop" style="transform-origin:${cx}px ${cy}px"/>`;
  vals.forEach((v, k) => { const [x, y] = P(k, R * v); g += `<circle data-a="pop" data-d="500" cx="${x}" cy="${y}" r="4.5" fill="${css(v >= .85 ? "--high" : v >= .65 ? "--med" : "--accent")}" stroke="${css("--surface")}" stroke-width="1.5"><title>${ax[k][1]}: P${Math.round(v * 100)}</title></circle>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Percentiles de desgaste de la batería frente a la flota">${g}</svg>`;
}
