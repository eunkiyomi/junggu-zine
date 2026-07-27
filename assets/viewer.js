/*
 * 서울시중구재가노인복지기관 소식지 — PDF 책넘김 뷰어
 *
 * PDF 한 장 한 장을 canvas 로 그린 뒤 StPageFlip 에 얹어 책처럼 넘기게 합니다.
 * 설정은 index.html 의 window.ZINE_CONFIG 에서, 일부는 URL 파라미터로 덮어씁니다.
 */

import * as pdfjsLib from './vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

/* ------------------------------------------------------------------ 설정 */

const CONFIG = Object.assign(
  {
    pdf: '',
    fallbackPages: [],
    title: '소식지',
    org: '',
    downloadName: '',
    // 두 면 펼침(landscape)으로 바뀌는 최소 폭. 이보다 좁으면 한 면씩 봅니다.
    spreadBreakpoint: 680,
  },
  window.ZINE_CONFIG || {}
);

const params = new URLSearchParams(location.search);
if (params.get('pdf')) CONFIG.pdf = params.get('pdf');

const IS_EMBED = params.has('embed') && params.get('embed') !== '0';
const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------- DOM 참조 */

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  book: $('book'),
  bookWrap: $('bookWrap'),
  stage: $('stage'),
  prev: $('prevBtn'),
  next: $('nextBtn'),
  first: $('firstBtn'),
  last: $('lastBtn'),
  counter: $('counter'),
  slider: $('slider'),
  thumbsBtn: $('thumbsBtn'),
  thumbs: $('thumbs'),
  thumbsTrack: $('thumbsTrack'),
  zoomBtn: $('zoomBtn'),
  zoom: $('zoom'),
  zoomScroll: $('zoomScroll'),
  zoomCanvas: $('zoomCanvas'),
  zoomTitle: $('zoomTitle'),
  zoomIn: $('zoomIn'),
  zoomOut: $('zoomOut'),
  zoomClose: $('zoomClose'),
  zoomPrev: $('zoomPrev'),
  zoomNext: $('zoomNext'),
  fullBtn: $('fullBtn'),
  embedFullBtn: $('embedFullBtn'),
  downloadBtn: $('downloadBtn'),
  loading: $('loading'),
  loadingBar: $('loadingBar'),
  error: $('error'),
  errorMsg: $('errorMsg'),
  live: $('live'),
  embedOpenBtn: $('embedOpenBtn'),
  embedCode: $('embedCode'),
  copyBtn: $('copyBtn'),
};

if (IS_EMBED) document.documentElement.classList.add('is-embed');

/* --------------------------------------------------------- 페이지 소스 */

/**
 * 페이지 소스는 { count, aspect, render(i, canvas, targetWidth), label(i) } 형태.
 * 기본은 PDF, PDF 를 못 읽으면 미리 뽑아둔 이미지로 넘어갑니다.
 */

function serialize() {
  // pdf.js 는 같은 page 객체를 동시에 두 번 render 하면 실패합니다. 한 줄로 세웁니다.
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}

async function createPdfSource(url) {
  const doc = await pdfjsLib.getDocument({
    url,
    disableAutoFetch: false,
    isEvalSupported: false,
  }).promise;

  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const queue = serialize();

  return {
    kind: 'pdf',
    count: doc.numPages,
    aspect: base.width / base.height,
    render(index, canvas, targetWidth) {
      return queue(async () => {
        const page = await doc.getPage(index + 1);
        const unit = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, targetWidth / unit.width);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
      });
    },
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다: ' + src));
    img.src = src;
  });
}

async function createImageSource(urls) {
  const first = await loadImage(urls[0]);
  const cache = new Map([[0, first]]);

  return {
    kind: 'image',
    count: urls.length,
    aspect: first.naturalWidth / first.naturalHeight,
    async render(index, canvas, targetWidth) {
      let img = cache.get(index);
      if (!img) {
        img = await loadImage(urls[index]);
        cache.set(index, img);
      }
      const w = Math.min(targetWidth, img.naturalWidth);
      canvas.width = Math.round(w);
      canvas.height = Math.round((w / img.naturalWidth) * img.naturalHeight);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    },
  };
}

