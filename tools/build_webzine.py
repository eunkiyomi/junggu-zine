#!/usr/bin/env python3
"""소식지 PDF → 웹진 HTML 한 파일.

PDF(또는 지면 이미지들)를 읽어 각 면을 이미지로 굽고, 뷰어 스크립트·스타일과
함께 **하나의 HTML 파일**로 묶습니다. 외부 요청이 전혀 없어서

  * 기관 홈페이지 서버에 이 파일 하나만 올리면 되고,
  * 파일을 두 번 눌러 브라우저에서 바로 확인할 수 있으며,
  * 외부 스크립트를 막아 둔 사이트 안에서도 그대로 동작합니다.

쓰는 법:

    pip install pymupdf
    python3 tools/build_webzine.py zine/junggu-zine-2025-2H.pdf \\
        --out dist/webzine-2025-2H.html \\
        --subtitle "2025 하반기 소식지 · 통권 제1호"

    # 지면 이미지에서 바로 만들 수도 있습니다
    python3 tools/build_webzine.py "zine/*.jpg" --out dist/webzine.html

자세한 설명은 저장소 README.md 를 보세요.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import glob
import html
import io
import json
import os
import re
import sys

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template")

# 표지·뒷면은 번호 대신 이렇게 부릅니다.
COVER_LABEL = "표지"
BACK_LABEL = "뒷면"

DEFAULT_FOOTER = [
    "사회복지법인 한밀 · 서울시중구재가노인복지기관",
    "(04583) 서울시 중구 다산로42길 126, 1층 / 대표자 : 박지훈",
    "전화 02-2231-3382 · 이메일 jgsilver25@naver.com",
]
DEFAULT_COPYRIGHT = "© 2025 서울시중구재가노인복지기관. All Rights Reserved."


# --------------------------------------------------------------------------- 입력


def resolve_inputs(pattern: str) -> tuple[str, list[str]]:
    """입력이 PDF 하나인지, 이미지 여러 장인지 가려냅니다."""
    if os.path.isdir(pattern):
        pattern = os.path.join(pattern, "*")

    matches = sorted(glob.glob(pattern)) if any(c in pattern for c in "*?[") else [pattern]
    matches = [m for m in matches if os.path.isfile(m)]
    if not matches:
        sys.exit(f"입력을 찾을 수 없습니다: {pattern}")

    if len(matches) == 1 and matches[0].lower().endswith(".pdf"):
        return "pdf", matches

    images = [m for m in matches if m.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"))]
    if not images:
        sys.exit(f"PDF도 이미지도 아닙니다: {pattern}")
    return "images", images


def natural_width(page) -> int | None:
    """지면에 박혀 있는 이미지의 원래 가로 픽셀 수 중 가장 큰 값.

    스캔본처럼 '한 면 = 이미지 한 장'인 PDF에서, 원본보다 크게 뽑아
    파일만 무거워지는 일을 막는 데 씁니다.
    """
    widths = [info[2] for info in page.get_images(full=True) if info[2]]
    return max(widths) if widths else None


def render_pages(kind: str, paths: list[str], want_width, quality: int, fmt: str, verbose: bool):
    """각 면을 (바이트, 가로, 세로) 로 만들어 돌려줍니다."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        sys.exit("PyMuPDF 가 필요합니다.  pip install pymupdf")

    docs = [fitz.open(paths[0])] if kind == "pdf" else [fitz.open(p) for p in paths]
    out = []

    for doc in docs:
        for page in doc:
            base_w = page.rect.width
            if want_width == "auto":
                nat = natural_width(page)
                target = min(1600, max(900, nat)) if nat else 1400
                if nat:
                    target = min(target, nat)  # 원본보다 크게 뽑지 않습니다
            else:
                target = int(want_width)

            zoom = target / base_w
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            data = encode(pix, fmt, quality)
            out.append((data, pix.width, pix.height))
            if verbose:
                print(f"  {len(out):>3}면  {pix.width}×{pix.height}  {len(data) / 1024:,.0f} KB")

    for doc in docs:
        doc.close()
    return out


def encode(pix, fmt: str, quality: int) -> bytes:
    if fmt == "jpeg":
        return pix.tobytes("jpeg", jpg_quality=quality)
    # webp 는 PyMuPDF 가 못 만들어서 Pillow 를 씁니다.
    try:
        from PIL import Image
    except ImportError:
        sys.exit("--format webp 에는 Pillow 가 필요합니다.  pip install pillow")
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=5)
    return buf.getvalue()


