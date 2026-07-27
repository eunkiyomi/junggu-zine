# 서울시중구재가노인복지기관 소식지 웹 뷰어

발행한 **소식지 PDF 파일을 그대로** 웹에서 책처럼 넘겨 보는 뷰어입니다.
내용을 HTML로 다시 옮겨 적는 방식이 아니라, PDF 원본을 화면에 그려서 보여 주므로
소식지 디자인이 인쇄물과 100% 똑같이 나옵니다.

현재 올라가 있는 호: **2025년 하반기 소식지(통권 제1호, 전 8면)**

## 무엇을 할 수 있나요

- **책 넘김** — 마우스로 페이지 모서리를 끌거나, 화면을 누르거나, 좌우 화살표 버튼으로 넘깁니다. 휴대폰에서는 손가락으로 밀면 됩니다.
- **화면 크기에 맞춤** — 넓은 화면에서는 두 면을 펼쳐서, 휴대폰에서는 한 면씩 보여 줍니다.
- **지면 목록** — 전체 면을 작은 그림으로 훑어보고 원하는 면으로 바로 이동합니다.
- **크게 보기** — 글씨가 작을 때 한 면을 꽉 채워 확대해서 봅니다. 어르신들이 보기 편하도록 최대 4배까지 커집니다.
- **PDF 받기** — 원본 PDF를 그대로 내려받습니다.
- **전체 화면**, 키보드 조작(← → Home End), 화면 낭독기(스크린리더) 대응.
- **홈페이지 퍼가기** — 믹슨(Mixon) 등 다른 홈페이지 안에 그대로 넣을 수 있습니다.

## 홈페이지(믹슨)에 넣는 방법

1. 뷰어 주소(예: `https://eunkiyomi.github.io/junggu-zine/`)를 브라우저에서 엽니다.
2. 화면 맨 아래 **“이 소식지를 홈페이지에 퍼가기”**를 눌러 펼칩니다.
3. **[코드 복사]** 버튼을 누릅니다.
4. 믹슨 글쓰기 화면에서 **HTML 삽입(코드 삽입)** 블록을 추가하고 복사한 코드를 붙여 넣습니다.

복사되는 코드는 아래와 같은 형태입니다. 직접 적어 넣어도 됩니다.

```html
<div style="width:100%;max-width:1100px;margin:0 auto;">
  <iframe src="https://eunkiyomi.github.io/junggu-zine/?embed=1"
    title="서울시중구재가노인복지기관 2025 하반기 소식지"
    loading="lazy" allowfullscreen allow="fullscreen"
    style="display:block;width:100%;height:78vh;min-height:420px;max-height:840px;border:0;border-radius:14px;">
  </iframe>
</div>
```

- `?embed=1` 을 붙이면 기관 로고 머리말과 퍼가기 안내가 빠지고 **뷰어만** 나옵니다. 홈페이지 안에 넣을 때는 이 주소를 쓰세요.
- 높이는 `height:78vh` 로 화면 높이에 맞춰 자동 조절됩니다. 더 크게/작게 하려면 이 숫자만 바꾸면 됩니다.
- `allowfullscreen` 을 빼면 전체 화면 버튼이 동작하지 않습니다.

## 새 호를 올리는 방법

1. `zine/` 폴더에 새 소식지 PDF를 넣습니다. (예: `zine/junggu-zine-2026-1H.pdf`)
2. `index.html` 위쪽 `window.ZINE_CONFIG` 에서 세 군데를 고칩니다.

   ```js
   window.ZINE_CONFIG = {
     pdf: 'zine/junggu-zine-2026-1H.pdf',                    // ← 새 파일 경로
     downloadName: '서울시중구재가노인복지기관_2026상반기소식지.pdf',  // ← 내려받을 때 파일 이름
     org: '서울시중구재가노인복지기관',
     title: '2026 상반기 소식지',                              // ← 표시할 이름
     issue: 'Vol.02',
     fallbackPages: []                                       // ← 아래 설명 참고
   };
   ```

