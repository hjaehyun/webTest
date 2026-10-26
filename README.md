# SCNU Main Page Clone

국립순천대학교 메인 페이지(https://www.scnu.ac.kr/SCNU/main.do)의 레이아웃과 인터랙션을 학습용으로 재구현한 정적 페이지입니다.

> 비공식 학습용 클론이며 국립순천대학교와 관련이 없습니다. 로고·사진·영상은 원본을 사용하지 않고 CSS 대체 요소로 표현했습니다.

## 구조

```
index.html      마크업
css/style.css   스타일 + 반응형 (1280px / 768px)
js/data.js      메뉴·공지·학사일정·미디어·스쿨 데이터
js/main.js      인터랙션 (Vanilla JS)
```

## 실행

```bash
python -m http.server 5173
```

브라우저에서 http://localhost:5173 접속.