def thumbnail(pix_bytes: bytes, fmt: str) -> bytes:
    """지면 목록용 작은 이미지. Pillow 가 없으면 원본을 그대로 씁니다."""
    try:
        from PIL import Image
    except ImportError:
        return pix_bytes
    img = Image.open(io.BytesIO(pix_bytes))
    img.thumbnail((200, 200 * 4), Image.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "WEBP" if fmt == "webp" else "JPEG", quality=70)
    return buf.getvalue()


# --------------------------------------------------------------------------- 조립


def data_uri(payload: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


# --------------------------------------------------------------------------- 글꼴

FONT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts",
                         "PretendardVariable.woff2")
FONT_FAMILY = "PretendardZine"

# 기관 홈페이지는 Pretendard 를 CDN 에서 받아 씁니다. 이 파일은 외부 요청을 하지
# 않으므로, 화면에 실제로 쓰이는 글자만 잘라내(subset) 파일 안에 넣습니다.
# 그래야 홈페이지와 글꼴이 똑같아 보입니다.
FONT_NOTICE = (
    "Pretendard: Copyright (c) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard.\n"
    "     SIL Open Font License 1.1 — https://github.com/orioncactus/pretendard\n"
    "     아래 글꼴은 이 문서에 쓰인 글자만 남긴 부분집합(subset)입니다."
)


def ui_characters(template: str, extra: list[str]) -> str:
    """결과 화면에 실제로 보일 글자를 모읍니다(스크립트·스타일·주석 제외)."""
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", template, flags=re.S | re.I)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"__[A-Z_]+__", " ", text)
    text = html.unescape(text)

    chars = set(text)
    for item in extra:
        chars |= set(item or "")
    # 숫자·기본 문장부호는 쪽수 표시 등에 늘 필요합니다.
    chars |= set("0123456789 ·–—-/()[]{}<>%.,:;!?'\"…×＋−‹›✕✓&@#*+=_|~")
    chars |= set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    chars.discard("\n")
    chars.discard("\t")
    return "".join(sorted(chars))


def subset_font(chars: str, verbose: bool) -> str | None:
    """쓰이는 글자만 남긴 woff2 를 data: 주소로 돌려줍니다."""
    if not os.path.exists(FONT_PATH):
        if verbose:
            print(f"  글꼴 원본이 없어 건너뜁니다: {FONT_PATH}")
        return None
    try:
        from fontTools import subset as ftsubset
    except ImportError:
        if verbose:
            print("  fonttools 가 없어 글꼴을 넣지 않습니다 (pip install fonttools brotli)")
        return None

    opts = ftsubset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    opts.notdef_outline = True
    opts.drop_tables += ["DSIG"]

    font = ftsubset.load_font(FONT_PATH, opts)
    subsetter = ftsubset.Subsetter(options=opts)
    subsetter.populate(text=chars)
    subsetter.subset(font)

    buf = io.BytesIO()
    ftsubset.save_font(font, buf, opts)
    font.close()

    data = buf.getvalue()
    if verbose:
        print(f"  글꼴 subset: {len(chars)}자 → {len(data) / 1024:,.0f} KB")
    return data_uri(data, "font/woff2")


def font_face_css(src: str | None) -> str:
    if not src:
        return "/* 내장 글꼴 없음 — CDN 또는 기기에 설치된 글꼴로 표시됩니다. */"
    return (
        f"/*\n     {FONT_NOTICE}\n  */\n"
        "@font-face {\n"
        f"  font-family: '{FONT_FAMILY}';\n"
        "  font-weight: 45 930;\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        f"  src: url({src}) format('woff2-variations');\n"
        "}"
    )


# 기관 홈페이지가 쓰는 것과 같은 주소·같은 버전입니다.
PRETENDARD_CDN = (
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.6"
    "/dist/web/variable/pretendardvariable.css"
)


def font_link_html(use_cdn: bool) -> str:
    if not use_cdn:
        return "<!-- 글꼴 CDN 을 쓰지 않습니다: 외부 요청이 전혀 없습니다. -->"
    return (
        '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />\n'
        f'<link rel="stylesheet" href="{PRETENDARD_CDN}" />'
    )


def read_template(name: str) -> str:
    with open(os.path.join(TEMPLATE_DIR, name), encoding="utf-8") as fh:
        return fh.read()


def build_labels(count: int) -> list[str]:
    labels = [f"{i + 1}면" for i in range(count)]
    if count >= 1:
        labels[0] = COVER_LABEL
    if count >= 2:
        labels[-1] = BACK_LABEL
    return labels


def footer_html(lines: list[str], copyright_line: str) -> str:
    body = "\n".join(f"    <p>{html.escape(line)}</p>" for line in lines if line.strip())
    if copyright_line.strip():
        body += f'\n    <p class="mz-copy">{html.escape(copyright_line)}</p>'
    return body


# --------------------------------------------------------------------------- 빌더

