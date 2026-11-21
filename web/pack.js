const LABEL = {
  battery_health_percent:["Salud de batería","%"], state_of_health:["Estado de salud (SoH)","%"],
  cell_temperature_max:["Temp. máx. de celda","°C"], cell_temperature_avg:["Temp. prom. de celda","°C"],
  internal_resistance:["Resistencia interna","Ω"], BMS_warning_count:["Alertas del BMS",""], previous_faults:["Fallas previas",""],
  cycle_count:["Ciclos acumulados",""], vehicle_age_years:["Antigüedad","años"], abnormal_voltage_events:["Eventos de voltaje anómalo",""],
  temperature_variance:["Varianza térmica",""], charge_efficiency:["Eficiencia de carga","%"], discharge_efficiency:["Eficiencia de descarga","%"],
  fast_charge_ratio:["Proporción de carga rápida",""], slow_charge_ratio:["Proporción de carga lenta",""], cooling_system_health:["Salud del enfriamiento","%"],
  manufacturing_year:["Año de fabricación",""], battery_capacity_kwh:["Capacidad","kWh"], odometer_km:["Odómetro","km"],
  state_of_charge:["Estado de carga","%"], depth_of_discharge:["Profundidad de descarga","%"], cell_voltage_avg:["Voltaje prom. de celda","V"],
  cell_voltage_std:["Desviación de voltaje","V"], pack_voltage:["Voltaje del pack","V"], remaining_capacity:["Capacidad restante",""],
  charging_cycles_last_month:["Cargas del último mes",""], average_charge_power_kw:["Potencia de carga prom.","kW"],
  average_charging_time:["Tiempo de carga prom.","min"], overnight_charging_ratio:["Carga nocturna",""], home_charging_ratio:["Carga en casa",""],
  charging_interruptions:["Interrupciones de carga",""], overcharge_events:["Eventos de sobrecarga",""], average_speed:["Velocidad prom.","km/h"],
  average_trip_distance:["Distancia por viaje","km"], aggressive_acceleration_score:["Aceleración agresiva",""], hard_braking_score:["Frenado brusco",""],
  regenerative_braking_usage:["Frenado regenerativo",""], highway_driving_ratio:["Manejo en carretera",""], city_driving_ratio:["Manejo en ciudad",""],
  daily_distance:["Distancia diaria","km"], average_ambient_temperature:["Temp. ambiente prom.","°C"], maximum_temperature:["Temp. ambiente máx.","°C"],
  minimum_temperature:["Temp. ambiente mín.","°C"], humidity:["Humedad","%"], altitude:["Altitud","m"], dust_exposure:["Exposición a polvo",""],
  last_service_days:["Días desde el último servicio",""], firmware_updates:["Actualizaciones de firmware",""], maintenance_score:["Puntaje de mantenimiento",""],
  voltage_imbalance:["Desbalance de voltaje",""], sensor_fault_count:["Fallas de sensor",""], charging_quality_score:["Calidad de carga",""],
  driving_stress_score:["Estrés de manejo",""], vehicle_brand:["Marca",""], vehicle_model:["Modelo",""], vehicle_type:["Tipo de vehículo",""],
  battery_manufacturer:["Fabricante de batería",""], battery_chemistry:["Química",""], drive_type:["Tracción",""], fleet_or_private:["Tipo de flota",""],
  terrain_type:["Terreno",""]
};
const lab = f => (LABEL[f] || [f.replace(/_/g, " ")])[0];
const $ = s => document.querySelector(s);
const nf = (v, d = 0) => v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString("es-MX", {minimumFractionDigits:d, maximumFractionDigits:d});
const pct = (v, d = 0) => v == null ? "—" : (d && v * 100 >= 100 - Math.pow(10, -d) / 2 ? "> " + nf(100 - Math.pow(10, -d), d) : nf(v * 100, d)) + " %";
const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const median = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };
const FLEET_ES = {Fleet:"Flotilla", Private:"Privado"};
const LV = {high:"Alto", medium:"Medio", low:"Bajo"};
const lvVar = l => l === "high" ? "--high" : l === "medium" ? "--med" : "--low";
const lvCls = l => l === "high" ? "t-high" : l === "medium" ? "t-med" : "t-low";
const pVar = v => v == null ? "--muted" : v >= .85 ? "--high" : v >= .65 ? "--med" : "--low";
const hVar = h => h == null ? "--muted" : h < 65 ? "--high" : h < 78 ? "--med" : "--low";
const low1 = t => t.charAt(0).toLowerCase() + t.slice(1);
function fmtVal(f, v){
  if (v == null || v === "") return "—"; if (typeof v === "string") return esc(v);
  const u = (LABEL[f] || ["", ""])[1];
  const d = /resistance|voltage_std/.test(f) ? 3 : /ratio/.test(f) ? 2 : Number.isInteger(v) ? 0 : 1;
  return nf(v, d) + (u ? (u === "%" ? " %" : " " + u) : "");
}