/* ------------------------------------------------------------- 뷰어 본체 */

const state = {
  source: null,
  flip: null,
  flipLoaded: false,
  pages: [],        // { root, inner, canvas, renderedWidth, pending }
  index: 0,
  thumbsOpen: false,
  zoomOpen: false,
  zoomIndex: 0,
  zoomFactor: 1,
  zoomRenderedFor: -1,
};

const pageLabel = (i) => (i === 0 ? '표지' : i === state.source.count - 1 ? '뒷면' : `${i + 1}면`);

function announce(message) {
  el.live.textContent = message;
}

/* ---- 렌더 목표 해상도 -------------------------------------------------- */

function displayPageWidth() {
  const rect = state.flip && state.flip.getBoundsRect();
  if (rect && rect.pageWidth > 0) return rect.pageWidth;
  const w = el.bookWrap.clientWidth || 800;
  return w >= CONFIG.spreadBreakpoint ? w / 2 : w;
}

function targetRenderWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.round(Math.min(2000, Math.max(560, displayPageWidth() * dpr)));
}

/* ---- 페이지 렌더 큐 ---------------------------------------------------- */

let renderChain = Promise.resolve();

function ensurePage(index, targetWidth) {
  const page = state.pages[index];
  if (!page) return Promise.resolve();
  // 이미 충분히 선명하면 다시 그리지 않습니다.
  if (page.renderedWidth >= targetWidth * 0.9) return Promise.resolve();
  if (page.pending === targetWidth) return Promise.resolve();

  page.pending = targetWidth;
  renderChain = renderChain
    .then(() => state.source.render(index, page.canvas, targetWidth))
    .then(() => {
      page.renderedWidth = targetWidth;
      page.root.classList.add('is-ready');
    })
    .catch((err) => {
      console.error('[zine] page render failed', index, err);
    })
    .finally(() => {
      if (page.pending === targetWidth) page.pending = 0;
    });
  return renderChain;
}

/** 현재 펼침면을 먼저, 그 다음 가까운 면부터 순서대로 그립니다. */
function scheduleRenders() {
  const targetWidth = targetRenderWidth();
  const order = [...state.pages.keys()].sort(
    (a, b) => Math.abs(a - state.index) - Math.abs(b - state.index)
  );
  for (const i of order) ensurePage(i, targetWidth);
}

/* ---- 레이아웃 ---------------------------------------------------------- */

function layout() {
  const w = el.bookWrap.clientWidth;
  const h = el.bookWrap.clientHeight;
  if (w < 40 || h < 40) return;
  el.book.style.width = w + 'px';
  el.book.style.height = h + 'px';
  // update() reaches into render/pages, which only exist after loadFromHTML.
  if (state.flipLoaded) state.flip.update();
}

/* ---- 현재 보이는 면 ---------------------------------------------------- */

function visiblePages() {
  const i = state.index;
  const n = state.source.count;
  if (!state.flip || state.flip.getOrientation() === 'portrait') return [i];
  if (i === 0) return [0];
  const left = i % 2 === 1 ? i : i - 1;
  return left + 1 < n ? [left, left + 1] : [left];
}

