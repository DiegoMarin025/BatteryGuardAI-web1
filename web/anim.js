const MOTION = !matchMedia("(prefers-reduced-motion: reduce)").matches && !!window.IntersectionObserver;
const EASE = "cubic-bezier(.16,1,.3,1)";
if (MOTION) document.documentElement.classList.add("js-anim");

function animIn(root){
  if (!MOTION || !root) return;
  const els = root.querySelectorAll("[data-a]");
  els.forEach((el, i) => {
    const t = el.dataset.a, d = +(el.dataset.d || 0) + Math.min(i, 24) * (+(el.dataset.s || 35));
    try {
      if (t === "y"){ el.style.transformBox = "fill-box"; el.style.transformOrigin = "50% 100%";
        el.animate([{transform:"scaleY(0)"}, {transform:"scaleY(1)"}], {duration:750, delay:d, easing:EASE, fill:"backwards"}); }
      else if (t === "x"){ el.style.transformOrigin = el.dataset.o === "right" ? "100% 50%" : "0 50%";
        el.animate([{transform:"scaleX(0)"}, {transform:"scaleX(1)"}], {duration:800, delay:d, easing:EASE, fill:"backwards"}); }
      else if (t === "draw"){ const len = el.getTotalLength();
        el.animate([{strokeDasharray:`0 ${len}`}, {strokeDasharray:`${len} ${len}`}], {duration:1300, delay:d, easing:"ease-out", fill:"backwards"}); }
      else if (t === "arc"){ const full = el.getAttribute("stroke-dasharray"), C = full.split(" ")[1];
        el.animate([{strokeDasharray:`0 ${C}`}, {strokeDasharray:full}], {duration:1000, delay:d, easing:EASE, fill:"backwards"}); }
      else if (t === "pop"){ el.style.transformBox = "fill-box"; el.style.transformOrigin = "50% 50%";
        el.animate([{transform:"scale(0)", opacity:0}, {transform:"scale(1)", opacity:1}], {duration:650, delay:d, easing:EASE, fill:"backwards"}); }
      else { el.animate([{opacity:0}, {opacity:1}], {duration:600, delay:d, easing:"ease-out", fill:"backwards"}); }
    } catch (e) {}
  });
}

let scRaf = 0;
function animScatter(cv, view){
  if (!MOTION){ drawScatter(cv, view, 1); return; }
  cancelAnimationFrame(scRaf); const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); drawScatter(cv, view, e); if (k < 1) scRaf = requestAnimationFrame(step); };
  scRaf = requestAnimationFrame(step);
}

const seen = new WeakSet();
const io = MOTION ? new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return; const c = en.target; io.unobserve(c); seen.add(c);
    c.classList.remove("rv-wait"); c.classList.add("rv-in");
    if (c.dataset.pend){ delete c.dataset.pend; playCard(c); }
  });
}, {threshold:.12, rootMargin:"0px 0px -40px 0px"}) : null;

function playCard(c){
  animIn(c);
  const cv = c.querySelector("canvas#scatter"); if (cv) animScatter(cv, view);
}
const inView = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight - 40 && r.bottom > 0; };

function revealScreen(screen, charts){
  if (!MOTION) return;
  screen.querySelectorAll(".card").forEach(c => {
    if (!seen.has(c)){
      if (inView(c)){ seen.add(c); c.classList.add("rv-in"); if (charts) playCard(c); }
      else { c.classList.add("rv-wait"); if (charts) c.dataset.pend = "1"; io.observe(c); }
    } else if (charts){
      if (inView(c)) playCard(c); else { c.dataset.pend = "1"; io.observe(c); }
    }
  });
}
