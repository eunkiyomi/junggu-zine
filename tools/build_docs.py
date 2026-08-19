#!/usr/bin/env python3
"""안내 페이지가 붙여 넣기용으로 끼워 넣을 자산을 만듭니다.

만들어진 임베드 코드는 **어떤 개인 서버에도 의존하지 않아야** 합니다.
그래서 뷰어의 스타일과 스크립트를 코드 안에 통째로 넣습니다. 붙여 넣을 양을
줄이려고 여기서 미리 압축해 둡니다.

    python3 tools/build_docs.py

  docs/webzine.css  ->  docs/webzine.min.css
  docs/webzine.js   ->  docs/webzine.min.js

압축에는 esbuild 를 씁니다. 없으면 원본을 그대로 복사하고 알려 줍니다
(동작에는 문제가 없고 붙여 넣을 코드만 길어집니다).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")

TARGETS = [("webzine.css", "webzine.min.css"),
           ("webzine.js", "webzine.min.js")]


def esbuild(src: str, dst: str) -> bool:
    """확장자로 형식을 판단하므로 --loader 는 주지 않습니다(stdin 전용 옵션)."""
    for cmd in (["esbuild"], ["npx", "--yes", "esbuild"]):
        try:
            out = subprocess.run(cmd + [src, "--minify"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
        with open(dst, "wb") as fh:
            fh.write(out.stdout)
        return True
    return False


def main() -> None:
    ok = True
    for src_name, dst_name in TARGETS:
        src = os.path.join(DOCS, src_name)
        dst = os.path.join(DOCS, dst_name)
        before = os.path.getsize(src)

        if esbuild(src, dst):
            after = os.path.getsize(dst)
            print(f"  {src_name} -> {dst_name}  {before / 1024:.1f} KB → {after / 1024:.1f} KB")
        else:
            shutil.copyfile(src, dst)
            ok = False
            print(f"  {src_name} -> {dst_name}  (압축 없이 복사, {before / 1024:.1f} KB)")

    # 인라인으로 넣을 것이라 이 두 글자가 들어 있으면 안 됩니다.
    for _, dst_name in TARGETS:
        text = open(os.path.join(DOCS, dst_name), encoding="utf-8").read()
        for bad in ("</script", "</style"):
            if bad in text.lower():
                sys.exit(f"{dst_name} 안에 {bad} 가 있어 인라인으로 넣을 수 없습니다.")

    total = sum(os.path.getsize(os.path.join(DOCS, d)) for _, d in TARGETS)
    print(f"\n붙여 넣을 코드에 들어갈 크기: 약 {total / 1024:.0f} KB")
    if not ok:
        print("esbuild 가 없어 압축하지 못했습니다.  npm i -g esbuild")


if __name__ == "__main__":
    main()