function syncUI() {
  const n = state.source.count;
  const shown = visiblePages();
  const label =
    shown.length === 2
      ? `${shown[0] + 1}–${shown[1] + 1}`
      : `${shown[0] + 1}`;

  el.counter.innerHTML = `<b>${label}</b> <span>/ ${n}면</span>`;
  el.slider.value = String(state.index + 1);
  el.prev.disabled = state.index <= 0;
  el.first.disabled = state.index <= 0;
  el.next.disabled = shown[shown.length - 1] >= n - 1;
  el.last.disabled = shown[shown.length - 1] >= n - 1;

  for (const btn of el.thumbsTrack.children) {
    const i = Number(btn.dataset.index);
    btn.setAttribute('aria-current', shown.includes(i) ? 'true' : 'false');
  }
  if (state.thumbsOpen) revealCurrentThumb();

  if (el.embedOpenBtn) el.embedOpenBtn.href = `./#p${state.index + 1}`;

  announce(`${label}면 / 전체 ${n}면`);
  const hash = '#p' + (state.index + 1);
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function revealCurrentThumb() {
  const btn = el.thumbsTrack.querySelector('[aria-current="true"]');
  if (!btn) return;
  const track = el.thumbs;
  const left = btn.offsetLeft - (track.clientWidth - btn.offsetWidth) / 2;
  track.scrollTo({ left: Math.max(0, left), behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
}

/* ---- 썸네일 ------------------------------------------------------------ */

function buildThumbs() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < state.source.count; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zv-thumb';
    btn.dataset.index = String(i);
    btn.setAttribute('aria-label', `${pageLabel(i)}으로 이동`);
    btn.innerHTML = `<canvas></canvas><span>${i + 1}</span>`;
    btn.addEventListener('click', () => {
      goTo(i);
      setThumbsOpen(false);
    });
    frag.appendChild(btn);
  }
  el.thumbsTrack.appendChild(frag);

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const btn = entry.target;
        io.unobserve(btn);
        const canvas = btn.querySelector('canvas');
        renderChain = renderChain
          .then(() => state.source.render(Number(btn.dataset.index), canvas, 180))
          .catch(() => {});
      }
    },
    { root: el.thumbs, rootMargin: '200px' }
  );
  for (const btn of el.thumbsTrack.children) io.observe(btn);
}

function setThumbsOpen(open) {
  state.thumbsOpen = open;
  el.thumbs.dataset.open = String(open);
  el.thumbs.setAttribute('aria-hidden', String(!open));
  el.thumbsBtn.setAttribute('aria-pressed', String(open));
  requestAnimationFrame(layout);
  if (open) revealCurrentThumb();
}

/* ---- 확대 보기 --------------------------------------------------------- */

function openZoom(index) {
  state.zoomOpen = true;
  state.zoomIndex = index;
  state.zoomFactor = 1;
  el.zoom.dataset.open = 'true';
  el.zoom.setAttribute('aria-hidden', 'false');
  el.zoomClose.focus();
  renderZoom();
}

function closeZoom() {
  state.zoomOpen = false;
  el.zoom.dataset.open = 'false';
  el.zoom.setAttribute('aria-hidden', 'true');
  el.zoomBtn.focus();
}

function applyZoomScale() {
  const box = el.zoomScroll;
  const fit = Math.min(box.clientWidth, (box.clientHeight - 16) * state.source.aspect);
  el.zoomCanvas.style.width = Math.round(fit * state.zoomFactor) + 'px';
  el.zoomOut.disabled = state.zoomFactor <= 1;
  el.zoomIn.disabled = state.zoomFactor >= 4;
}

function renderZoom() {
  const i = state.zoomIndex;
  el.zoomTitle.textContent = `${pageLabel(i)} (${i + 1}/${state.source.count})`;
  el.zoomPrev.disabled = i <= 0;
  el.zoomNext.disabled = i >= state.source.count - 1;
  applyZoomScale();

  if (state.zoomRenderedFor !== i) {
    const target = Math.min(2600, Math.round(el.zoomScroll.clientWidth * 3) || 1800);
    renderChain = renderChain
      .then(() => state.source.render(i, el.zoomCanvas, target))
      .then(() => {
        state.zoomRenderedFor = i;
        applyZoomScale();
      })
      .catch((err) => console.error('[zine] zoom render failed', err));
  }
}

function stepZoomPage(delta) {
  const next = state.zoomIndex + delta;
  if (next < 0 || next >= state.source.count) return;
  state.zoomIndex = next;
  state.zoomFactor = 1;
  state.zoomRenderedFor = -1;
  el.zoomScroll.scrollTo({ top: 0, left: 0 });
  renderZoom();
  goTo(next);
}

/* ---- 이동 -------------------------------------------------------------- */