# 담당자가 브라우저에서 새 PDF 로 웹진을 다시 만들 때 쓰는 pdf.js.
# 빌더를 여는 사람만 내려받습니다. 완성된 웹진을 읽는 분들과는 무관합니다.
PDFJS_VERSION = "4.6.82"
PDFJS_LIB = f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VERSION}/legacy/build/pdf.min.mjs"
PDFJS_WORKER = f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs"


def b64_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def build_builder_page(style: str, font_link: str, footer: str, favicon: str,
                       heading: str) -> str:
    """새 PDF 로 웹진을 다시 만드는 도구 페이지(브라우저에서 동작)."""
    return substitute(read_template("builder.html"), {
        "__TPL_PAGE__": b64_text(read_template("page.html")),
        "__TPL_CSS__": b64_text(style),
        "__TPL_JS__": b64_text(read_template("viewer.js")),
        "__TPL_FLIP__": b64_text(read_template("page-flip.js")),
        "__TPL_FONTLINK__": b64_text(font_link),
        "__TPL_FOOTER__": b64_text(footer),
        "__TPL_FAVICON__": favicon,
        "__DEF_HEADING__": html.escape(heading, quote=True),
        "__PDFJS_LIB__": PDFJS_LIB,
        "__PDFJS_WORKER__": PDFJS_WORKER,
    })


def substitute(template: str, mapping: dict[str, str]) -> str:
    """__KEY__ 를 값으로 바꿉니다.

    값 안에 다른 __KEY__ 처럼 보이는 글자가 있어도 다시 치환되지 않도록
    정규식 한 번으로 처리합니다(스크립트·base64 안에 우연히 들어갈 수 있음).
    """
    pattern = re.compile("|".join(re.escape(k) for k in mapping))
    return pattern.sub(lambda m: mapping[m.group(0)], template)


