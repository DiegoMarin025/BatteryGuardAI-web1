const APP_VERSION = "1.0.0";
const ACTION = {
  battery_health_percent:"Medir la capacidad real con una prueba de descarga controlada.",
  state_of_health:"Confirmar el estado de salud (SoH) con el escáner del BMS.",
  cell_temperature_max:"Revisar sensores térmicos y puntos calientes del pack.",
  cell_temperature_avg:"Verificar la temperatura de operación y la ventilación del pack.",
  temperature_variance:"Comparar temperaturas entre módulos para ubicar celdas desbalanceadas.",
  internal_resistance:"Medir la resistencia interna por módulo y revisar conexiones.",
  BMS_warning_count:"Descargar el historial de alertas del BMS y revisar los códigos.",
  previous_faults:"Consultar las órdenes de trabajo anteriores de esta batería.",
  abnormal_voltage_events:"Verificar el balanceo de celdas y el voltaje por módulo.",
  voltage_imbalance:"Revisar el balanceo de celdas.",
  cycle_count:"Evaluar el plan de reemplazo según los ciclos acumulados.",
  vehicle_age_years:"Considerar la antigüedad del pack en el plan de reemplazo.",
  manufacturing_year:"Considerar la antigüedad del pack en el plan de reemplazo.",
  charge_efficiency:"Revisar el cargador y la eficiencia de carga.",
  fast_charge_ratio:"Reducir la carga rápida y preferir carga lenta nocturna.",
  overcharge_events:"Revisar la configuración de carga para evitar sobrecargas.",
  cooling_system_health:"Inspeccionar refrigerante, bomba y ventiladores.",
  sensor_fault_count:"Revisar y calibrar los sensores del pack."
};
const action = f => ACTION[f] || `Revisar ${low1(lab(f))} durante la inspección.`;
const SIMF = ["battery_health_percent","cell_temperature_max","internal_resistance","BMS_warning_count","previous_faults","abnormal_voltage_events","fast_charge_ratio","cycle_count"];
const ICO = {
  alert:'<path d="M10.3 3.8 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3.5h.01"/>',
  pack:'<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M21.5 10.5v3"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  cycle:'<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/>', chart:'<path d="M4 19V5m0 14h16"/><path d="m7 15 4-5 3 3 5-7"/>'
};
let fleet = [], view = [], sortedP = [], current = "fleet", MODEL = null, source = "", pred = null;

function say(t){ const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(say.t); say.t = setTimeout(() => el.classList.remove("show"), 2800); }
async function api(path, opts){
  const r = await fetch(path, opts); let j = {};
  try { j = await r.json(); } catch (e) { throw new Error("Respuesta inválida del servidor."); }
  if (!r.ok && !j.errores) throw new Error(j.error || `Error ${r.status}`);
  return j;
}
function setStatus(ok, text){ const s = $("#status"); s.className = "status " + (ok ? "on" : "off"); s.querySelector("span").textContent = text; }

/* Tema */
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>';
function setThemeIcon(){ const dark = document.documentElement.dataset.theme !== "light"; $("#themeIco").innerHTML = dark ? SUN : MOON; $("#themeBtn").setAttribute("aria-label", dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"); }
$("#themeBtn").addEventListener("click", () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; try { localStorage.setItem("bg-theme", r.dataset.theme); } catch (e) {} setThemeIcon(); renderScreen(false); });

/* Navegación */
function go(name, scrollTo){
  if (name === "model") name = "fleet";
  if (name === "detail" && !S.sel) S.sel = sortedP[0] || fleet[0];
  current = name;
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + name));
  document.querySelectorAll(".nav button").forEach(b => b.setAttribute("aria-current", b.dataset.go === name ? "page" : "false"));
  history.replaceState(null, "", "#" + name); window.scrollTo({top:0});
  const scr = $("#screen-" + name); scr.classList.remove("enter"); void scr.offsetWidth; scr.classList.add("enter");
  renderScreen(true);
  if (scrollTo) setTimeout(() => $(scrollTo).scrollIntoView({behavior: MOTION ? "smooth" : "auto"}), 60);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b){ e.preventDefault(); go(b.dataset.go); } });
function renderScreen(animate){ if (!fleet.length && current !== "data") return; if (current === "fleet") renderFleet({animate, hero:animate}); else if (current === "detail") renderDetail(animate); else if (current === "data") revealScreen($("#screen-data"), false); }
let rzT; addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (current === "fleet"){ drawScatter($("#scatter"), view); drawLines($("#fleetHero")); drawCurve($("#curve"), sortedP, sortedP.filter(b => level(b.p) === "high").length); } if (current === "detail") drawLines($("#detailHero")); }, 150); });

/* Flota: datos */
function loadFleet(p, src){
  VARS = p.variables; VI = Object.fromEntries(VARS.map((f, i) => [f, i]));
  fleet = p.baterias.map(r => ({id:r[0], vehicle:r[1], brand:r[2], model:r[3], fleet:r[4], chem:r[5], p:r[6] ?? 0, life:r[7], fail:r[8], x:r[9]}));
  let nm = p.nombre; try { nm = decodeURIComponent(nm); } catch (e) {}
  source = nm; S.src = src; S.sel = null; S.spot = 0; S.page = 1;
  prepStats(fleet); fillFilters(); applyFilters();
}
function fillFilters(){
  const brands = [...new Set(fleet.map(b => b.brand).filter(Boolean))].sort();
  $("#fBrand").innerHTML = '<option value="">Todas las marcas</option>' + brands.map(b => `<option>${esc(b)}</option>`).join("");
  if (!brands.includes(S.brand)) S.brand = ""; $("#fBrand").value = S.brand; fillModels();
}
function fillModels(){
  const models = [...new Set(fleet.filter(b => !S.brand || b.brand === S.brand).map(b => b.model).filter(Boolean))].sort();
  $("#fModel").innerHTML = '<option value="">Todos los modelos</option>' + models.map(m => `<option>${esc(m)}</option>`).join("");
  if (!models.includes(S.model)) S.model = ""; $("#fModel").value = S.model;
}
function applyFilters(){
  const q = S.q.toLowerCase();
  view = fleet.filter(b => (!S.brand || b.brand === S.brand) && (!S.model || b.model === S.model) && (!S.ft || b.fleet === S.ft) && (!q || b.id.toLowerCase().includes(q) || (b.vehicle || "").toLowerCase().includes(q)));
  sortedP = [...view].sort((a, b) => b.p - a.p);
}