function goTo(index, animate = false) {
  const clamped = Math.max(0, Math.min(state.source.count - 1, index));
  if (animate) state.flip.flip(clamped);
  else state.flip.turnToPage(clamped);
}

/* ---------------------------------------------------------------- 초기화 */

function buildPages() {
  const frag = document.createDocumentFragment();
  const els = [];
  for (let i = 0; i < state.source.count; i++) {
    const root = document.createElement('div');
    root.className = 'zv-page';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', `소식지 ${pageLabel(i)}`);

    const inner = document.createElement('div');
    inner.className = 'zv-page-in';
    inner.dataset.label = pageLabel(i);

    const canvas = document.createElement('canvas');
    inner.appendChild(canvas);
    root.appendChild(inner);
    frag.appendChild(root);

    els.push(root);
    state.pages.push({ root, inner, canvas, renderedWidth: 0, pending: 0 });
  }
  el.book.appendChild(frag);
  return els;
}

function initFlip(pageEls) {
  const aspect = state.source.aspect;
  const minWidth = Math.round(CONFIG.spreadBreakpoint / 2);

  state.flip = new window.St.PageFlip(el.book, {
    width: Math.round(1000 * aspect),
    height: 1000,
    size: 'stretch',
    minWidth,
    maxWidth: 1400,
    minHeight: Math.round(minWidth / aspect),
    maxHeight: 2000,
    autoSize: false,
    showCover: true,
    usePortrait: true,
    drawShadow: !REDUCE_MOTION,
    maxShadowOpacity: 0.5,
    flippingTime: REDUCE_MOTION ? 200 : 700,
    mobileScrollSupport: false,
    clickEventForward: false,
    swipeDistance: 20,
    startPage: state.index,
  });

  state.flip.on('flip', (e) => {
    state.index = e.data;
    syncUI();
    scheduleRenders();
  });
  state.flip.on('changeState', (e) => {
    el.book.classList.toggle('is-flipping', e.data !== 'read');
  });
  state.flip.on('changeOrientation', () => {
    syncUI();
    scheduleRenders();
  });

  layout(); // 지면을 얹기 전에 책 크기를 먼저 확정합니다.
  state.flip.loadFromHTML(pageEls);
  state.flipLoaded = true;
  layout();
}

function startPageFromUrl(count) {
  const raw = params.get('page') || (location.hash.match(/^#p(\d+)$/) || [])[1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(count, Math.round(n)) - 1;
}

function wireControls() {
  el.prev.addEventListener('click', () => state.flip.flipPrev());
  el.next.addEventListener('click', () => state.flip.flipNext());
  el.first.addEventListener('click', () => goTo(0));
  el.last.addEventListener('click', () => goTo(state.source.count - 1));

  el.slider.addEventListener('input', () => goTo(Number(el.slider.value) - 1));

  el.thumbsBtn.addEventListener('click', () => setThumbsOpen(!state.thumbsOpen));
  el.zoomBtn.addEventListener('click', () => openZoom(visiblePages()[0]));

  el.zoomClose.addEventListener('click', closeZoom);
  el.zoomPrev.addEventListener('click', () => stepZoomPage(-1));
  el.zoomNext.addEventListener('click', () => stepZoomPage(1));
  el.zoomIn.addEventListener('click', () => {
    state.zoomFactor = Math.min(4, state.zoomFactor + 0.5);
    applyZoomScale();
  });
  el.zoomOut.addEventListener('click', () => {
    state.zoomFactor = Math.max(1, state.zoomFactor - 0.5);
    applyZoomScale();
  });

  const supportsFullscreen = !!document.documentElement.requestFullscreen;
  for (const btn of [el.fullBtn, el.embedFullBtn]) {
    if (!btn) continue;
    if (!supportsFullscreen) { btn.hidden = true; continue; }
    btn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.app.requestFullscreen().catch(() => {});
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (state.zoomOpen) {
      if (event.key === 'Escape') { closeZoom(); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { stepZoomPage(-1); event.preventDefault(); }
      if (event.key === 'ArrowRight') { stepZoomPage(1); event.preventDefault(); }
      return;
    }

    switch (event.key) {
      case 'ArrowLeft': case 'PageUp': state.flip.flipPrev(); break;
      case 'ArrowRight': case 'PageDown': case ' ': state.flip.flipNext(); break;
      case 'Home': goTo(0); break;
      case 'End': goTo(state.source.count - 1); break;
      case 'Escape': if (state.thumbsOpen) setThumbsOpen(false); else return; break;
      default: return;
    }
    event.preventDefault();
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    layout();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      scheduleRenders();
      if (state.zoomOpen) applyZoomScale();
    }, 250);
  }).observe(el.bookWrap);
}

