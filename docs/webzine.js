/*!
 * 웹진 뷰어 (junggu-zine) — PDF 주소만 주면 책처럼 넘겨 보여 줍니다.
 *
 * 쓰는 법 — 홈페이지의 HTML 블록에 이 세 줄만 넣으면 됩니다.
 *
 *   <link rel="stylesheet" href=".../webzine.css">
 *   <div class="webzine" data-pdf="/uploads/zine.pdf" data-subtitle="2025 하반기"></div>
 *   <script src=".../webzine.js"></script>
 *
 * PDF 는 이 스크립트가 실행되는 페이지에서 직접 읽습니다. 홈페이지에 올린
 * PDF 를 같은 도메인 주소로 적으면 별도 설정(CORS) 없이 그대로 동작합니다.
 *
 * 지면 넘김: StPageFlip 2.0.7 (MIT, © 2020 Nodlik)
 * PDF 읽기: PDF.js (Apache-2.0, © Mozilla) — jsDelivr 에서 불러옵니다.
 */
(function () {
  'use strict';

  var PDFJS_VERSION = '4.6.82';
  var CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/legacy/build/';

  // 이 스크립트가 놓인 폴더 — page-flip.js 를 같은 곳에서 찾습니다.
  var here = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*$/, '');
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (/webzine\.js(\?|$)/.test(all[i].src)) return all[i].src.replace(/[^/]*$/, '');
    }
    return '';
  })();

  var SVG = {
    prev: '<path d="m15 5-7 7 7 7"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    first: '<path d="m17 5-7 7 7 7"/><path d="M7 5v14"/>',
    last: '<path d="m7 5 7 7-7 7"/><path d="M17 5v14"/>',
    thumbs: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    full: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
    down: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>'
  };
  function icon(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* ---------------------------------------------------------- 외부 스크립트 */

  var loading = {};
  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('불러오지 못했습니다: ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  var pdfjsPromise = null;
  function loadPdfjs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import(CDN + 'pdf.min.mjs').then(function (lib) {
      // 워커는 다른 도메인에 있어 그대로 못 씁니다. 받아서 이 페이지 것으로 만듭니다.
      return fetch(CDN + 'pdf.worker.min.mjs').then(function (res) {
        if (!res.ok) throw new Error('PDF 워커를 받지 못했습니다 (' + res.status + ')');
        return res.blob();
      }).then(function (blob) {
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
        return lib;
      });
    });
    return pdfjsPromise;
  }

  /* ------------------------------------------------------------------ 뷰어 */

  function Viewer(root) {
    this.root = root;
    this.pdfUrl = root.getAttribute('data-pdf') || '';
    this.title = root.getAttribute('data-title') || '';
    this.subtitle = root.getAttribute('data-subtitle') || '';
    this.showDownload = root.getAttribute('data-download') !== 'off';
    this.spreadBreakpoint = Number(root.getAttribute('data-spread')) || 680;
    this.maxWidth = root.getAttribute('data-max-width') || '1136px';

    this.index = 0;
    this.pages = [];
    this.count = 0;
    this.aspect = 0.707;
    this.flipLoaded = false;
    this.thumbsOpen = false;
    this.zoomOpen = false;
    this.zoomIndex = 0;
    this.zoomFactor = 1;
    this.zoomRenderedFor = -1;
    this.renderChain = Promise.resolve();
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  Viewer.prototype.fail = function (msg, detail) {
    this.el.loading.hidden = true;
    this.el.error.hidden = false;
    this.el.errorMsg.textContent = msg;
    this.el.errorCode.textContent = detail || '';
    this.el.errorCode.hidden = !detail;
  };

  Viewer.prototype.buildShell = function () {
    var r = this.root;
    r.classList.add('wz-root');
    if (this.maxWidth && this.maxWidth !== 'none') r.style.maxWidth = this.maxWidth;

    var head = '';
    if (this.title || this.subtitle) {
      head = '<div class="wz-head">' +
        (this.title ? '<h2>' + esc(this.title) + '</h2>' : '') +
        (this.subtitle ? '<p>' + esc(this.subtitle) + '</p>' : '') +
        '<div class="wz-rule" aria-hidden="true"></div></div>';
    }

    r.innerHTML = head +
      '<div class="wz-stage">' +
        '<button type="button" class="wz-arrow prev" aria-label="이전 면">' + icon(SVG.prev) + '</button>' +
        '<div class="wz-book-wrap"><div class="wz-book"></div></div>' +
        '<button type="button" class="wz-arrow next" aria-label="다음 면">' + icon(SVG.next) + '</button>' +
        '<div class="wz-thumbs" data-open="false" aria-hidden="true" aria-label="지면 목록">' +
          '<div class="wz-thumbs-track"></div>' +
        '</div>' +
        '<div class="wz-overlay wz-loading">' +
          '<div><div class="wz-spin" aria-hidden="true"></div>' +
          '<h3>소식지를 불러오는 중입니다</h3><p>잠시만 기다려 주세요.</p>' +
          '<div class="wz-progress" aria-hidden="true"><i></i></div></div>' +
        '</div>' +
        '<div class="wz-overlay wz-error" hidden>' +
          '<div><h3>소식지를 열 수 없습니다</h3><p class="wz-error-msg"></p>' +
          '<code class="wz-error-code" hidden></code></div>' +
        '</div>' +
      '</div>' +
      '<div class="wz-bar">' +
        '<button type="button" class="wz-btn wz-btn-icon wz-first" aria-label="첫 면으로">' + icon(SVG.first) + '</button>' +
        '<span class="wz-counter" aria-hidden="true"></span>' +
        '<button type="button" class="wz-btn wz-btn-icon wz-last" aria-label="마지막 면으로">' + icon(SVG.last) + '</button>' +
        '<input type="range" class="wz-slider" min="1" max="1" value="1" step="1" aria-label="지면 이동" />' +
        '<button type="button" class="wz-btn wz-thumbs-btn" aria-pressed="false">' + icon(SVG.thumbs) +
          '<span class="wz-btn-label">지면 목록</span></button>' +
        '<button type="button" class="wz-btn wz-btn-primary wz-zoom-btn">' + icon(SVG.zoom) +
          '<span class="wz-btn-label">크게 보기</span></button>' +
        '<button type="button" class="wz-btn wz-btn-icon wz-full" aria-label="전체 화면">' + icon(SVG.full) + '</button>' +
        (this.showDownload ? '<a class="wz-btn wz-download" href="' + escAttr(this.pdfUrl) + '" download>' +
          icon(SVG.down) + '<span class="wz-btn-label">PDF 받기</span></a>' : '') +
      '</div>' +
      '<p class="wz-hint">화면을 누르거나 좌우로 넘겨 보세요. 글씨가 작으면 <strong>크게 보기</strong>를 눌러 주세요.</p>' +
      '<div class="wz-zoom" data-open="false" role="dialog" aria-modal="true" aria-label="크게 보기" aria-hidden="true">' +
        '<div class="wz-zoom-bar"><span class="wz-zoom-title"></span>' +
          '<span style="display:flex;gap:8px">' +
            '<button type="button" class="wz-btn wz-btn-icon wz-zout" aria-label="축소">−</button>' +
            '<button type="button" class="wz-btn wz-btn-icon wz-zin" aria-label="확대">＋</button>' +
            '<button type="button" class="wz-btn wz-btn-icon wz-zprev" aria-label="이전 면">‹</button>' +
            '<button type="button" class="wz-btn wz-btn-icon wz-znext" aria-label="다음 면">›</button>' +
            '<button type="button" class="wz-btn wz-zclose">닫기 ✕</button>' +
          '</span></div>' +
        '<div class="wz-zoom-scroll"><canvas class="wz-zoom-canvas"></canvas></div>' +
      '</div>' +
      '<p class="wz-sr" role="status" aria-live="polite"></p>';

    var q = function (sel) { return r.querySelector(sel); };
    this.el = {
      stage: q('.wz-stage'), book: q('.wz-book'), bookWrap: q('.wz-book-wrap'),
      prev: q('.wz-arrow.prev'), next: q('.wz-arrow.next'),
      first: q('.wz-first'), last: q('.wz-last'),
      counter: q('.wz-counter'), slider: q('.wz-slider'),
      thumbs: q('.wz-thumbs'), thumbsTrack: q('.wz-thumbs-track'), thumbsBtn: q('.wz-thumbs-btn'),
      zoomBtn: q('.wz-zoom-btn'), zoom: q('.wz-zoom'), zoomScroll: q('.wz-zoom-scroll'),
      zoomCanvas: q('.wz-zoom-canvas'), zoomTitle: q('.wz-zoom-title'),
      zin: q('.wz-zin'), zout: q('.wz-zout'), zprev: q('.wz-zprev'), znext: q('.wz-znext'),
      zclose: q('.wz-zclose'), full: q('.wz-full'), download: q('.wz-download'),
      loading: q('.wz-loading'), bar: q('.wz-progress i'),
      error: q('.wz-error'), errorMsg: q('.wz-error-msg'), errorCode: q('.wz-error-code'),
      live: q('.wz-sr')
    };
  };

  Viewer.prototype.label = function (i) {
    return i === 0 ? '표지' : (i === this.count - 1 ? '뒷면' : (i + 1) + '면');
  };

  /* ---- 해상도 ---- */

  Viewer.prototype.displayPageWidth = function () {
    var rect = this.flipLoaded && this.flip.getBoundsRect();
    if (rect && rect.pageWidth > 0) return rect.pageWidth;
    var w = this.el.bookWrap.clientWidth || 800;
    return w >= this.spreadBreakpoint ? w / 2 : w;
  };
  Viewer.prototype.targetWidth = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.round(Math.min(2000, Math.max(560, this.displayPageWidth() * dpr)));
  };

  /* ---- 지면 렌더 ---- */

  Viewer.prototype.renderPage = function (index, canvas, targetWidth) {
    var self = this;
    // 같은 page 객체를 동시에 두 번 render 하면 pdf.js 가 실패하므로 한 줄로 세웁니다.
    this.renderChain = this.renderChain.then(function () {
      return self.doc.getPage(index + 1).then(function (page) {
        var unit = page.getViewport({ scale: 1 });
        var vp = page.getViewport({ scale: Math.max(0.1, targetWidth / unit.width) });
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        var ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          page.cleanup();
        });
      });
    }).catch(function (err) { console.error('[webzine] render failed', index, err); });
    return this.renderChain;
  };

  Viewer.prototype.ensurePage = function (index, targetWidth) {
    var p = this.pages[index];
    if (!p) return Promise.resolve();
    if (p.rendered >= targetWidth * 0.9 || p.pending === targetWidth) return Promise.resolve();
    p.pending = targetWidth;
    var self = this;
    return this.renderPage(index, p.canvas, targetWidth).then(function () {
      p.rendered = targetWidth;
      p.root.classList.add('is-ready');
      if (p.pending === targetWidth) p.pending = 0;
      self.el.bar.style.width = Math.round(self.readyCount() / self.count * 100) + '%';
    });
  };

  Viewer.prototype.readyCount = function () {
    var n = 0;
    for (var i = 0; i < this.pages.length; i++) if (this.pages[i].rendered) n++;
    return n;
  };

  Viewer.prototype.scheduleRenders = function () {
    var target = this.targetWidth();
    var self = this;
    var order = this.pages.map(function (_, i) { return i; }).sort(function (a, b) {
      return Math.abs(a - self.index) - Math.abs(b - self.index);
    });
    order.forEach(function (i) { self.ensurePage(i, target); });
  };

  /* ---- 레이아웃 ---- */

  Viewer.prototype.layout = function () {
    var w = this.el.bookWrap.clientWidth, h = this.el.bookWrap.clientHeight;
    if (w < 40 || h < 40) return;
    this.el.book.style.width = w + 'px';
    this.el.book.style.height = h + 'px';
    if (this.flipLoaded) this.flip.update();
  };

  Viewer.prototype.visiblePages = function () {
    var i = this.index;
    if (!this.flipLoaded || this.flip.getOrientation() === 'portrait') return [i];
    if (i === 0) return [0];
    var left = i % 2 === 1 ? i : i - 1;
    return left + 1 < this.count ? [left, left + 1] : [left];
  };

  Viewer.prototype.syncUI = function () {
    var shown = this.visiblePages();
    var text = shown.length === 2 ? (shown[0] + 1) + '–' + (shown[1] + 1) : String(shown[0] + 1);
    this.el.counter.innerHTML = '<b>' + text + '</b> / ' + this.count + '면';
    this.el.slider.value = String(this.index + 1);

    var atStart = this.index <= 0;
    var atEnd = shown[shown.length - 1] >= this.count - 1;
    this.el.prev.disabled = this.el.first.disabled = atStart;
    this.el.next.disabled = this.el.last.disabled = atEnd;

    var kids = this.el.thumbsTrack.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].setAttribute('aria-current',
        shown.indexOf(Number(kids[i].getAttribute('data-i'))) !== -1 ? 'true' : 'false');
    }
    if (this.thumbsOpen) this.revealThumb();
    this.el.live.textContent = text + '면 / 전체 ' + this.count + '면';
  };

  /* ---- 지면 목록 ---- */

  Viewer.prototype.buildThumbs = function () {
    var self = this;
    var frag = document.createDocumentFragment();
    this.el.thumbs.style.setProperty('--wz-aspect', String(this.aspect));
    for (var i = 0; i < this.count; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wz-thumb';
      b.setAttribute('data-i', String(i));
      b.setAttribute('aria-label', this.label(i) + '으로 이동');
      b.innerHTML = '<canvas></canvas><span>' + (i + 1) + '</span>';
      b.addEventListener('click', (function (n) {
        return function () { self.goTo(n); self.setThumbs(false); };
      })(i));
      frag.appendChild(b);
    }
    this.el.thumbsTrack.appendChild(frag);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        self.renderPage(Number(e.target.getAttribute('data-i')), e.target.querySelector('canvas'), 170);
      });
    }, { root: this.el.thumbs, rootMargin: '250px' });
    for (var k = 0; k < this.el.thumbsTrack.children.length; k++) {
      io.observe(this.el.thumbsTrack.children[k]);
    }
  };

  Viewer.prototype.revealThumb = function () {
    var b = this.el.thumbsTrack.querySelector('[aria-current="true"]');
    if (!b) return;
    this.el.thumbs.scrollTo({
      left: Math.max(0, b.offsetLeft - (this.el.thumbs.clientWidth - b.offsetWidth) / 2),
      behavior: this.reduceMotion ? 'auto' : 'smooth'
    });
  };

  Viewer.prototype.setThumbs = function (open) {
    this.thumbsOpen = open;
    this.el.thumbs.setAttribute('data-open', String(open));
    this.el.thumbs.setAttribute('aria-hidden', String(!open));
    this.el.thumbsBtn.setAttribute('aria-pressed', String(open));
    if (open) this.revealThumb();
  };

  /* ---- 크게 보기 ---- */

  Viewer.prototype.openZoom = function (i) {
    this.zoomOpen = true; this.zoomIndex = i; this.zoomFactor = 1; this.zoomRenderedFor = -1;
    this.el.zoom.setAttribute('data-open', 'true');
    this.el.zoom.setAttribute('aria-hidden', 'false');
    this.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.renderZoom();
    this.el.zclose.focus();
  };
  Viewer.prototype.closeZoom = function () {
    this.zoomOpen = false;
    this.el.zoom.setAttribute('data-open', 'false');
    this.el.zoom.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = this.prevOverflow || '';
    this.el.zoomBtn.focus();
  };
  Viewer.prototype.applyZoomScale = function () {
    var box = this.el.zoomScroll;
    var fit = Math.min(box.clientWidth, (box.clientHeight - 16) * this.aspect);
    this.el.zoomCanvas.style.width = Math.round(fit * this.zoomFactor) + 'px';
    this.el.zout.disabled = this.zoomFactor <= 1;
    this.el.zin.disabled = this.zoomFactor >= 4;
  };
  Viewer.prototype.renderZoom = function () {
    var i = this.zoomIndex, self = this;
    this.el.zoomTitle.textContent = this.label(i) + ' (' + (i + 1) + '/' + this.count + ')';
    this.el.zprev.disabled = i <= 0;
    this.el.znext.disabled = i >= this.count - 1;
    this.applyZoomScale();
    if (this.zoomRenderedFor === i) return;
    var target = Math.min(2600, Math.max(1400, Math.round(this.el.zoomScroll.clientWidth * 3)));
    this.renderPage(i, this.el.zoomCanvas, target).then(function () {
      self.zoomRenderedFor = i;
      self.applyZoomScale();
    });
  };
  Viewer.prototype.stepZoom = function (d) {
    var n = this.zoomIndex + d;
    if (n < 0 || n >= this.count) return;
    this.zoomIndex = n; this.zoomFactor = 1; this.zoomRenderedFor = -1;
    this.el.zoomScroll.scrollTo({ top: 0, left: 0 });
    this.renderZoom();
    this.goTo(n);
  };

  Viewer.prototype.goTo = function (n) {
    this.flip.turnToPage(Math.max(0, Math.min(this.count - 1, n)));
  };

  /* ---- 인쇄 ---- */

  Viewer.prototype.buildPrint = function () {
    if (this.printBuilt) return;
    this.printBuilt = true;
    var box = document.createElement('div');
    box.className = 'wz-print';
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < this.count; i++) {
      var c = document.createElement('canvas');
      box.appendChild(c);
      this.renderPage(i, c, 1400);
    }
    this.el.stage.appendChild(box);
  };

  /* ---- 시작 ---- */

  Viewer.prototype.start = function () {
    var self = this;
    this.buildShell();

    if (!this.pdfUrl) {
      this.fail('PDF 주소(data-pdf)가 비어 있습니다.');
      return;
    }

    Promise.all([loadScript(here + 'page-flip.js'), loadPdfjs()])
      .then(function (r) {
        var lib = r[1];
        self.el.bar.style.width = '10%';
        return lib.getDocument({ url: self.pdfUrl, isEvalSupported: false }).promise;
      })
      .then(function (doc) {
        self.doc = doc;
        self.count = doc.numPages;
        return doc.getPage(1);
      })
      .then(function (page) {
        var vp = page.getViewport({ scale: 1 });
        self.aspect = vp.width / vp.height;
        self.el.slider.max = String(self.count);
        self.initFlip();
        self.wire();
        self.syncUI();
        return self.ensurePage(self.index, self.targetWidth());
      })
      .then(function () {
        self.el.loading.hidden = true;
        self.scheduleRenders();
        self.buildThumbs();
      })
      .catch(function (err) {
        console.error('[webzine]', err);
        var msg = 'PDF 를 불러오지 못했습니다.';
        if (err && /Missing|404|Unexpected server response/i.test(String(err.message))) {
          msg = 'PDF 주소를 찾을 수 없습니다. 주소가 맞는지 확인해 주세요.';
        } else if (err && /CORS|cross-origin/i.test(String(err.message))) {
          msg = '다른 도메인의 PDF 는 읽을 수 없습니다. 홈페이지와 같은 주소에 올려 주세요.';
        }
        self.fail(msg, self.pdfUrl);
      });
  };

  Viewer.prototype.initFlip = function () {
    var self = this;
    var minWidth = Math.round(this.spreadBreakpoint / 2);

    var frag = document.createDocumentFragment();
    var els = [];
    for (var i = 0; i < this.count; i++) {
      var root = document.createElement('div');
      root.className = 'wz-page';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', '소식지 ' + this.label(i));
      var inner = document.createElement('div');
      inner.className = 'wz-page-in';
      inner.setAttribute('data-label', this.label(i));
      var canvas = document.createElement('canvas');
      inner.appendChild(canvas);
      root.appendChild(inner);
      frag.appendChild(root);
      els.push(root);
      this.pages.push({ root: root, canvas: canvas, rendered: 0, pending: 0 });
    }
    this.el.book.appendChild(frag);

    this.flip = new window.St.PageFlip(this.el.book, {
      width: Math.round(1000 * this.aspect), height: 1000,
      size: 'stretch',
      minWidth: minWidth, maxWidth: 1400,
      minHeight: Math.round(minWidth / this.aspect), maxHeight: 2000,
      autoSize: false, showCover: true, usePortrait: true,
      drawShadow: !this.reduceMotion, maxShadowOpacity: 0.5,
      flippingTime: this.reduceMotion ? 200 : 700,
      mobileScrollSupport: false, clickEventForward: false, swipeDistance: 20,
      startPage: 0
    });

    this.flip.on('flip', function (e) { self.index = e.data; self.syncUI(); self.scheduleRenders(); });
    this.flip.on('changeOrientation', function () { self.syncUI(); self.scheduleRenders(); });
    this.flip.on('changeState', function (e) {
      self.el.book.classList.toggle('is-flipping', e.data !== 'read');
    });

    this.layout();
    this.flip.loadFromHTML(els);
    // page-flip 이 책 요소에 박아 넣는 min-width/min-height 를 지웁니다.
    // 낮은 화면에서 우리가 정한 크기를 이겨 지면이 잘립니다.
    this.el.book.style.minWidth = '0px';
    this.el.book.style.minHeight = '0px';
    this.flipLoaded = true;
    this.layout();
  };

  Viewer.prototype.wire = function () {
    var self = this, el = this.el;

    el.prev.addEventListener('click', function () { self.flip.flipPrev(); });
    el.next.addEventListener('click', function () { self.flip.flipNext(); });
    el.first.addEventListener('click', function () { self.goTo(0); });
    el.last.addEventListener('click', function () { self.goTo(self.count - 1); });
    el.slider.addEventListener('input', function () { self.goTo(Number(el.slider.value) - 1); });
    el.thumbsBtn.addEventListener('click', function () { self.setThumbs(!self.thumbsOpen); });
    el.zoomBtn.addEventListener('click', function () { self.openZoom(self.visiblePages()[0]); });
    el.zclose.addEventListener('click', function () { self.closeZoom(); });
    el.zprev.addEventListener('click', function () { self.stepZoom(-1); });
    el.znext.addEventListener('click', function () { self.stepZoom(1); });
    el.zin.addEventListener('click', function () {
      self.zoomFactor = Math.min(4, self.zoomFactor + 0.5); self.applyZoomScale();
    });
    el.zout.addEventListener('click', function () {
      self.zoomFactor = Math.max(1, self.zoomFactor - 0.5); self.applyZoomScale();
    });

    if (!self.root.requestFullscreen) el.full.hidden = true;
    else el.full.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else self.root.requestFullscreen().catch(function () {});
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (self.zoomOpen) {
        if (e.key === 'Escape') { self.closeZoom(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { self.stepZoom(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { self.stepZoom(1); e.preventDefault(); }
        return;
      }
      // 화면에 여러 웹진이 있을 수 있으니, 보이는 것만 키보드를 받습니다.
      var r = self.root.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      switch (e.key) {
        case 'ArrowLeft': case 'PageUp': self.flip.flipPrev(); break;
        case 'ArrowRight': case 'PageDown': self.flip.flipNext(); break;
        case 'Home': self.goTo(0); break;
        case 'End': self.goTo(self.count - 1); break;
        case 'Escape': if (self.thumbsOpen) self.setThumbs(false); else return; break;
        default: return;
      }
      e.preventDefault();
    });

    var t = 0;
    var onResize = function () {
      self.layout();
      clearTimeout(t);
      t = setTimeout(function () {
        self.scheduleRenders();
        if (self.zoomOpen) self.applyZoomScale();
      }, 250);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(el.bookWrap);
    else window.addEventListener('resize', onResize);

    window.addEventListener('beforeprint', function () { self.buildPrint(); });
  };

  /* ---------------------------------------------------------------- 자동 시작 */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function initAll() {
    var nodes = document.querySelectorAll('.webzine[data-pdf], [data-webzine]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-wz-init')) continue;
      nodes[i].setAttribute('data-wz-init', '1');
      new Viewer(nodes[i]).start();
    }
  }

  window.Webzine = { init: initAll, Viewer: Viewer };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
