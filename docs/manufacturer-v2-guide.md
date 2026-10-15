# 제품소개 V2 — 제조사별 데이터 관리

현재 작업은 `feature/manufacturer-v2-20261015` 브랜치에서 진행 중이며, 운영 브랜치 `main`에는 반영되지 않았습니다.

## 데이터 원칙
- `data/manufacturers.json`: 제조사 등록/표시순서/활성 여부
- `data/products/<maker>.json`: 각 제조사의 **유일한 제품 데이터 원본**
- `assets/images/<maker>/`: 제조사별 이미지
- `products/index.html` + `assets/js/products.js`: 공통 목록·검색
- `products/detail.html` + `assets/js/detail.js`: 공통 상세·PDF·이미지 카탈로그
- `data/products.json`: 이전 버전 호환용 파일. V2 화면에서는 사용하지 않음

## 신규 제조사 추가
1. `assets/images/<maker>/`에 이미지 자료를 넣습니다.
2. `data/products/<maker>.json`을 작성합니다. 기존 제조사 JSON 구조를 참고합니다.
3. `data/manufacturers.json`에 `id`, `name`, `order`, `active`, `data`를 등록합니다.
4. 이미지와 PDF 파일의 실제 경로가 존재하는지 확인합니다.
5. PC/모바일 상세조회까지 검증한 뒤 `active: true`로 변경합니다.

## JELPC 미완료 사항
- `data/products/jelpc.json`에 15페이지 이미지 경로는 등록되어 있습니다.
- `assets/images/jelpc/page-01.jpg`부터 `page-15.jpg`까지의 **실제 이미지 업로드가 필요**합니다.
- 이미지가 없으므로 `data/manufacturers.json`에서 JELPC는 `active: false`입니다.
- 기존 ZIP `HR_COMP_Manufacturer_V2_Patch.zip`에는 15장 이미지가 있으나 GitHub에 아직 올라가지 않았습니다.
- 이미지 업로드 및 브라우저 동작 검증 전에는 이 PR을 `main`에 병합하지 마십시오.

## 회귀 검증
- HIGHLY: 4개 제품군 표시, 원본 PDF 열람, 모바일 확대
- SANHUA: 34개 제품 표시, 제품군 필터, PDF 열람
- BAILU: 1개 제품, 6페이지 이미지와 한글 설명, 모바일 확대
- JELPC: 이미지 업로드 후 15페이지 순서·확대·복귀
- 공통: 검색, 제조사 선택, 제품군 필터, 초기화, 상세에서 목록 복귀