function wireEmbedSnippet() {
  if (IS_EMBED || !el.embedCode) return;
  const base = new URL(location.href);
  base.hash = '';
  base.search = '?embed=1';
  const title = `${CONFIG.org} ${CONFIG.title}`.trim();
  el.embedCode.value =
    `<div style="width:100%;max-width:1100px;margin:0 auto;">\n` +
    `  <iframe src="${base.href}"\n` +
    `    title="${title}"\n` +
    `    loading="lazy" allowfullscreen allow="fullscreen"\n` +
    `    style="display:block;width:100%;height:78vh;min-height:420px;max-height:840px;border:0;border-radius:14px;">\n` +
    `  </iframe>\n` +
    `</div>`;

  el.copyBtn.addEventListener('click', async () => {
    el.embedCode.select();
    try {
      await navigator.clipboard.writeText(el.embedCode.value);
    } catch {
      document.execCommand('copy');
    }
    const original = el.copyBtn.textContent;
    el.copyBtn.textContent = '복사됨 ✓';
    setTimeout(() => { el.copyBtn.textContent = original; }, 1800);
  });
}

function showError(message) {
  el.loading.hidden = true;
  el.error.hidden = false;
  el.errorMsg.textContent = message;
}

async function main() {
  el.loadingBar.style.width = '15%';

  let source = null;
  const problems = [];

  if (CONFIG.pdf) {
    try {
      source = await createPdfSource(CONFIG.pdf);
    } catch (err) {
      console.error('[zine] PDF load failed', err);
      problems.push('PDF를 불러오지 못했습니다.');
    }
  }

  if (!source && CONFIG.fallbackPages.length) {
    try {
      source = await createImageSource(CONFIG.fallbackPages);
      console.warn('[zine] falling back to page images');
    } catch (err) {
      console.error('[zine] image fallback failed', err);
      problems.push('대체 이미지도 불러오지 못했습니다.');
    }
  }

  if (!source) {
    showError(
      (problems.join(' ') || '소식지 파일을 찾을 수 없습니다.') +
        ' 잠시 후 다시 시도해 주세요.'
    );
    return;
  }

  state.source = source;
  state.index = startPageFromUrl(source.count);
  el.loadingBar.style.width = '45%';

  el.slider.max = String(source.count);
  el.slider.value = String(state.index + 1);
  el.thumbs.style.setProperty('--page-aspect', String(source.aspect));

  if (CONFIG.pdf && source.kind === 'pdf' && el.downloadBtn) {
    el.downloadBtn.href = CONFIG.pdf;
    if (CONFIG.downloadName) el.downloadBtn.download = CONFIG.downloadName;
  } else if (el.downloadBtn) {
    el.downloadBtn.hidden = true;
  }

  const pageEls = buildPages();
  initFlip(pageEls);
  wireControls();
  wireEmbedSnippet();
  syncUI();

  // 첫 지면을 먼저 그린 뒤 로딩 화면을 걷어냅니다. 썸네일은 그 다음에
  // 만들어야 렌더 순서에서 첫 지면을 앞지르지 않습니다.
  await ensurePage(state.index, targetRenderWidth());
  el.loadingBar.style.width = '100%';
  el.loading.hidden = true;

  scheduleRenders();
  buildThumbs();
}

main().catch((err) => {
  console.error('[zine] fatal', err);
  showError('뷰어를 시작하지 못했습니다. 페이지를 새로고침해 주세요.');
});