/* Flota: vista */
function kpi(el, ico, label, val, sub){ el.innerHTML = `<div class="kpi-top">${label}<span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICO[ico]}</svg></span></div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div>`; }
function renderFleet(opt = {}){
  const n = view.length, hi = sortedP.filter(b => level(b.p) === "high"), med = sortedP.filter(b => level(b.p) === "medium");
  const lab_ = view.filter(b => b.fail != null), fails = lab_.filter(b => b.fail === 1);
  const caught = hi.filter(b => b.fail === 1).length, falseA = hi.filter(b => b.fail === 0).length, capR = fails.length ? caught / fails.length : null;
  const hs = view.map(b => xv(b, "battery_health_percent")).filter(v => v != null), hAvg = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null;
  const vLife = median(view.map(b => b.life)), thrTxt = nf(S.thr * 100) + " %";

  $("#finding").innerHTML = n ? `${esc(source)} · ${nf(fleet.length)} baterías puntuadas por el modelo. Con el umbral de ${thrTxt}, revisar <strong>${nf(hi.length)} baterías</strong> (${pct(hi.length / n, 1)} de la flota) ` + (capR != null ? `encuentra el <strong>${pct(capR)} de las fallas</strong> registradas.` : "cubre todas las de riesgo alto.") : "No hay baterías con estos filtros.";
  kpi($("#k1"), "alert", "Riesgo alto", nf(hi.length), `<span class="chip-s">${pct(n ? hi.length / n : 0, 1)}</span>supera el umbral de ${thrTxt}`);
  kpi($("#k2"), "target", "Fallas detectadas", capR == null ? "—" : nf(capR * 100) + "<small>%</small>", capR == null ? "El archivo no trae fallas reales" : `<span class="chip-s">${nf(caught)} de ${nf(fails.length)}</span>fallas del historial`);
  kpi($("#k3"), "pack", "Salud promedio", nf(hAvg, 1) + "<small>%</small>", `<span class="chip-s">${nf(med.length)}</span>baterías en riesgo medio`);
  kpi($("#k4"), "cycle", "Vida útil mediana", vLife == null ? "—" : nf(vLife) + "<small>ciclos</small>", `<span class="chip-s">${nf(n)}</span>baterías evaluadas`);

  const r = $("#threshold"); r.value = Math.round(S.thr * 100); r.style.setProperty("--fill", ((S.thr * 100 - 5) / 55 * 100) + "%");
  $("#thrOut").textContent = thrTxt; $("#thrRec").textContent = nf(S.rec * 100) + " %";
  $("#medTxt").textContent = $("#medTxt2").textContent = nf(Math.min(S.med, S.thr) * 100, 1) + " %";
  $("#sInspect").innerHTML = `${nf(hi.length)}<small>${pct(n ? hi.length / n : 0, 1)}</small>`;
  $("#sCapture").innerHTML = capR == null ? "—" : `${pct(capR)}<small>${nf(caught)}/${nf(fails.length)}</small>`;
  $("#sFalse").textContent = lab_.length ? nf(falseA) : "—";
  $("#sMissed").textContent = lab_.length ? nf(fails.length - caught) : "—";
  $("#costNote").textContent = lab_.length ? `Costo estimado con este umbral: ${nf(fails.length - caught)} fallas no detectadas × $45,000 + ${nf(falseA)} inspecciones de más × $1,500 = $${nf((fails.length - caught) * 45000 + falseA * 1500)}.` : "El archivo no trae la columna battery_failure, así que no se puede medir cuántas fallas captura.";

  const top = sortedP.slice(0, 5); if (S.spot >= top.length) S.spot = 0;
  $("#spotSeg").innerHTML = top.map((b, i) => `<button aria-pressed="${i === S.spot}" data-spot="${i}" aria-label="Prioridad ${i + 1}: ${esc(b.id)}">#${i + 1}</button>`).join("");
  const sb = top[S.spot];
  if (sb){ renderHero($("#fleetHero"), sb, opt.hero); $("#heroLead").innerHTML = `<span class="mono">${esc(sb.id)}</span> · ${esc(sb.brand || "—")} ${esc(sb.model || "")}. Prioridad #${S.spot + 1} según el modelo.`; }
  else { $("#fleetHero").innerHTML = '<div class="empty" style="grid-column:1/-1">Sin baterías con estos filtros.</div>'; $("#heroLead").textContent = ""; }

  drawDonut($("#donut"), hi.length, med.length, n - hi.length - med.length);
  drawCurve($("#curve"), sortedP, hi.length);
  drawBrands($("#brands"), view);
  if (!(opt.animate && MOTION)) drawScatter($("#scatter"), view);
  drawRank($("#rank"), sortedP.slice(0, 15));
  drawTable();
  revealScreen($("#screen-fleet"), !!opt.animate);
}
$("#spotSeg").addEventListener("click", e => { const b = e.target.closest("[data-spot]"); if (!b) return; S.spot = +b.dataset.spot; renderFleet({hero:true}); });
$("#spotOpen").addEventListener("click", () => openDetail(sortedP[S.spot]));
$("#rank").addEventListener("click", e => { const r = e.target.closest(".rank-row"); if (r) openDetail(fleet.find(b => b.id === r.dataset.id)); });
const scv = $("#scatter");
scv.addEventListener("mousemove", e => { const b = scatterHit(scv, e); if (!b) return hideTip(); const l = level(b.p); showTip(e, `<b>${esc(b.id)}</b>${esc(b.brand || "")} ${esc(b.model || "")}<br>Salud ${nf(xv(b, "battery_health_percent"), 1)} % · ${nf(xv(b, "cell_temperature_max"), 1)} °C<br><span class="${lvCls(l)}">${pct(b.p, 1)} · ${LV[l]}</span>`); });
scv.addEventListener("mouseleave", hideTip);
scv.addEventListener("click", e => { const b = scatterHit(scv, e); if (b){ hideTip(); openDetail(b); } });

