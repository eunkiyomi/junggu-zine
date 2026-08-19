#!/usr/bin/env python3
"""웹진 파일 + 설치 안내문을 한 묶음(zip)으로 만듭니다.

홈페이지 담당자에게 그대로 보내면 되는 꾸러미를 만듭니다.

    python3 tools/build_package.py

들어가는 것:
    webzine-....html   웹진 뷰어 (build_webzine.py 결과물)
    웹진-만들기.html     담당자가 새 PDF 로 웹진을 다시 만드는 도구
                       (build_webzine.py --emit-builder 로 만듭니다)
    웹진-설치안내.html   스크린샷이 들어간 한글 안내문
    OFL.txt            글꼴 라이선스

안내문에 들어가는 스크린샷은 tools/guide-assets/ 에 있습니다.
웹진 화면이 바뀌면 스크린샷도 다시 찍어 같은 이름으로 넣어 주세요.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import io
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
TEMPLATE_DIR = os.path.join(TOOLS, "template")
ASSET_DIR = os.path.join(TOOLS, "guide-assets")

SHOTS = ["s1-cover", "s2-spread", "s3-thumbs", "s4-zoom", "s5-phone", "s6-embedded",
         "s7-builder"]

# 안내문에 넣을 때 이 정도면 충분히 또렷하고, 파일도 가볍습니다.
SHOT_MAX_WIDTH = 1100
SHOT_QUALITY = 78


def shrink(path: str) -> str:
    """스크린샷을 안내문에 넣기 좋은 크기의 JPEG data: 주소로 바꿉니다."""
    with open(path, "rb") as fh:
        raw = fh.read()
    try:
        from PIL import Image
    except ImportError:
        print("  Pillow 가 없어 스크린샷을 원본 크기로 넣습니다 (pip install pillow)")
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width > SHOT_MAX_WIDTH:
        h = round(img.height * SHOT_MAX_WIDTH / img.width)
        img = img.resize((SHOT_MAX_WIDTH, h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=SHOT_QUALITY, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def substitute(text: str, mapping: dict[str, str]) -> str:
    pattern = re.compile("|".join(re.escape(k) for k in mapping))
    return pattern.sub(lambda m: mapping[m.group(0)], text)


def human_size(path: str) -> str:
    mb = os.path.getsize(path) / 1024 / 1024
    return f"{mb:.1f} MB"


def main() -> None:
    ap = argparse.ArgumentParser(description="담당자에게 보낼 꾸러미를 만듭니다.")
    ap.add_argument("--zine", default="dist/webzine-2025-2H.html", help="build_webzine.py 로 만든 HTML")
    ap.add_argument("--builder", default="dist/package/웹진-만들기.html",
                    help="build_webzine.py --emit-builder 로 만든 도구 페이지")
    ap.add_argument("--subtitle", default="2025 하반기 소식지 · 통권 제1호 · 전 8면")
    ap.add_argument("--out-dir", default="dist/package", help="꾸러미를 풀어 둘 폴더")
    ap.add_argument("--zip", dest="zip_path", default="dist/junggu-webzine-package.zip")
    args = ap.parse_args()

    zine_path = os.path.join(ROOT, args.zine) if not os.path.isabs(args.zine) else args.zine
    if not os.path.exists(zine_path):
        sys.exit(f"웹진 파일이 없습니다: {zine_path}\n먼저 tools/build_webzine.py 를 실행하세요.")

    missing = [s for s in SHOTS if not os.path.exists(os.path.join(ASSET_DIR, s + ".png"))]
    if missing:
        sys.exit(f"스크린샷이 없습니다: {', '.join(missing)}\n{ASSET_DIR} 를 확인하세요.")

    out_dir = os.path.join(ROOT, args.out_dir) if not os.path.isabs(args.out_dir) else args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    zine_name = os.path.basename(zine_path)

    builder_path = os.path.join(ROOT, args.builder) if not os.path.isabs(args.builder) else args.builder
    if not os.path.exists(builder_path):
        sys.exit(f"만들기 도구가 없습니다: {builder_path}\n"
                 "build_webzine.py 에 --emit-builder 를 붙여 다시 실행하세요.")
    builder_name = os.path.basename(builder_path)

    print("안내문 만드는 중…")
    mapping = {
        "__ZINE_FILE__": zine_name,
        "__ZINE_SIZE__": human_size(zine_path),
        "__BUILDER_SIZE__": human_size(builder_path),
        "__SUBTITLE__": args.subtitle,
        "__BUILT_AT__": datetime.date.today().strftime("%Y년 %-m월 %-d일"),
    }
    for shot in SHOTS:
        key = "__IMG_" + shot.split("-")[0].upper() + "__"
        mapping[key] = shrink(os.path.join(ASSET_DIR, shot + ".png"))
        print(f"  {shot}: {len(mapping[key]) / 1024:,.0f} KB")

    with open(os.path.join(TEMPLATE_DIR, "guide.html"), encoding="utf-8") as fh:
        guide = substitute(fh.read(), mapping)

    guide_name = "웹진-설치안내.html"
    guide_path = os.path.join(out_dir, guide_name)
    with open(guide_path, "w", encoding="utf-8") as fh:
        fh.write(guide)

    shutil.copy2(zine_path, os.path.join(out_dir, zine_name))
    if os.path.abspath(builder_path) != os.path.abspath(os.path.join(out_dir, builder_name)):
        shutil.copy2(builder_path, os.path.join(out_dir, builder_name))
    license_src = os.path.join(TOOLS, "fonts", "OFL.txt")
    files = [guide_name, zine_name, builder_name]
    if os.path.exists(license_src):
        shutil.copy2(license_src, os.path.join(out_dir, "OFL.txt"))
        files.append("OFL.txt")

    zip_path = os.path.join(ROOT, args.zip_path) if not os.path.isabs(args.zip_path) else args.zip_path
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in files:
            zf.write(os.path.join(out_dir, name), name)

    print()
    print(f"꾸러미 폴더: {out_dir}")
    for name in files:
        print(f"  {name}  ({human_size(os.path.join(out_dir, name))})")
    print(f"압축 파일:   {zip_path}  ({human_size(zip_path)})")
    print()
    print("이 zip 을 홈페이지 담당자에게 보내시면 됩니다.")


if __name__ == "__main__":
    main()