/* Estado */
const S = {thr:.19, med:.07, rec:.19, q:"", brand:"", model:"", ft:"", sort:"p", dir:-1, shown:15, sel:null, spot:0, src:"ref"};
let VARS = [], VI = {}, SORTED = [], lifeMed = null;
const level = p => p >= S.thr ? "high" : p >= Math.min(S.med, S.thr) ? "medium" : "low";
const xv = (b, f) => VI[f] == null ? null : b.x[VI[f]];
function prepStats(fleet){
  SORTED = VARS.map((f, i) => fleet.map(b => b.x[i]).filter(v => v != null).sort((a, b) => a - b));
  lifeMed = median(fleet.map(b => b.life));
}
function pctl(f, v){
  const a = SORTED[VI[f]]; if (v == null || !a || !a.length) return null;
  let lo = 0, hi = a.length; while (lo < hi){ const m = (lo + hi) >> 1; if (a[m] <= v) lo = m + 1; else hi = m; }
  return lo / a.length;
}
const fleetMedian = f => { const a = SORTED[VI[f]]; return a && a.length ? a[a.length >> 1] : null; };

/* Pack de batería */
function packSVG(b){
  const s = 27, H = 1.25, L = 10, D = 6, cx = 262, cy = 96;
  const P = (x, y, z) => [cx + (x - y) * 0.866 * s, cy + (x + y) * 0.5 * s - z * s];
  const pt = a => a.map(v => v.toFixed(1)).join(",");
  const poly = (pts, fill, extra = "") => `<polygon points="${pts.map(pt).join(" ")}" fill="${fill}" ${extra}/>`;
  const h = xv(b, "battery_health_percent"), hp = h == null ? .8 : h / 100;
  const tP = pctl("cell_temperature_max", xv(b, "cell_temperature_max"));
  const alerts = (xv(b, "BMS_warning_count") ?? 0) + (xv(b, "previous_faults") ?? 0);
  const riskC = css(lvVar(level(b.p))), hC = css(hVar(h)), tC = css(pVar(tP));
  const bC = css(alerts >= 4 ? "--high" : alerts >= 2 ? "--med" : "--low");
  const edge = css("--pack-edge"), top = css("--pack-top"), fa = css("--pack-a"), fb = css("--pack-b"), cell = css("--cell");
  const g = P(L/2, D/2, 0);
  let o = `<defs><clipPath id="clip-${b.id}">${poly([P(0,0,H+.6),P(L,0,H+.6),P(L,D,H+.6),P(0,D,H+.6)],"#000")}</clipPath></defs><ellipse class="glow" cx="${g[0]}" cy="${g[1] + 22}" rx="215" ry="52" fill="${riskC}" opacity=".14"/><g class="pack-body">`;
  o += poly([P(0,D,0),P(L,D,0),P(L,D,H),P(0,D,H)], fa, `stroke="${edge}"`);
  o += poly([P(L,0,0),P(L,D,0),P(L,D,H),P(L,0,H)], fb, `stroke="${edge}"`);
  o += poly([P(0,0,H),P(L,0,H),P(L,D,H),P(0,D,H)], top, `stroke="${edge}" stroke-width="1.2"`);
  for (let k = 0; k < 9; k++){ const a = P(.5 + k * .55, D, H * .25), c = P(.5 + k * .55, D, H * .75); o += `<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" stroke="${edge}" stroke-width="2" stroke-linecap="round"/>`; }
  const cool = []; for (let k = 0; k <= 26; k++){ const y = .4 + k * (D - .8) / 26, z = H * .5 + Math.sin(k * 1.1) * H * .22; cool.push(P(L, y, z)); }
  o += `<polyline points="${cool.map(pt).join(" ")}" fill="none" stroke="${tC}" stroke-width="2.6" stroke-linecap="round" opacity=".35"/><polyline class="cool-line" points="${cool.map(pt).join(" ")}" fill="none" stroke="${tC}" stroke-width="2.6" stroke-linecap="round"/>`;
  const cols = 4, rows = 3, mw = 1.75, md = 1.6, gx = .25, gy = .25, mh = .42, x0 = .35, y0 = .45;
  const lit = Math.round(hp * cols * rows);
  const mods = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) mods.push({c, r});
  mods.sort((a, b) => (a.c + a.r) - (b.c + b.r) || a.r - b.r);
  mods.forEach(m => {
    const idx = m.c * rows + m.r, on = idx < lit, col = on ? hC : cell;
    const x = x0 + m.c * (mw + gx), y = y0 + m.r * (md + gy), z = H;
    o += `<g class="mod" style="--m:${idx}">`;
    o += poly([P(x,y+md,z),P(x+mw,y+md,z),P(x+mw,y+md,z+mh),P(x,y+md,z+mh)], col, `opacity="${on ? .62 : .9}"`);
    o += poly([P(x+mw,y,z),P(x+mw,y+md,z),P(x+mw,y+md,z+mh),P(x+mw,y,z+mh)], col, `opacity="${on ? .42 : .75}"`);
    o += poly([P(x,y,z+mh),P(x+mw,y,z+mh),P(x+mw,y+md,z+mh),P(x,y+md,z+mh)], col, `stroke="${edge}" stroke-width=".6"`);
    o += `</g>`;
  });
  const bx = 8.55, by = .5, bw = 1.1, bd = 2.2, bh = .55;
  o += poly([P(bx,by+bd,H),P(bx+bw,by+bd,H),P(bx+bw,by+bd,H+bh),P(bx,by+bd,H+bh)], fa, `stroke="${edge}"`);
  o += poly([P(bx+bw,by,H),P(bx+bw,by+bd,H),P(bx+bw,by+bd,H+bh),P(bx+bw,by,H+bh)], fb, `stroke="${edge}"`);
  o += poly([P(bx,by,H+bh),P(bx+bw,by,H+bh),P(bx+bw,by+bd,H+bh),P(bx,by+bd,H+bh)], top, `stroke="${edge}"`);
  const led = P(bx + bw/2, by + bd/2, H + bh);
  o += `<circle class="led" cx="${led[0]}" cy="${led[1]}" r="4.5" fill="${bC}"/>`;
  const term = (x, y, c) => { const b0 = P(x, y, H), t0 = P(x, y, H + .55); return `<line x1="${b0[0]}" y1="${b0[1]}" x2="${t0[0]}" y2="${t0[1]}" stroke="${c}" stroke-width="11" stroke-linecap="round"/><ellipse cx="${t0[0]}" cy="${t0[1]}" rx="5.5" ry="3.2" fill="#fff" fill-opacity=".6"/>`; };
  o += term(9.1, 3.55, "#ef4444") + term(9.1, 4.95, css("--muted"));
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches){
    const zz = H + mh + .02, sb = [P(0,0,zz),P(.7,0,zz),P(.7,D,zz),P(0,D,zz)], dx = (L - .7) * .866 * s, dy = (L - .7) * .5 * s;
    o += `<g clip-path="url(#clip-${b.id})"><polygon points="${sb.map(pt).join(" ")}" fill="${css("--accent")}" opacity=".22"><animateTransform attributeName="transform" type="translate" values="0 0;${dx.toFixed(1)} ${dy.toFixed(1)};0 0" dur="6s" repeatCount="indefinite"/></polygon></g>`;
  }
  o += `</g>`;
  const anchors = {
    risk: P(.25, .15, H + .1), modules: P(3.2, 2.4, H + mh), front: P(3.5, D, H * .35),
    cooling: P(L, D * .55, H * .5), terminals: P(9.1, 4.2, H + .55), bms: P(bx + bw/2, by + .3, H + bh)
  };
  return {svg: `<svg class="pack-svg" viewBox="100 28 430 326" role="img" aria-label="Pack de batería ${esc(b.id)}: ${lit} de 12 módulos encendidos según su salud">${o}</svg>`, anchors, lit};
}

