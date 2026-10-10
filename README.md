# HR COMP Website V1

Static HTML/CSS/JS website for GitHub Pages.

## Preview

Run `python -m http.server 8000` in the unzipped project folder and open `http://localhost:8000`. JSON `fetch()` requires HTTP; double-clicking files is not supported.

## Maintenance

- `data/products.json`: manufacturer, category, series, PDF start/end page, preview image.
- `data/site.json`: company contact configuration (currently placeholders; wire into contact page before publication).
- `catalog/`: preserved byte-for-byte copies of manufacturer catalogues.
- `assets/images/`: derived low-resolution web previews, not replacement catalogs.
- To add a series: append one object to products.json and generate a thumbnail or reuse a suitable existing image.
- When replacing a PDF, check page mapping for all affected entries.

## Coverage and review notes

SANHUA: all 34 entries from original SUMMARY PDF pages 4–5 have been entered, linked to catalog PDF pages. Model-level records intentionally excluded.
HIGHLY: source PDF is scanned; initial implementation offers family introduction and broad technical page ranges. Precise series-level segmentation remains to be verified against all source pages before treating HIGHLY as complete.

Company contact details are deliberately unfilled. Verify manufacturer catalogue public redistribution rights before publishing the original PDFs.

## Deployment

Create GitHub Pages repository, upload project contents, enable Pages from main/root, and configure hrcomp.co.kr DNS and HTTPS. Do not point production domain until review.


## V1 연결 검토 (2026-10-10)
- HOME은 회사 역할 중심으로 변경, 제조사 제품 카드 제거
- COMPANY는 제조사 소개만 제공하며 제품 카탈로그 목록과 분리
- PRODUCTS: 제조사 → 제품군별 Series → 상세 → 원본 PDF → 목록 복귀
- CONTACT: data/site.json의 연락처를 읽어 표시 (미등록은 확인 후 등록 예정)
- SANHUA: 34개 카탈로그 목차 항목 연결, HIGHLY: 기술자료 구간 임시 연결 (Series별 정밀 분류 후속 필요)
- 원본 PDF는 변경하지 않음. 홈페이지 게시 권한 및 제조사 자료 공개 가능 여부는 게시 전 확인
- 모든 링크는 HTTP 서버에서 검토. 브라우저별 PDF #page 이동은 차이가 있을 수 있음