3. 머리말(`<header class="zv-bar">`)과 `<title>` 의 호수 표기도 함께 고칩니다.
4. 변경 내용을 커밋하고 push 하면 끝입니다. 면 수·용지 크기는 PDF에서 자동으로 읽으므로 따로 적을 필요가 없습니다.

### `fallbackPages` 는 무엇인가요

PDF를 읽지 못하는 아주 오래된 브라우저에서 대신 보여 줄 지면 이미지 목록입니다.
`zine/001.jpg` ~ `zine/008.jpg` 가 이번 호의 대체 이미지로 들어가 있습니다.
새 호에서 굳이 이미지를 따로 만들지 않아도 되며, 그럴 때는 `fallbackPages: []` 로 비워 두세요.
비워 두면 PDF를 못 읽는 경우 안내 문구가 대신 나옵니다.

## 주소 뒤에 붙일 수 있는 옵션

| 옵션 | 뜻 | 예 |
| --- | --- | --- |
| `?embed=1` | 머리말·퍼가기 영역을 감춘 퍼가기 전용 화면 | `/?embed=1` |
| `?page=4` | 4면부터 열기 | `/?page=4` |
| `#p4` | 위와 같음. 넘길 때마다 주소창에 자동으로 붙으므로, 그대로 복사해 특정 면을 공유할 수 있습니다 | `/#p4` |
| `?pdf=...` | 다른 PDF 파일을 열기(같은 사이트 안의 경로) | `/?pdf=zine/2026-1H.pdf` |

## 파일 구성

```
index.html                        뷰어 화면 + 소식지 설정(ZINE_CONFIG)
assets/viewer.css                 뷰어 스타일
assets/viewer.js                  PDF 읽기 · 책 넘김 · 확대 · 지면 목록
assets/vendor/                    외부 라이브러리 사본 (출처·라이선스는 이 폴더의 README.md)
  page-flip.browser.js            책 넘김 효과 (StPageFlip, MIT)
  page-flip.css                   위 라이브러리 보정 스타일
  pdf.min.mjs, pdf.worker.min.mjs PDF 렌더링 (PDF.js, Apache-2.0)
zine/junggu-zine-2025-2H.pdf      소식지 원본 PDF
zine/001–008.jpg                  대체용 지면 이미지 (선택)
.nojekyll                         GitHub Pages 가 파일을 그대로 올리도록 하는 표시
```

외부 서버에 연결하지 않습니다. 라이브러리·글꼴 모두 이 저장소 안의 파일이나 기기에 설치된
글꼴만 사용하므로, 외부 스크립트를 막아 둔 홈페이지 안에서도 그대로 동작합니다.

## GitHub Pages 로 공개하기

저장소 **Settings → Pages** 에서 **Source: Deploy from a branch**, **Branch: `main` / `/ (root)`** 를
선택하면 `https://eunkiyomi.github.io/junggu-zine/` 로 공개됩니다. 별도 빌드 과정은 없습니다.

## 내 컴퓨터에서 확인하기

브라우저 보안 정책 때문에 파일을 두 번 눌러 여는 방식(`file://`)으로는 동작하지 않습니다.
아래처럼 간단한 서버를 띄워서 여세요.

```bash
python3 -m http.server 4173
# http://localhost:4173
```

## 원본

- 원문: <https://seouljunggusilver.mixon.io/posts/92teOb7>
- 발행: 2025년 12월 · 발행인 박지훈 · 편집인 이지연
- 사회복지법인 한밀 · 서울시중구재가노인복지기관 · 서울시 중구 다산로42길 126, 102호 · 02-2231-3382

### PDF 원본에 대한 참고

`zine/junggu-zine-2025-2H.pdf` 는 이 저장소에 이미 들어 있던 지면 이미지 8장
(`zine/001–008.jpg`, 각 722×1005px)을 **다시 압축하지 않고 그대로** 담아 만든 PDF입니다.
내용은 발행본과 같지만 해상도는 그 이미지 수준입니다.
인쇄용 원본 PDF가 있다면 같은 이름으로 덮어써 주세요. 확대했을 때 글씨가 훨씬 또렷해집니다.