function heroCards(b){
  const h = xv(b, "battery_health_percent"), lv = level(b.p);
  const tv = xv(b, "cell_temperature_max"), tP = pctl("cell_temperature_max", tv);
  const rv = xv(b, "internal_resistance"), rP = pctl("internal_resistance", rv);
  const bms = xv(b, "BMS_warning_count"), pf = xv(b, "previous_faults"), al = (bms ?? 0) + (pf ?? 0);
  const word = v => v == null ? "Sin dato" : v >= .85 ? "Muy alto" : v >= .65 ? "Elevado" : "Normal";
  return {
    left: [
      {k:"risk", lb:"Probabilidad de falla (modelo)", vl:pct(b.p, 1), st:`Riesgo ${LV[lv].toLowerCase()} · umbral ${nf(S.thr * 100)} %`, bar:b.p, c:lvVar(lv)},
      {k:"modules", lb:"Salud de batería", vl:h == null ? "—" : nf(h, 1) + "<small>%</small>", st:`Capacidad disponible · flota ${nf(fleetMedian("battery_health_percent"), 1)} %`, bar:h == null ? 0 : h / 100, c:hVar(h)},
      {k:"front", lb:"Vida útil restante (modelo)", vl:b.life == null ? "—" : nf(b.life) + "<small>ciclos</small>", st:lifeMed == null ? "Sin estimación" : `Mediana de la flota ${nf(lifeMed)}`, bar:b.life == null ? 0 : Math.min(1, b.life / 12870), c:"--accent"}
    ],
    right: [
      {k:"cooling", lb:"Temperatura máx. de celda", vl:tv == null ? "—" : nf(tv, 1) + "<small>°C</small>", st:tP == null ? "Sin dato" : `${word(tP)} · P${Math.round(tP * 100)} de la flota`, bar:tP ?? 0, c:pVar(tP)},
      {k:"terminals", lb:"Resistencia interna", vl:rv == null ? "—" : nf(rv, 3) + "<small>Ω</small>", st:rP == null ? "Sin dato" : `${word(rP)} · P${Math.round(rP * 100)} de la flota`, bar:rP ?? 0, c:pVar(rP)},
      {k:"bms", lb:"Alertas BMS y fallas previas", vl:`${nf(bms ?? 0)}<small>alertas</small> ${nf(pf ?? 0)}<small>fallas</small>`, st:"Historial del sistema de gestión", bar:Math.min(1, al / 8), c:al >= 4 ? "--high" : al >= 2 ? "--med" : "--low"}
    ]
  };
}

