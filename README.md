# 서울시중구재가노인복지기관 웹진

소식지 **PDF를 홈페이지에서 책처럼 넘겨 보게** 하는 뷰어입니다.

내용을 HTML로 다시 옮겨 적는 방식이 아니라 PDF 지면을 그대로 그려 보여 주므로,
인쇄물과 지면이 100% 같습니다.

디자인은 기관 홈페이지(<https://seouljunggusilver.mixon.io>)의 실제 테마 값
— 주색 `#18ACBB`, 보조색 `#FF9C37`, 본문 폭 1136px, Pretendard 글꼴 —
을 그대로 따랐습니다. **커뮤니티** 아래 `웹진` 메뉴로 넣으면
공지사항·포토앨범·카드뉴스와 이질감 없이 붙습니다.

## 쓰는 법

믹스온의 HTML 블록은 긴 코드를 넣으면 오류가 나므로, PDF를 코드 안에 넣지 않고
**주소로 연결**합니다. 붙여 넣을 코드는 세 줄입니다.

1. 소식지 PDF를 홈페이지에 **정적 파일로 올리고** 그 주소를 복사합니다.
2. <https://eunkisalon.net/junggu-zine/> 에서 그 주소를 넣고 **코드를 복사**합니다.
3. 믹스온 페이지의 **HTML 블록**에 붙여 넣습니다.

만들어지는 코드는 이렇게 생겼습니다.

```html
<link rel="stylesheet" href="https://eunkisalon.net/junggu-zine/webzine.css">
<div class="webzine"
    data-pdf="https://seouljunggusilver.mixon.io/uploads/.../zine.pdf"
    data-subtitle="2025 하반기 소식지 · 통권 제1호"></div>
<script src="https://eunkisalon.net/junggu-zine/webzine.js"></script>
```

다음 호가 나오면 **PDF만 같은 이름으로 덮어쓰면 끝**입니다.
코드도 페이지도 고칠 필요가 없습니다.

> **PDF는 홈페이지와 같은 도메인에 올려야 합니다.** 다른 도메인의 PDF는
> 브라우저가 막습니다(CORS). 믹스온에 올린 파일 주소를 그대로 쓰면 됩니다.

### 설정값

| 속성 | 뜻 |
| --- | --- |
| `data-pdf` | PDF 주소. 필수 |
| `data-title` | 큰 제목. 없으면 제목을 그리지 않습니다 |
| `data-subtitle` | 제목 아래 설명 한 줄 |
| `data-download` | `off` 면 ‘PDF 받기’ 버튼을 숨깁니다 |
| `data-max-width` | 최대 가로 폭 (기본 `1136px`) |
| `data-spread` | 두 면 펼침으로 바뀌는 최소 폭 (기본 `680`) |

## 뷰어 기능

- **책 넘김** — 모서리를 끌거나, 화면을 누르거나, 좌우 화살표로. 휴대폰에서는 손가락으로 밉니다.
- **화면에 맞춤** — 넓은 화면은 두 면 펼침, 좁은 화면은 한 면씩.
- **지면 목록** — 전체 면을 작게 훑어보고 바로 이동.
- **크게 보기** — 최대 4배 확대. 어르신들이 읽기 좋도록 넣었습니다.
- **PDF 받기**, 전체 화면, 키보드(← → Home End), 화면 낭독기 대응, 인쇄(원본 지면 수 그대로).
- 지면은 보이는 크기 × 화면 배율로 그리고, 창 크기가 바뀌면 다시 그려 항상 또렷합니다.

## GitHub Pages 설정

이 저장소의 `docs/` 폴더가 그대로 공개 페이지가 됩니다.

**Settings → Pages → Build and deployment** 가
**Source: Deploy from a branch**, **Branch: `main` / `/docs`** 로 맞춰져 있습니다.

공개 주소는 <https://eunkisalon.net/junggu-zine/> 입니다.
`eunkiyomi.github.io/junggu-zine/` 로 들어가도 같은 곳으로 넘어가지만(301),
자산까지 매번 넘어가므로 **코드에는 `eunkisalon.net` 주소를 쓰는 편이 낫습니다.**
안내 페이지가 만들어 주는 코드는 지금 열고 있는 주소를 그대로 씁니다.

`docs/.nojekyll` 이 있어 Jekyll 처리를 건너뜁니다. 이 파일이 없거나 `docs/` 가
없으면 Pages 가 Jekyll 로 빌드하다 실패합니다.

## 저장소 구성

```
docs/                        GitHub Pages 로 공개되는 폴더
  index.html                 임베드 코드 만들기 + 안내 (eunkisalon.net 디자인 체계)
  webzine.js                 뷰어 — PDF 를 읽어 책처럼 넘김
  webzine.css                뷰어 스타일 (.wz-root 아래로만 적용)
  page-flip.js               StPageFlip 2.0.7 (MIT, © 2020 Nodlik)
  sample/                    ‘예시로 채우기’ 가 쓰는 소식지 PDF

tools/                       한 파일로 굽는 예비 경로 (아래 설명)
zine/                        소식지 원본 PDF · 지면 이미지
```

`webzine.js` 는 같은 폴더의 `page-flip.js` 를, PDF.js 는 jsDelivr 를 불러옵니다.
글꼴은 홈페이지와 같은 Pretendard(jsDelivr)를 씁니다.

## 예비 경로 — 한 파일로 굽기

홈페이지가 외부 스크립트를 막거나, 인터넷 없이 열어 봐야 할 때를 위해
**모든 것을 담은 HTML 한 개**를 만드는 도구도 함께 둡니다.
지면을 이미지로 구워 파일 안에 넣으므로 2–3 MB가 되고, 믹스온 HTML 블록에는
크기 때문에 붙여 넣을 수 없습니다. 파일로 올려 링크하거나 iframe 으로 쓰세요.

```bash
pip install pymupdf pillow fonttools brotli

python3 tools/build_webzine.py zine/junggu-zine-2025-2H.pdf \
    --out dist/webzine-2025-2H.html \
    --subtitle "2025 하반기 소식지 · 통권 제1호 · 전 8면" \
    --embed-pdf --download-name "junggu-webzine-2025-2H.pdf" \
    --emit-builder "dist/package/웹진-만들기.html"

python3 tools/build_package.py     # 담당자에게 보낼 안내문 + zip
```

`--emit-builder` 로 만들어지는 `웹진-만들기.html` 은 담당자가 브라우저에서
새 PDF 를 끌어다 놓고 새 웹진 파일을 받는 도구입니다.
`dist/` 는 저장소에 넣지 않습니다 — 위 명령으로 다시 만들면 됩니다.

## 원본과 화질에 대해

`zine/junggu-zine-2025-2H.pdf` 는 저장소에 있던 지면 이미지 8장
(각 722×1005px)을 다시 압축하지 않고 담아 만든 PDF 입니다. 내용은 발행본과 같지만
해상도는 그 이미지 수준이라, 크게 보기로 많이 확대하면 글씨가 흐릿합니다.
**인쇄용 원본 PDF 로 바꾸면** 뷰어가 그대로 더 또렷하게 그립니다.

- 원문: <https://seouljunggusilver.mixon.io/posts/92teOb7>
- 발행: 2025년 12월 · 발행인 박지훈 · 편집인 이지연
