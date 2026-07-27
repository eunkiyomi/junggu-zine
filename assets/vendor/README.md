# 외부 라이브러리 (vendored)

뷰어가 외부 CDN 없이 동작하도록 아래 라이브러리를 저장소에 직접 포함했습니다.
파일을 수정하지 마세요. 버전을 올릴 때는 아래 출처에서 같은 파일명으로 내려받아 교체하면 됩니다.

| 파일 | 라이브러리 | 버전 | 라이선스 | 출처 |
| --- | --- | --- | --- | --- |
| `page-flip.browser.js` | [StPageFlip](https://github.com/Nodlik/StPageFlip) | 2.0.7 | MIT (© 2020 Nodlik) | `https://unpkg.com/page-flip@2.0.7/dist/js/page-flip.browser.js` |
| `page-flip.css` | StPageFlip 기본 스타일 | 2.0.7 | MIT (© 2020 Nodlik) | `https://unpkg.com/page-flip@2.0.7/src/Style/stPageFlip.css` (주석 참고 — 두 곳 수정) |
| `pdf.min.mjs` | [PDF.js](https://github.com/mozilla/pdf.js) | 4.6.82 | Apache-2.0 (© Mozilla Foundation) | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs` |
| `pdf.worker.min.mjs` | PDF.js 워커 | 4.6.82 | Apache-2.0 (© Mozilla Foundation) | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs` |

`pdf.worker.min.mjs`는 PDF.js가 별도 스레드에서 로드하는 파일입니다.
`pdf.min.mjs`와 항상 **같은 버전**으로 함께 교체해야 합니다.