# --------------------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(
        description="소식지 PDF(또는 지면 이미지)를 웹진 HTML 한 파일로 만듭니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("input", help="PDF 파일, 이미지 글롭(\"zine/*.jpg\"), 또는 폴더")
    ap.add_argument("-o", "--out", default="dist/webzine.html", help="결과 HTML 경로")
    ap.add_argument("--heading", default="웹진", help="화면 맨 위 큰 제목 (기본: 웹진)")
    ap.add_argument("--subtitle", default="", help="제목 아래 한 줄 설명")
    ap.add_argument("--title", default="", help="브라우저 탭 제목 (기본: 제목 · 설명)")
    ap.add_argument(
        "--width",
        default="auto",
        help="한 면을 몇 픽셀로 구울지. auto 면 원본 해상도에 맞춥니다 (기본: auto)",
    )
    ap.add_argument("--quality", type=int, default=82, help="이미지 품질 1-100 (기본: 82)")
    ap.add_argument("--format", choices=("jpeg", "webp"), default="jpeg", help="지면 이미지 형식")
    ap.add_argument("--pdf-url", default="", help="'PDF 받기' 가 가리킬 주소 (따로 올린 PDF)")
    ap.add_argument(
        "--embed-pdf",
        action="store_true",
        help="PDF 원본까지 HTML 안에 넣어 'PDF 받기' 를 만듭니다 (파일이 그만큼 커집니다)",
    )
    ap.add_argument(
        "--download-name",
        default="",
        help="내려받을 때 쓸 PDF 파일 이름 (기본: 원본 PDF 파일명). "
             "브라우저가 한글 파일 이름을 'download' 로 바꿔 버리는 경우가 있어 영문 이름을 권합니다",
    )
    ap.add_argument(
        "--font",
        choices=("auto", "embed", "cdn", "none"),
        default="auto",
        help="글꼴 처리 방식. auto=홈페이지와 같은 Pretendard CDN 연결 + 내장 subset 예비"
             " / embed=내장만(외부 요청 0) / cdn=연결만 / none=기기 글꼴 (기본: auto)",
    )
    ap.add_argument("--footer", action="append", default=[], help="푸터 줄 (여러 번 쓸 수 있음)")
    ap.add_argument("--copyright", default=DEFAULT_COPYRIGHT, help="푸터 맨 아래 저작권 줄")
    ap.add_argument(
        "--emit-builder",
        default="",
        help="담당자가 새 PDF 로 웹진을 다시 만들 수 있는 도구 페이지를 함께 만듭니다"
             " (예: dist/package/웹진-만들기.html)",
    )
    ap.add_argument("-q", "--quiet", action="store_true", help="진행 상황을 적게 출력")
    args = ap.parse_args()

    verbose = not args.quiet
    kind, paths = resolve_inputs(args.input)

    if verbose:
        print(f"입력: {kind} — {', '.join(os.path.basename(p) for p in paths[:4])}"
              f"{' …' if len(paths) > 4 else ''}")
        print("지면 굽는 중…")

    rendered = render_pages(kind, paths, args.width, args.quality, args.format, verbose)
    if not rendered:
        sys.exit("지면을 하나도 만들지 못했습니다.")

    mime = "image/webp" if args.format == "webp" else "image/jpeg"
    labels = build_labels(len(rendered))
    first_w, first_h = rendered[0][1], rendered[0][2]

    pages = []
    for (data, _w, _h), lab in zip(rendered, labels):
        pages.append({
            "src": data_uri(data, mime),
            "thumb": data_uri(thumbnail(data, args.format), mime),
            "label": lab,
        })

    # PDF 받기 버튼
    pdf_href, pdf_name = "", ""
    if args.embed_pdf:
        if kind != "pdf":
            sys.exit("--embed-pdf 는 입력이 PDF 일 때만 쓸 수 있습니다.")
        with open(paths[0], "rb") as fh:
            pdf_href = data_uri(fh.read(), "application/pdf")
        pdf_name = args.download_name or os.path.basename(paths[0])
    elif args.pdf_url:
        pdf_href = args.pdf_url
        pdf_name = args.download_name or os.path.basename(args.pdf_url)

    subtitle = args.subtitle or f"전 {len(pages)}면"
    tab_title = args.title or (f"{args.heading} · {subtitle}" if subtitle else args.heading)
    footer_lines = args.footer or DEFAULT_FOOTER

    data = {
        "pages": pages,
        "aspect": round(first_w / first_h, 6),
        "spreadBreakpoint": 680,
    }
    if pdf_href:
        data["pdf"] = {"src": pdf_href, "name": pdf_name}
        if verbose and not pdf_name.isascii():
            print(f"  참고: 내려받기 이름에 한글이 있습니다({pdf_name}).")
            print("        브라우저에 따라 'download' 로 저장될 수 있으니 영문 이름을 권합니다.")

    # 글꼴 — 홈페이지와 같아 보이게. 기본은 CDN 연결 + 내장 subset(예비).
    template_html = read_template("page.html")
    want_embed = args.font in ("auto", "embed")
    want_cdn = args.font in ("auto", "cdn")
    font_src = None
    if want_embed:
        chars = ui_characters(
            template_html,
            [args.heading, subtitle, tab_title, args.copyright, pdf_name]
            + labels + footer_lines,
        )
        font_src = subset_font(chars, verbose)

    style = read_template("viewer.css").replace("__FONT_FACE__", font_face_css(font_src))
    font_link = font_link_html(want_cdn)
    footer = footer_html(footer_lines, args.copyright)

    page = substitute(template_html, {
        "__TITLE__": html.escape(tab_title),
        "__DESCRIPTION__": html.escape(f"{args.heading} — {subtitle}"),
        "__HEADING__": html.escape(args.heading),
        "__SUBTITLE__": html.escape(subtitle),
        "__FAVICON__": pages[0]["thumb"],
        "__BUILT_AT__": datetime.date.today().isoformat(),
        "__FONT_LINK__": font_link,
        "__STYLE__": style,
        "__PAGEFLIP_JS__": read_template("page-flip.js"),
        "__VIEWER_JS__": read_template("viewer.js"),
        "__DATA__": json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
        "__FOOTER__": footer,
    })

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(page)

    if args.emit_builder:
        builder = build_builder_page(style, font_link, footer, pages[0]["thumb"], args.heading)
        os.makedirs(os.path.dirname(os.path.abspath(args.emit_builder)), exist_ok=True)
        with open(args.emit_builder, "w", encoding="utf-8") as fh:
            fh.write(builder)
        if verbose:
            size_kb = os.path.getsize(args.emit_builder) / 1024
            print(f"  만들기 도구: {args.emit_builder}  ({size_kb:,.0f} KB)")

    size_mb = os.path.getsize(args.out) / 1024 / 1024
    if verbose:
        print()
        print(f"완성: {args.out}  ({len(pages)}면, {size_mb:.2f} MB)")
        print(f"     한 면 {first_w}×{first_h}px, 가로세로비 {data['aspect']}")
        print()
        print("이 파일 하나만 올리면 됩니다. 두 번 눌러 브라우저에서 바로 확인할 수도 있습니다.")
        print("홈페이지 안에 넣을 때는 ?bare=1 을 붙이면 제목·푸터 없이 뷰어만 나옵니다:")
        print(f'  <iframe src="{os.path.basename(args.out)}?bare=1" style="width:100%;height:78vh;'
              'min-height:420px;border:0" allowfullscreen loading="lazy"></iframe>')


if __name__ == "__main__":
    main()
