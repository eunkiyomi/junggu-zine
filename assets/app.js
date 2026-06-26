// ===== Zine data =====
// 001 = cover, 002–008 = pages 1–7 of the printed newsletter.
const PAGES = [
  { file: "zine/001.jpg", label: "표지",        no: "표지" },
  { file: "zine/002.jpg", label: "인사말 · 법인소개", no: "01" },
  { file: "zine/003.jpg", label: "분기별 주요소식",   no: "02" },
  { file: "zine/004.jpg", label: "분기별 주요소식",   no: "03" },
  { file: "zine/005.jpg", label: "분기별 주요소식",   no: "04" },
  { file: "zine/006.jpg", label: "프로그램 · 주요 서비스", no: "05" },
  { file: "zine/007.jpg", label: "후원금 보고 · 현황안내", no: "06" },
  { file: "zine/008.jpg", label: "후원 · 자원봉사 안내",   no: "07" },
];

// Table of contents (printed page → zine index)
const TOC = [
  { page: "Page 1", title: "인사말 및 법인소개",      idx: 1 },
  { page: "Page 2", title: "분기별 주요소식",          idx: 2 },
  { page: "Page 5", title: "프로그램 및 주요 서비스",  idx: 5 },
  { page: "Page 6", title: "후원금 보고 및 현황안내",  idx: 6 },
  { page: "Page 7", title: "후원 및 자원봉사 안내",    idx: 7 },
];

const $ = (s) => document.querySelector(s);
let current = 0;

// ===== Reader =====
const stageImg = $("#stageImg");
const pageNum = $("#pageNum");
const pageLabel = $("#pageLabel");
const prevBtn = $("#prevBtn");
const nextBtn = $("#nextBtn");
const thumbs = $("#thumbs");

function pad(n) { return String(n + 1).padStart(2, "0"); }

function render(i) {
  current = Math.max(0, Math.min(PAGES.length - 1, i));
  const p = PAGES[current];
  stageImg.src = p.file;
  stageImg.alt = p.label;
  pageNum.textContent = pad(current);
  pageLabel.textContent = p.label;
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === PAGES.length - 1;
  [...thumbs.children].forEach((t, idx) =>
    t.classList.toggle("active", idx === current)
  );
  const active = thumbs.children[current];
  if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

function go(delta) { render(current + delta); }

// Build thumbnails
PAGES.forEach((p, i) => {
  const t = document.createElement("img");
  t.src = p.file;
  t.alt = p.label;
  t.loading = "lazy";
  t.addEventListener("click", () => render(i));
  thumbs.appendChild(t);
});

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));

// ===== Contents =====
const tocEl = $("#toc");
TOC.forEach((item) => {
  const li = document.createElement("li");
  li.innerHTML =
    `<span class="toc-page">${item.page}</span>` +
    `<span class="toc-title">${item.title}</span>` +
    `<span class="toc-go">›</span>`;
  li.addEventListener("click", () => {
    render(item.idx);
    $("#reader").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  tocEl.appendChild(li);
});

// ===== Gallery =====
const grid = $("#grid");
PAGES.forEach((p, i) => {
  const fig = document.createElement("figure");
  fig.innerHTML =
    `<img src="${p.file}" alt="${p.label}" loading="lazy" />` +
    `<figcaption><b>${i === 0 ? "표지" : "p." + p.no}</b><span>${p.label}</span></figcaption>`;
  fig.addEventListener("click", () => openLightbox(i));
  grid.appendChild(fig);
});

// ===== Lightbox =====
const lightbox = $("#lightbox");
const lbImg = $("#lbImg");
const lbCounter = $("#lbCounter");
let lbOpen = false;

function openLightbox(i) {
  current = i;
  syncLightbox();
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  lbOpen = true;
}
function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lbOpen = false;
  render(current); // keep reader in sync with last viewed page
}
function syncLightbox() {
  const p = PAGES[current];
  lbImg.src = p.file;
  lbImg.alt = p.label;
  lbCounter.textContent = `${pad(current)} / 08 · ${p.label}`;
}
function lbGo(delta) {
  current = Math.max(0, Math.min(PAGES.length - 1, current + delta));
  syncLightbox();
}

$("#zoomBtn").addEventListener("click", () => openLightbox(current));
$("#lbClose").addEventListener("click", closeLightbox);
$("#lbPrev").addEventListener("click", () => lbGo(-1));
$("#lbNext").addEventListener("click", () => lbGo(1));
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });

// Cover in hero opens lightbox at page 0
$(".cover-frame").addEventListener("click", (e) => {
  e.preventDefault();
  openLightbox(0);
});

// ===== Keyboard =====
document.addEventListener("keydown", (e) => {
  if (lbOpen) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lbGo(-1);
    if (e.key === "ArrowRight") lbGo(1);
    return;
  }
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
});

// ===== Touch swipe (reader + lightbox) =====
let touchX = null;
function onStart(e) { touchX = e.changedTouches[0].clientX; }
function onEnd(e, handler) {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 45) handler(dx < 0 ? 1 : -1);
  touchX = null;
}
$(".stage").addEventListener("touchstart", onStart, { passive: true });
$(".stage").addEventListener("touchend", (e) => onEnd(e, go), { passive: true });
lightbox.addEventListener("touchstart", onStart, { passive: true });
lightbox.addEventListener("touchend", (e) => onEnd(e, lbGo), { passive: true });

// ===== Init =====
render(0);