function drawTable(){
  const key = {id:b => b.id, p:b => b.p, health:b => xv(b, "battery_health_percent") ?? -1, life:b => b.life ?? -1}[S.sort];
  const rows = [...view].sort((a, b) => { const A = key(a), B = key(b); return (A > B ? 1 : A < B ? -1 : 0) * S.dir; });
  const per = 15, pages = Math.max(1, Math.ceil(rows.length / per)); S.page = Math.min(Math.max(1, S.page || 1), pages);
  const start = (S.page - 1) * per, show = rows.slice(start, start + per);
  $("#rows").innerHTML = show.length ? show.map(b => { const l = level(b.p), h = xv(b, "battery_health_percent"); return `<tr class="click" data-id="${esc(b.id)}" tabindex="0"><td class="id mono">${esc(b.id)}</td><td class="mono hide-sm">${esc(b.vehicle || "—")}</td><td class="hide-sm">${esc(b.brand || "—")} <span class="muted">${esc(b.model || "")}</span></td><td class="hide-sm">${esc(FLEET_ES[b.fleet] || b.fleet || "—")}</td>
    <td class="r"><div class="riskcell"><span class="minibar"><span style="width:${(b.p * 100).toFixed(1)}%;background:var(${lvVar(l)})"></span></span><span class="num">${pct(b.p, 1)}</span></div></td><td><span class="pill ${l}">${LV[l]}</span></td>
    <td class="r num hide-sm">${h == null ? "—" : nf(h, 1) + " %"}</td><td class="r num hide-sm">${b.life == null ? "—" : nf(b.life)}</td><td class="r hide-sm"><span class="open">Abrir →</span></td></tr>`; }).join("") : '<tr><td colspan="9" class="empty">No hay baterías que coincidan. Limpia los filtros.</td></tr>';
  $("#rowInfo").textContent = rows.length ? `Baterías ${nf(start + 1)} a ${nf(start + show.length)} de ${nf(rows.length)}` : "Sin baterías";
  renderPager(pages);
  $("#listSub").textContent = `Ordenada por ${({p:"riesgo de falla", id:"batería", health:"salud", life:"vida útil"})[S.sort]}, ${S.dir < 0 ? "de mayor a menor" : "de menor a mayor"}.`;
  document.querySelectorAll(".sort").forEach(s => { const on = s.dataset.sort === S.sort; s.removeAttribute("aria-sort"); if (on) s.setAttribute("aria-sort", S.dir < 0 ? "descending" : "ascending"); s.textContent = s.textContent.replace(/ [↑↓]$/, "") + (on ? (S.dir < 0 ? " ↓" : " ↑") : ""); });
}
const rowOpen = e => { const tr = e.target.closest("tr[data-id]"); if (tr) openDetail(fleet.find(b => b.id === tr.dataset.id)); };
$("#rows").addEventListener("click", rowOpen);
$("#rows").addEventListener("keydown", e => { if (e.key === "Enter") rowOpen(e); });
document.querySelectorAll(".sort").forEach(s => s.addEventListener("click", () => { if (S.sort === s.dataset.sort) S.dir *= -1; else { S.sort = s.dataset.sort; S.dir = S.sort === "id" ? 1 : -1; } S.page = 1; drawTable(); }));
function renderPager(pages){
  const cur = S.page, nums = [], add = n => nums.push(n);
  if (pages <= 7) for (let i = 1; i <= pages; i++) add(i);
  else { add(1); if (cur > 3) add("…"); for (let i = Math.max(2, cur - 1); i <= Math.min(pages - 1, cur + 1); i++) add(i); if (cur < pages - 2) add("…"); add(pages); }
  const arrow = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="${d}"/></svg>`;
  $("#pager").innerHTML = `<button data-pg="1" ${cur === 1 ? "disabled" : ""} aria-label="Primera página">${arrow("m11 17-5-5 5-5M18 17l-5-5 5-5")}</button>`
    + `<button data-pg="${cur - 1}" ${cur === 1 ? "disabled" : ""} aria-label="Página anterior">${arrow("m15 18-6-6 6-6")}</button>`
    + nums.map(n => n === "…" ? '<span class="gap">…</span>' : `<button data-pg="${n}" ${n === cur ? 'aria-current="page"' : ""} aria-label="Página ${n}">${n}</button>`).join("")
    + `<button data-pg="${cur + 1}" ${cur === pages ? "disabled" : ""} aria-label="Página siguiente">${arrow("m9 18 6-6-6-6")}</button>`
    + `<button data-pg="${pages}" ${cur === pages ? "disabled" : ""} aria-label="Última página">${arrow("m13 17 5-5-5-5M6 17l5-5-5-5")}</button>`
    + `<span class="pg">Página <b>${nf(cur)}</b> de <b>${nf(pages)}</b></span>`;
}
$("#pager").addEventListener("click", e => {
  const b = e.target.closest("button[data-pg]"); if (!b || b.disabled) return;
  S.page = +b.dataset.pg; drawTable();
  const rws = $("#rows"); rws.classList.remove("swap"); void rws.offsetWidth; rws.classList.add("swap");
  const top = $("#list-h").getBoundingClientRect().top; if (top < 70) $("#list-h").scrollIntoView({behavior: MOTION ? "smooth" : "auto", block:"start"});
});
function refresh(){ applyFilters(); S.spot = 0; S.page = 1; renderFleet({animate:true, hero:true}); }
let thrRaf; $("#threshold").addEventListener("input", e => { S.thr = +e.target.value / 100; cancelAnimationFrame(thrRaf); thrRaf = requestAnimationFrame(() => renderFleet()); });
$("#thrReset").addEventListener("click", () => { S.thr = S.rec; renderFleet({hero:true}); say(`Umbral recomendado por el modelo: ${nf(S.rec * 100)} %.`); });
let qT; $("#search").addEventListener("input", e => { S.q = e.target.value.trim(); clearTimeout(qT); qT = setTimeout(() => { applyFilters(); S.spot = 0; S.page = 1; renderFleet({hero:true}); }, 200); });
$("#fBrand").addEventListener("change", e => { S.brand = e.target.value; fillModels(); refresh(); });
$("#fModel").addEventListener("change", e => { S.model = e.target.value; refresh(); });
$("#fFleet").addEventListener("change", e => { S.ft = e.target.value; refresh(); });
$("#clearBtn").addEventListener("click", () => { S.q = S.brand = S.model = S.ft = ""; $("#search").value = ""; $("#fFleet").value = ""; fillFilters(); refresh(); });

function download(name, rows){
  const csv = "﻿" + rows.map(r => r.map(v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
$("#exportBtn").addEventListener("click", () => {
  download("batteryguard-inspeccion.csv", [["bateria","vehiculo","marca","modelo","flota","probabilidad_falla","nivel_riesgo","umbral","salud_pct","vida_util_ciclos"], ...sortedP.map(b => [b.id, b.vehicle, b.brand, b.model, FLEET_ES[b.fleet] || b.fleet, b.p.toFixed(4), LV[level(b.p)], S.thr.toFixed(2), xv(b, "battery_health_percent"), b.life])]);
  say(`Se exportaron ${nf(sortedP.length)} baterías ordenadas por riesgo.`);
});

/* Detalle */
let detTok = 0;
function openDetail(b){ if (!b) return; S.sel = b; pred = null; go("detail"); }
async function renderDetail(animate){
  const b = S.sel; if (!b) return; const l = level(b.p), rank = sortedP.indexOf(b), tok = ++detTok;
  $("#detail-h").textContent = b.id;
  $("#dMeta").innerHTML = `Vehículo <span class="mono">${esc(b.vehicle || "—")}</span> · ${esc(b.brand || "—")} ${esc(b.model || "")} · química ${esc(b.chem || "—")} · ${esc(FLEET_ES[b.fleet] || b.fleet || "—")}` + (b.fail === 1 ? ' · <span class="t-high">registró una falla en el historial</span>' : "");
  $("#dPill").innerHTML = `<span class="pill ${l}">Riesgo ${LV[l].toLowerCase()}</span>`;
  $("#dLead").textContent = (rank >= 0 ? `Lugar ${nf(rank + 1)} de ${nf(sortedP.length)} en la lista de prioridad. ` : "") + "Cada tarjeta apunta a la parte del pack que describe.";
  renderHero($("#detailHero"), b, animate !== false); drawRadar($("#radar"), b); revealScreen($("#screen-detail"), false); animIn($("#radar"));
  $("#signals").innerHTML = VARS.map(f => { const v = xv(b, f), p = pctl(f, v); return `<tr><td>${lab(f)}</td><td class="r num">${fmtVal(f, v)}</td><td class="r num muted hide-sm">${fmtVal(f, fleetMedian(f))}</td><td class="r num">${p == null ? "—" : "P" + Math.round(p * 100)}</td></tr>`; }).join("");
  if (!pred || pred._id !== b.id){
    $("#factors").innerHTML = '<div class="empty"><div class="spinner"></div><p>El modelo está calculando la explicación…</p></div>';
    $("#checklist").innerHTML = ""; $("#sim").innerHTML = ""; $("#messages").innerHTML = "";
    try {
      const r = await api(`/api/bateria?src=${S.src}&id=${encodeURIComponent(b.id)}&umbral=${S.thr}`);
      if (tok !== detTok) return;
      if (r.status !== "success"){ $("#factors").innerHTML = `<div class="alert err">${esc((r.errores || ["No se pudo calcular."]).join(" "))}</div>`; return; }
      pred = r; pred._id = b.id;
    } catch (e) { $("#factors").innerHTML = `<div class="alert err">No se pudo contactar al modelo: ${esc(e.message)}</div>`; return; }
  }
  renderExplain(b);
}
function renderExplain(b){
  const fs = pred.top_factores_detalle || [], maxC = Math.max(...fs.map(f => Math.abs(f.contribucion_shap)), .3);
  $("#whySub").textContent = `Las 5 variables que más influyen en la predicción (SHAP) · respuesta del modelo en ${nf(pred.tiempo_ms, 0)} ms.`;
  $("#factors").innerHTML = fs.map(f => { const v = f.contribucion_shap, w = Math.abs(v) / maxC * 50, up = v > 0, k = up ? "--high" : "--low";
    const med = VI[f.variable] != null ? ` · flota ${fmtVal(f.variable, fleetMedian(f.variable))}` : "";
    return `<div class="factor"><div class="factor-name">${lab(f.variable)}<span>${fmtVal(f.variable, f.valor)}${med}</span></div><div class="div-bar"><span data-a="x" data-s="90" data-o="${up ? "left" : "right"}" style="${up ? "left:50%" : `left:${50 - w}%`};width:${w}%;background:var(${k})"></span></div><div class="v ${up ? "t-high" : "t-low"}">${up ? "+" : "−"}${nf(Math.abs(v), 2)}</div></div>`; }).join("") || '<div class="empty">Sin explicación disponible.</div>';
  const ups = fs.filter(f => f.contribucion_shap > 0), acts = [...new Set((ups.length ? ups : fs.slice(0, 2)).map(f => action(f.variable)))].concat(["Registrar el resultado en la orden de trabajo."]);
  $("#checklist").innerHTML = acts.map(a => `<li><label><input type="checkbox"><span>${a}</span></label></li>`).join("");
  buildSim(); seedChat(); animIn($("#factors"));
}
function setFill(inp){ inp.style.setProperty("--fill", ((inp.value - inp.min) / (inp.max - inp.min) * 100) + "%"); }
let simT, simTok = 0, simX = {};
function buildSim(){
  const reg = pred.registro || {}, rng = (MODEL && MODEL.simulador) || {};
  simX = {};
  $("#sim").innerHTML = SIMF.filter(f => rng[f]).map(f => { const [mn, mx] = rng[f], v = reg[f] ?? fleetMedian(f) ?? mn, st = /count|faults|events|cycle/.test(f) ? 1 : (mx - mn) / 200;
    return `<div class="sim-item" id="si-${f}"><label for="sim-${f}"><span>${lab(f)}</span><output id="so-${f}">${fmtVal(f, v)}</output></label><input type="range" id="sim-${f}" data-f="${f}" data-orig="${v}" min="${mn}" max="${mx}" step="${+st.toPrecision(2)}" value="${v}"></div>`; }).join("");
  document.querySelectorAll("#sim input").forEach(inp => { setFill(inp); inp.addEventListener("input", () => {
    const f = inp.dataset.f, v = +inp.value; simX[f] = v; $("#so-" + f).textContent = fmtVal(f, v); setFill(inp);
    $("#si-" + f).classList.toggle("changed", Math.abs(v - +inp.dataset.orig) > 1e-9); clearTimeout(simT); simT = setTimeout(runSim, 220); }); });
  showSim(pred, true);
}
async function runSim(){
  const tok = ++simTok; $("#simRisk").parentElement.classList.add("busy");
  try {
    const r = await api("/api/predecir", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({src:S.src, id:S.sel.id, cambios:simX, umbral:S.thr})});
    if (tok === simTok) showSim(r, false);
  } catch (e) { $("#simMsgs").innerHTML = `<div class="alert err">No se pudo contactar al modelo: ${esc(e.message)}</div>`; }
  $("#simRisk").parentElement.classList.remove("busy");
}
function showSim(r, base){
  if (r.status !== "success"){ $("#simMsgs").innerHTML = `<div class="alert err"><b>El modelo rechazó la entrada:</b><ul>${(r.errores || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`; return; }
  const p = r.prediccion, l = level(p), d = (p - S.sel.p) * 100;
  $("#simRisk").innerHTML = `<span class="${lvCls(l)}">${pct(p, 1)}</span><small>${LV[l]}</small>`;
  $("#simDelta").innerHTML = base ? `±0.0<small>puntos</small>` : `<span class="${Math.abs(d) < .05 ? "" : d > 0 ? "t-high" : "t-low"}">${Math.abs(d) < .05 ? "±" : d > 0 ? "+" : "−"}${nf(Math.abs(d), 1)}</span><small>puntos</small>`;
  $("#simLife").innerHTML = `${nf(r.vida_util_restante_ciclos)}<small>ciclos</small>`;
  $("#simTime").innerHTML = `${nf(r.tiempo_ms, 0)}<small>ms</small>`;
  const adv = (r.advertencias || []).filter(a => !/no se capturaron/.test(a));
  $("#simMsgs").innerHTML = adv.length ? `<div class="alert warn">${adv.map(esc).join("<br>")}</div>` : "";
}
$("#simReset").addEventListener("click", () => { if (pred){ buildSim(); say("Valores restablecidos al registro original."); } });
$("#nextBtn").addEventListener("click", () => { const i = sortedP.indexOf(S.sel); openDetail(sortedP[(i + 1) % sortedP.length] || sortedP[0]); });
$("#sheetBtn").addEventListener("click", () => { const b = S.sel; if (!b) return;
  const rows = [["campo","valor"],["bateria",b.id],["vehiculo",b.vehicle],["marca",b.brand],["modelo",b.model],["probabilidad_falla",b.p.toFixed(4)],["nivel_riesgo",LV[level(b.p)]],["umbral",S.thr],["vida_util_ciclos",b.life]];
  if (pred) (pred.top_factores_detalle || []).forEach(f => rows.push(["shap_" + f.variable, f.contribucion_shap]));
  VARS.forEach(f => rows.push([f, xv(b, f)])); download(`ficha-${b.id}.csv`, rows); say("Ficha de la batería exportada."); });

function botReply(q){
  const b = S.sel, fs = (pred && pred.top_factores_detalle) || [], ups = fs.filter(f => f.contribucion_shap > 0).slice(0, 2);
  if (/^\s*(hola|buen[oa]s|qu[eé] tal|hey|saludos)/i.test(q)) return `¡Hola! Soy BatteryGuard AI. Esta batería (${b.id}) tiene ${pct(b.p, 1)} de probabilidad de falla, riesgo ${LV[level(b.p)].toLowerCase()}. ¿Quieres saber por qué o qué inspeccionar?`;
  if (/gracias/i.test(q)) return "¡Con gusto! Si necesitas revisar otra batería, ábrela desde la lista de inspección.";
  if (/qui[eé]n eres|qu[eé] eres|qu[eé] puedes|c[oó]mo te llamas/i.test(q)) return "Soy BatteryGuard AI, el asistente de esta app. Te ayudo a entender el riesgo de falla, la vida útil y los factores de cada batería, y qué conviene inspeccionar.";
  if (/vida|ciclo|dura|queda/i.test(q)) return b.life == null ? "El modelo no pudo estimar la vida útil de esta batería." : `El modelo de vida útil estima unos ${nf(b.life)} ciclos restantes (error promedio ±${nf((MODEL && MODEL.vida_util && MODEL.vida_util.slice(-1)[0].test_mae) || 441)} ciclos). La mediana de la flota es ${nf(lifeMed)}.`;
  if (/inspecc|revis|hacer|qué debo/i.test(q)) return "Empieza por: " + [...new Set((ups.length ? ups : fs.slice(0, 2)).map(f => low1(action(f.variable).replace(/\.$/, ""))))].join("; ") + ".";
  if (/cuid|manten|prolong/i.test(q)) return "Evita el calor sostenido y la carga rápida frecuente, mantén la carga entre 20 y 80 % y revisa el enfriamiento en cada servicio.";
  if (!/bater|riesg|fall|salud|temper|calor|resist|bms|alert|modelo|umbral|carg|volt|shap|flota|predic|probab|nivel|por ?qu|explic|señal|senal|celda|pack|módul|modul/i.test(q))
    return "Solo puedo ayudarte con BatteryGuard AI y las baterías de la flota. Prueba con: «¿Por qué tiene este riesgo?», «¿Qué debo inspeccionar?» o «¿Cuánta vida le queda?».";
  return ups.length ? `El modelo le da ${pct(b.p, 1)} de probabilidad de falla (riesgo ${LV[level(b.p)].toLowerCase()}). Lo que más la empuja: ${ups.map(f => `${low1(lab(f.variable))} (${fmtVal(f.variable, f.valor)})`).join(" y ")}.` : `El modelo le da ${pct(b.p, 1)} de probabilidad de falla; ninguna variable empuja fuerte el riesgo hacia arriba.`;
}
let chatLog = [], chatBusy = false;
/* Markdown del asistente */
function inlineMd(s){
  return s.replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, "<b>$1</b>").replace(/__([^_]+?)__/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, "$1<i>$2</i>")
    .replace(/\*\*/g, "");
}
function renderMd(text){
  const lines = esc(String(text).replace(/\r/g, "").replace(/ | |‑/g, m => m === "‑" ? "-" : " ")).split("\n");
  let html = "", list = null, para = [];
  const flushP = () => { if (para.length){ html += `<p>${inlineMd(para.join(" "))}</p>`; para = []; } };
  const flushL = () => { if (list){ html += `<${list.t}>${list.items.map(i => `<li>${inlineMd(i)}</li>`).join("")}</${list.t}>`; list = null; } };
  for (const raw of lines){
    const l = raw.trim(); let m;
    if (!l){ flushP(); flushL(); continue; }
    if ((m = l.match(/^#{1,6}\s+(.*)$/))){ flushP(); flushL(); html += `<p class="md-h">${inlineMd(m[1])}</p>`; continue; }
    if ((m = l.match(/^(?:[-*•]|•)\s+(.*)$/))){ flushP(); if (!list || list.t !== "ul"){ flushL(); list = {t:"ul", items:[]}; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))){ flushP(); if (!list || list.t !== "ol"){ flushL(); list = {t:"ol", items:[]}; } list.items.push(m[1]); continue; }
    if (list && /^\s{2,}/.test(raw)){ list.items[list.items.length - 1] += " " + l; continue; }
    flushL(); para.push(l);
  }
  flushP(); flushL();
  return html;
}
function addMsg(t, who, extra){ const m = document.createElement("div"); m.className = "msg msg-in " + who + (extra ? " " + extra : "");
  if (who === "bot") m.innerHTML = renderMd(t); else m.textContent = t;
  $("#messages").append(m); $("#messages").scrollTop = 1e6; return m; }
function setAiBadge(){
  const a = MODEL && MODEL.asistente, on = a && a.activo, b = $("#aiBadge");
  b.className = "ai-badge" + (on ? " on" : ""); b.textContent = on ? "IA conectada" : "Respuestas básicas";
  b.title = on ? `Proveedor: ${a.proveedor} · ${a.modelo}` : "Configura tu llave en el archivo .env para activar la IA";
  $("#chatSub").textContent = on ? "Asistente de IA: responde solo sobre esta app y la batería que estás viendo." : "Respuestas básicas armadas con la predicción del modelo. Agrega una llave de IA en .env para respuestas más completas.";
}
function seedChat(){
  $("#messages").innerHTML = ""; chatLog = [];
  const intro = `Hola, soy BatteryGuard AI. Estoy viendo contigo la batería ${S.sel.id} (riesgo ${LV[level(S.sel.p)].toLowerCase()}). Pregúntame por qué tiene este riesgo, qué inspeccionar o cuánta vida le queda.`;
  addMsg(intro, "bot"); chatLog.push({role:"assistant", content:intro});
}
/* Chat */
async function askStream(q, onText){
  const res = await fetch("/api/chat/stream", {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({src:S.src, id:S.sel.id, umbral:S.thr, mensajes:chatLog})});
  if (!res.ok || !res.body){ let j = {}; try { j = await res.json(); } catch (e) {} return {tipo:"error", msg:(j.errores || ["No se pudo obtener respuesta."]).join(" ")}; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", fin = null;
  for (;;){
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, {stream:true});
    let i;
    while ((i = buf.indexOf("\n")) >= 0){
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.t === "texto"){ text += ev.v; onText(text); }
      else fin = ev;
    }
  }
  if (fin && (fin.t === "error" || fin.t === "sin_ia")) return {tipo:fin.t, msg:fin.v, text};
  return {tipo:"ok", text};
}
async function ask(q){
  if (chatBusy || !q || !S.sel) return; chatBusy = true; $("#chatForm button").disabled = true;
  addMsg(q, "user"); chatLog.push({role:"user", content:q});
  const ai = MODEL && MODEL.asistente && MODEL.asistente.activo;
  let answer = null, err = false, bubble = null;
  if (ai){
    const t = document.createElement("div"); t.className = "msg bot typing msg-in"; t.innerHTML = "<i></i><i></i><i></i>"; $("#messages").append(t); $("#messages").scrollTop = 1e6;
    try {
      const r = await askStream(q, text => {
        if (!bubble){ t.remove(); bubble = addMsg("", "bot"); }
        bubble.innerHTML = renderMd(text); $("#messages").scrollTop = 1e6;
      });
      if (r.tipo === "ok") answer = r.text.trim() || "No obtuve respuesta. Intenta de nuevo.";
      else if (r.tipo === "sin_ia"){ MODEL.asistente.activo = false; setAiBadge(); }
      else { answer = (r.text ? r.text + "\n\n" : "") + r.msg + "\n\n**Respuesta básica:** " + botReply(q); err = true; }
    } catch (e) { answer = "No se pudo contactar al asistente de IA.\n\n**Respuesta básica:** " + botReply(q); err = true; }
    t.remove();
  }
  if (answer == null) answer = botReply(q);
  if (bubble){ bubble.innerHTML = renderMd(answer); if (err) bubble.classList.add("err"); }
  else { if (!ai) await new Promise(r => setTimeout(r, 150)); addMsg(answer, "bot", err ? "err" : ""); }
  chatLog.push({role:"assistant", content:answer});
  chatBusy = false; $("#chatForm button").disabled = false;
}
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => ask(c.textContent)));
$("#chatForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (!v) return; $("#chatInput").value = ""; ask(v); });

/* Carga de archivos */
let pendingToken = null;
const EXT = /\.(csv|txt|xlsx|xlsm|xls)$/i;
function setSteps(k){ document.querySelectorAll("#steps li").forEach((li, i) => li.classList.toggle("done", i < k)); }
function showRefQuality(){
  $("#qFile").textContent = "Dataset de referencia · ev_battery_failure_prediction_Dataset.csv (" + nf(fleet.length) + " baterías)";
  $("#qRows").textContent = nf(fleet.length); $("#qCols").textContent = "70";
  $("#qMissing").textContent = pct(fleet.reduce((a, b) => a + b.x.filter(v => v == null).length, 0) / (fleet.length * VARS.length), 1);
  $("#qFeats").innerHTML = `${MODEL ? MODEL.n_variables : 61}<small>de ${MODEL ? MODEL.n_variables : 61}</small>`;
  $("#qAlert").innerHTML = '<div class="alert ok">Seriales anonimizados. El modelo completa los vacíos con la mediana del historial de entrenamiento.</div>';
  $("#pvHead").innerHTML = "<tr><th>Batería</th><th>Vehículo</th><th>Marca</th><th>Modelo</th>" + VARS.slice(0, 5).map(f => `<th class="r">${lab(f)}</th>`).join("") + "</tr>";
  $("#pvRows").innerHTML = fleet.slice(0, 6).map(b => `<tr><td class="mono">${b.id}</td><td class="mono">${esc(b.vehicle || "—")}</td><td>${esc(b.brand || "—")}</td><td>${esc(b.model || "—")}</td>${VARS.slice(0, 5).map(f => `<td class="r num">${fmtVal(f, xv(b, f))}</td>`).join("")}</tr>`).join("");
}
async function loadFile(file){
  if (!file) return;
  if (!EXT.test(file.name)){ $("#qAlert").innerHTML = '<div class="alert err">Formato no soportado. Usa un archivo CSV (.csv) o Excel (.xlsx, .xls).</div>'; return; }
  if (file.size > 60 * 1024 * 1024){ $("#qAlert").innerHTML = '<div class="alert err">El archivo pesa más de 60 MB. Divide el archivo o quita columnas que no use el modelo.</div>'; return; }
  pendingToken = null; $("#scoreBtn").disabled = true;
  $("#dropTitle").textContent = file.name; $("#dropSub").textContent = "Leyendo el archivo…";
  $("#qAlert").innerHTML = '<div class="alert ok">Leyendo y revisando el archivo…</div>';
  try {
    const r = await api("/api/revisar", {method:"POST", headers:{"Content-Type":"application/octet-stream", "X-Archivo":encodeURIComponent(file.name)}, body:await file.arrayBuffer()});
    if (r.status !== "success"){ $("#qAlert").innerHTML = `<div class="alert err">${esc((r.errores || ["No se pudo leer el archivo."]).join(" "))}</div>`; $("#dropSub").textContent = "Elige otro archivo"; setSteps(1); return; }
    $("#dropSub").textContent = (r.hoja ? `Hoja «${r.hoja}» · ` : "") + "Archivo leído · haz clic para cambiarlo";
    $("#qFile").textContent = r.archivo + (r.hoja ? ` · hoja «${r.hoja}»` : "");
    $("#qRows").textContent = nf(r.filas); $("#qCols").textContent = nf(r.columnas); $("#qMissing").textContent = pct(r.vacias, 1);
    $("#qFeats").innerHTML = `${nf(r.encontradas)}<small>de ${nf(r.total)}</small>`;
    let html = r.encontradas ? (r.encontradas < r.total ? `<div class="alert warn">${nf(r.total - r.encontradas)} variables del modelo no vienen en el archivo; se completarán con la mediana del historial y la predicción será menos precisa.</div>` : '<div class="alert ok">Estructura completa. Lista para que el modelo la puntúe.</div>') : '<div class="alert err">Ninguna columna coincide con las variables del modelo. Revisa que los encabezados sean los del dataset (por ejemplo battery_health_percent).</div>';
    if (!r.tiene_falla) html += '<div class="alert warn">No trae <span class="mono">battery_failure</span>: el tablero funcionará, pero no podrá medir cuántas fallas reales se capturan.</div>';
    if (r.avisos.length) html += `<div class="alert warn"><b>Valores que se tratarán como vacíos:</b><ul>${r.avisos.slice(0, 6).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>`;
    $("#qAlert").innerHTML = html;
    $("#pvHead").innerHTML = "<tr>" + r.vista_columnas.map(c => `<th>${esc(LABEL[c] ? lab(c) : c)}</th>`).join("") + "</tr>";
    $("#pvRows").innerHTML = r.vista.map(row => "<tr>" + row.map(v => `<td>${v == null || v === "" ? '<span class="muted">—</span>' : esc(v)}</td>`).join("") + "</tr>").join("");
    pendingToken = r.encontradas ? r.token : null; $("#scoreBtn").disabled = !pendingToken; setSteps(pendingToken ? 2 : 1);
  } catch (e) { $("#qAlert").innerHTML = `<div class="alert err">No se pudo enviar el archivo al servidor: ${esc(e.message)}</div>`; }
}
$("#csvInput").addEventListener("change", e => { loadFile(e.target.files[0]); e.target.value = ""; });
const dropZ = $("#drop");
dropZ.addEventListener("dragover", e => { e.preventDefault(); dropZ.classList.add("drag"); });
dropZ.addEventListener("dragleave", () => dropZ.classList.remove("drag"));
dropZ.addEventListener("drop", e => { e.preventDefault(); dropZ.classList.remove("drag"); loadFile(e.dataTransfer.files[0]); });
$("#scoreBtn").addEventListener("click", async () => {
  if (!pendingToken) return; const btn = $("#scoreBtn"); btn.disabled = true; btn.textContent = "El modelo está puntuando…";
  try {
    const r = await api("/api/lote", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token:pendingToken})});
    if (r.status !== "success"){ $("#qAlert").innerHTML = `<div class="alert err">${esc((r.errores || []).join(" "))}</div>`; return; }
    S.brand = S.model = S.ft = S.q = ""; $("#search").value = ""; $("#fFleet").value = "";
    loadFleet(r, "upload"); setSteps(3); go("fleet");
    say(`El modelo puntuó ${nf(r.filas)} baterías en ${nf(r.tiempo_ms / 1000, 1)} s.`);
  } catch (e) { $("#qAlert").innerHTML = `<div class="alert err">No se pudo contactar al modelo: ${esc(e.message)}</div>`; }
  finally { btn.disabled = !pendingToken; btn.textContent = "Puntuar con el modelo y ver prioridades →"; }
});
$("#resetData").addEventListener("click", async () => {
  const r = await api("/api/flota?src=ref"); loadFleet(r, "ref"); pendingToken = null; $("#scoreBtn").disabled = true; setSteps(1);
  $("#dropTitle").textContent = "Arrastra tu archivo CSV o Excel aquí"; $("#dropSub").textContent = "o haz clic para elegirlo"; showRefQuality(); say("Se restauró el dataset de referencia.");
});

/* Inicio */
async function boot(){
  setThemeIcon();
  try {
    const est = await api("/api/estado").catch(() => ({}));
    if (est.version !== APP_VERSION){
      $("#loading").hidden = false;
      $("#loading").innerHTML = `<div><h2>El servidor está desactualizado</h2><p>La app se actualizó pero la ventana del servidor es de una versión anterior. Ciérrala y vuelve a abrir <b>iniciar.bat</b> (o ejecuta el comando de abajo), luego recarga esta página.</p><code>python server.py</code></div>`;
      setStatus(false, "Reinicia el servidor"); return;
    }
    MODEL = await api("/api/modelo");
    S.thr = S.rec = MODEL.umbral_alto; S.med = MODEL.umbral_medio;
    $("#loadMsg").textContent = "Descargando la flota puntuada por el modelo…";
    const f = await api("/api/flota?src=ref"); loadFleet(f, "ref");
    setStatus(true, "Modelo IA conectado");
    $("#footModel").textContent = `Predicciones del modelo ${MODEL.modelo_falla} (${MODEL.n_variables} variables) y ${MODEL.modelo_vida_util}, ejecutados localmente.`;
    showRefQuality(); setAiBadge(); $("#loading").hidden = true;
    const h0 = location.hash.slice(1); go(["detail", "data", "model"].includes(h0) ? h0 : "fleet");
  } catch (e) {
    setStatus(false, "Modelo sin conexión");
    $("#loading").innerHTML = `<div><h2>No hay conexión con el modelo de IA</h2><p>Abre la app desde el servidor local. En la carpeta del proyecto ejecuta:</p><code>python server.py</code><p style="margin-top:12px;font-size:13px" class="muted">y entra a http://localhost:8000. Detalle: ${esc(e.message)}</p></div>`;
  }
}
boot();