function renderHero(root, b, animate){
  const pk = packSVG(b), d = heroCards(b);
  const card = o => `<article class="callout" data-anchor="${o.k}" style="--c:var(${o.c})"><div class="lb">${o.lb}</div><div class="vl">${o.vl}</div><div class="st">${o.st}</div><div class="bar"><span style="width:${(o.bar * 100).toFixed(1)}%"></span></div></article>`;
  root.innerHTML = `<div class="callouts left">${d.left.map(card).join("")}</div>
    <div class="pack-stage">${pk.svg}<div class="pack-cap">${pk.lit} de 12 módulos encendidos = salud · línea lateral = temperatura · LED = alertas del BMS</div></div>
    <div class="callouts right">${d.right.map(card).join("")}</div>
    <svg class="hero-lines" aria-hidden="true"></svg>`;
  root._anchors = pk.anchors;
  root.classList.remove("pk-in");
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches){ void root.offsetWidth; root.classList.add("pk-in"); }
  requestAnimationFrame(() => drawLines(root));
}

function drawLines(root){
  const ov = root.querySelector(".hero-lines"); if (!ov || getComputedStyle(ov).display === "none") return;
  const svg = root.querySelector(".pack-svg"), ctm = svg && svg.getScreenCTM(); if (!ctm) return;
  const rr = root.getBoundingClientRect(); let out = "";
  root.querySelectorAll(".callout").forEach(c => {
    const a = root._anchors[c.dataset.anchor]; if (!a) return;
    const ap = new DOMPoint(a[0], a[1]).matrixTransform(ctm), cr = c.getBoundingClientRect(), left = !!c.closest(".left");
    const sx = (left ? cr.right : cr.left) - rr.left, sy = cr.top + cr.height / 2 - rr.top, ax = ap.x - rr.left, ay = ap.y - rr.top;
    const mx = sx + (left ? 20 : -20), col = getComputedStyle(c).getPropertyValue("--c").trim();
    out += `<path d="M${sx} ${sy} H${mx} L${ax} ${ay}" stroke="${col}" opacity=".8"/><circle class="ping" cx="${ax}" cy="${ay}" r="4" fill="${col}"/><circle cx="${ax}" cy="${ay}" r="4" fill="${col}" stroke="${css("--surface")}" stroke-width="2"/>`;
  });
  ov.innerHTML = out;
}
