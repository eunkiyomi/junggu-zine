/*
 * 웹진 뷰어 — 지면 이미지를 StPageFlip 에 얹어 책처럼 넘깁니다.
 *
 * 이 파일은 build_webzine.py 가 결과 HTML 안에 그대로 넣습니다.
 * 외부 파일을 전혀 읽지 않으므로(이미지도 data: URI) 파일을 두 번 눌러
 * 바로 열어 볼 수 있고, 스크립트를 막아 둔 사이트 안에서도 동작합니다.
 *
 * 지면 데이터는 window.WEBZINE 에 들어 있습니다(빌더가 채웁니다).
 */
(function () {
  'use strict';

  var CFG = window.WEBZINE || {};
  var PAGES = CFG.pages || [];
  if (!PAGES.length) return;

  var params = new URLSearchParams(location.search);
  var BARE = params.has('bare') && params.get('bare') !== '0';
  if (BARE) document.documentElement.classList.add('is-bare');

  var REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPREAD_BREAKPOINT = CFG.spreadBreakpoint || 680;

  function $(id) { return document.getElementById(id); }

  var el = {
    book: $('mzBook'), bookWrap: $('mzBookWrap'),
    prev: $('mzPrev'), next: $('mzNext'),
    first: $('mzFirst'), last: $('mzLast'),
    counter: $('mzCounter'), slider: $('mzSlider'),
    thumbsBtn: $('mzThumbsBtn'), thumbs: $('mzThumbs'), thumbsTrack: $('mzThumbsTrack'),
    zoomBtn: $('mzZoomBtn'), zoom: $('mzZoom'), zoomScroll: $('mzZoomScroll'),
    zoomImg: $('mzZoomImg'), zoomTitle: $('mzZoomTitle'),
    zoomIn: $('mzZoomIn'), zoomOut: $('mzZoomOut'), zoomClose: $('mzZoomClose'),
    zoomPrev: $('mzZoomPrev'), zoomNext: $('mzZoomNext'),
    fullBtn: $('mzFullBtn'), download: $('mzDownload'),
    live: $('mzLive'), root: $('mzRoot')
  };

  var state = {
    flip: null, loaded: false, index: 0,
    thumbsOpen: false, zoomOpen: false, zoomIndex: 0, zoomFactor: 1
  };

  var COUNT = PAGES.length;
  var ASPECT = CFG.aspect || 0.707;

  function label(i) { return PAGES[i].label || (i + 1) + '면'; }

  /* ---------- 지면 만들기 ---------- */

  function buildPages() {
    var frag = document.createDocumentFragment();
    var els = [];
    for (var i = 0; i < COUNT; i++) {
      var page = document.createElement('div');
      page.className = 'mz-page';
      page.setAttribute('role', 'img');
      page.setAttribute('aria-label', label(i));

      var img = document.createElement('img');
      img.src = PAGES[i].src;
      img.alt = '';
      // 첫 펼침면 말고는 브라우저가 알아서 늦게 처리하도록 둡니다.
      img.decoding = i < 3 ? 'sync' : 'async';
      img.draggable = false;

      page.appendChild(img);
      frag.appendChild(page);
      els.push(page);
    }
    el.book.appendChild(frag);
    return els;
  }

  /* ---------- 크기 ---------- */

  function layout() {
    var w = el.bookWrap.clientWidth;
    var h = el.bookWrap.clientHeight;
    if (w < 40 || h < 40) return;
    el.book.style.width = w + 'px';
    el.book.style.height = h + 'px';
    // update() 는 loadFromHTML 이후에만 쓸 수 있습니다.
    if (state.loaded) state.flip.update();
  }

  /* ---------- 현재 보이는 면 ---------- */

  function visiblePages() {
    var i = state.index;
    if (!state.flip || state.flip.getOrientation() === 'portrait') return [i];
    if (i === 0) return [0];
    var left = i % 2 === 1 ? i : i - 1;
    return left + 1 < COUNT ? [left, left + 1] : [left];
  }

  function announce(msg) { if (el.live) el.live.textContent = msg; }

  function syncUI() {
    var shown = visiblePages();
    var text = shown.length === 2 ? (shown[0] + 1) + '–' + (shown[1] + 1) : String(shown[0] + 1);

    el.counter.innerHTML = '<b>' + text + '</b> / ' + COUNT + '면';
    el.slider.value = String(state.index + 1);

    var atStart = state.index <= 0;
    var atEnd = shown[shown.length - 1] >= COUNT - 1;
    el.prev.disabled = atStart;
    el.first.disabled = atStart;
    el.next.disabled = atEnd;
    el.last.disabled = atEnd;

    var kids = el.thumbsTrack.children;
    for (var i = 0; i < kids.length; i++) {
      var idx = Number(kids[i].getAttribute('data-index'));
      kids[i].setAttribute('aria-current', shown.indexOf(idx) !== -1 ? 'true' : 'false');
    }
    if (state.thumbsOpen) revealCurrentThumb();

    announce(text + '면 / 전체 ' + COUNT + '면');

    var hash = '#p' + (state.index + 1);
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch (e) { /* file:// 등 */ }
    }
  }

  /* ---------- 지면 목록 ---------- */

  function buildThumbs() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < COUNT; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mz-thumb';
      btn.setAttribute('data-index', String(i));
      btn.setAttribute('aria-label', label(i) + '으로 이동');

      var img = document.createElement('img');
      img.src = PAGES[i].thumb || PAGES[i].src;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 78;
      img.height = Math.round(78 / ASPECT);

      var num = document.createElement('span');
      num.textContent = String(i + 1);

      btn.appendChild(img);
      btn.appendChild(num);
      btn.addEventListener('click', (function (n) {
        return function () { goTo(n); setThumbsOpen(false); };
      })(i));
      frag.appendChild(btn);
    }
    el.thumbsTrack.appendChild(frag);
  }

  function revealCurrentThumb() {
    var btn = el.thumbsTrack.querySelector('[aria-current="true"]');
    if (!btn) return;
    var left = btn.offsetLeft - (el.thumbs.clientWidth - btn.offsetWidth) / 2;
    el.thumbs.scrollTo({ left: Math.max(0, left), behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  }

  function setThumbsOpen(open) {
    state.thumbsOpen = open;
    el.thumbs.setAttribute('data-open', String(open));
    el.thumbs.setAttribute('aria-hidden', String(!open));
    el.thumbsBtn.setAttribute('aria-pressed', String(open));
    if (open) revealCurrentThumb();
  }

  /* ---------- 크게 보기 ---------- */

  function openZoom(i) {
    state.zoomOpen = true;
    state.zoomIndex = i;
    state.zoomFactor = 1;
    el.zoom.setAttribute('data-open', 'true');
    el.zoom.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderZoom();
    el.zoomClose.focus();
  }

  function closeZoom() {
    state.zoomOpen = false;
    el.zoom.setAttribute('data-open', 'false');
    el.zoom.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    el.zoomBtn.focus();
  }

  function applyZoomScale() {
    var box = el.zoomScroll;
    var fit = Math.min(box.clientWidth, (box.clientHeight - 16) * ASPECT);
    el.zoomImg.style.width = Math.round(fit * state.zoomFactor) + 'px';
    el.zoomOut.disabled = state.zoomFactor <= 1;
    el.zoomIn.disabled = state.zoomFactor >= 4;
  }

  function renderZoom() {
    var i = state.zoomIndex;
    el.zoomImg.src = PAGES[i].src;
    el.zoomImg.alt = label(i);
    el.zoomTitle.textContent = label(i) + ' (' + (i + 1) + '/' + COUNT + ')';
    el.zoomPrev.disabled = i <= 0;
    el.zoomNext.disabled = i >= COUNT - 1;
    applyZoomScale();
  }

  function stepZoomPage(delta) {
    var next = state.zoomIndex + delta;
    if (next < 0 || next >= COUNT) return;
    state.zoomIndex = next;
    state.zoomFactor = 1;
    el.zoomScroll.scrollTo({ top: 0, left: 0 });
    renderZoom();
    goTo(next);
  }

  /* ---------- 이동 ---------- */

  function goTo(index) {
    var n = Math.max(0, Math.min(COUNT - 1, index));
    state.flip.turnToPage(n);
  }

  /* ---------- 초기화 ---------- */

  function startPage() {
    var raw = params.get('page');
    if (!raw) {
      var m = /^#p(\d+)$/.exec(location.hash);
      raw = m && m[1];
    }
    var n = Number(raw);
    if (!isFinite(n) || n < 1) return 0;
    return Math.min(COUNT, Math.round(n)) - 1;
  }

  function initFlip(pageEls) {
    var minWidth = Math.round(SPREAD_BREAKPOINT / 2);

    state.index = startPage();
    state.flip = new window.St.PageFlip(el.book, {
      width: Math.round(1000 * ASPECT),
      height: 1000,
      size: 'stretch',
      minWidth: minWidth,
      maxWidth: 1400,
      minHeight: Math.round(minWidth / ASPECT),
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
      startPage: state.index
    });

    state.flip.on('flip', function (e) { state.index = e.data; syncUI(); });
    state.flip.on('changeOrientation', function () { syncUI(); });
    state.flip.on('changeState', function (e) {
      el.book.classList.toggle('is-flipping', e.data !== 'read');
    });

    layout();
    state.flip.loadFromHTML(pageEls);

    // page-flip 이 loadFromHTML 에서 책 요소에 min-width/min-height 를 직접 박아
    // 넣습니다. 좁거나 낮은 화면에서 그 값이 우리가 정한 크기를 이겨 지면이
    // 잘리므로 지웁니다. 크기는 layout() 이 전부 책임집니다.
    // (펼침/한 면 판단은 CSS 가 아니라 설정값 minWidth 로 하므로 영향 없습니다.)
    el.book.style.minWidth = '0px';
    el.book.style.minHeight = '0px';

    state.loaded = true;
    layout();
  }

  /* ---------- PDF 받기 ----------
   * data: 주소는 브라우저가 download 속성의 파일 이름을 무시하고 "download" 로
   * 저장해 버립니다. 누를 때 Blob 으로 바꿔서 한글 파일 이름을 지킵니다.
   */
  function wireDownload() {
    var pdf = CFG.pdf;
    if (!pdf || !pdf.src || !el.download) return;

    el.download.hidden = false;
    el.download.href = pdf.src;
    if (pdf.name) el.download.setAttribute('download', pdf.name);

    var isData = pdf.src.slice(0, 5) === 'data:';
    if (!isData || !window.Blob || !window.URL || !URL.createObjectURL) return;

    el.download.addEventListener('click', function (e) {
      var blob;
      try {
        var comma = pdf.src.indexOf(',');
        var bin = atob(pdf.src.slice(comma + 1));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: 'application/pdf' });
      } catch (err) {
        return; // 변환에 실패하면 원래 data: 주소로 그냥 진행
      }
      e.preventDefault();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = pdf.name || 'webzine.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    });
  }

  function wire() {
    wireDownload();

    el.prev.addEventListener('click', function () { state.flip.flipPrev(); });
    el.next.addEventListener('click', function () { state.flip.flipNext(); });
    el.first.addEventListener('click', function () { goTo(0); });
    el.last.addEventListener('click', function () { goTo(COUNT - 1); });
    el.slider.addEventListener('input', function () { goTo(Number(el.slider.value) - 1); });

    el.thumbsBtn.addEventListener('click', function () { setThumbsOpen(!state.thumbsOpen); });
    el.zoomBtn.addEventListener('click', function () { openZoom(visiblePages()[0]); });

    el.zoomClose.addEventListener('click', closeZoom);
    el.zoomPrev.addEventListener('click', function () { stepZoomPage(-1); });
    el.zoomNext.addEventListener('click', function () { stepZoomPage(1); });
    el.zoomIn.addEventListener('click', function () {
      state.zoomFactor = Math.min(4, state.zoomFactor + 0.5); applyZoomScale();
    });
    el.zoomOut.addEventListener('click', function () {
      state.zoomFactor = Math.max(1, state.zoomFactor - 0.5); applyZoomScale();
    });

    if (el.fullBtn) {
      if (!el.root.requestFullscreen) {
        el.fullBtn.hidden = true;
      } else {
        el.fullBtn.addEventListener('click', function () {
          if (document.fullscreenElement) document.exitFullscreen();
          else el.root.requestFullscreen().catch(function () {});
        });
      }
    }

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (state.zoomOpen) {
        if (e.key === 'Escape') { closeZoom(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { stepZoomPage(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { stepZoomPage(1); e.preventDefault(); }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft': case 'PageUp': state.flip.flipPrev(); break;
        case 'ArrowRight': case 'PageDown': case ' ': state.flip.flipNext(); break;
        case 'Home': goTo(0); break;
        case 'End': goTo(COUNT - 1); break;
        case 'Escape': if (state.thumbsOpen) setThumbsOpen(false); else return; break;
        default: return;
      }
      e.preventDefault();
    });

    var timer = 0;
    var onResize = function () {
      layout();
      clearTimeout(timer);
      timer = setTimeout(function () { if (state.zoomOpen) applyZoomScale(); }, 200);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(el.bookWrap);
    else window.addEventListener('resize', onResize);
  }

  /* ---------- 인쇄 ----------
   * 화면에는 펼친 면만 보이므로, 인쇄할 때만 전체 지면을 쌓아 둔 영역을
   * 만들어 줍니다. 같은 data: 주소를 다시 쓰므로 파일이 커지지 않습니다.
   */
  function buildPrintView() {
    if (document.querySelector('.mz-print')) return;
    var box = document.createElement('div');
    box.className = 'mz-print';
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < COUNT; i++) {
      var img = document.createElement('img');
      img.src = PAGES[i].src;
      img.alt = label(i);
      box.appendChild(img);
    }
    document.getElementById('mzStage').appendChild(box);
  }

  function wirePrint() {
    if (window.matchMedia) {
      var mq = window.matchMedia('print');
      var onChange = function (e) { if (e.matches) buildPrintView(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    window.addEventListener('beforeprint', buildPrintView);
  }

  function start() {
    el.slider.max = String(COUNT);
    initFlip(buildPages());
    buildThumbs();
    wire();
    wirePrint();
    syncUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
