"""하루조각 개발 일정관리 + 간트차트 xlsx 생성 (Google Sheets 업로드용)."""
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

START = dt.date(2026, 11, 2)  # 1주차 월요일
DAYS = 42  # 6주

# (주차, 단계, 구분, 작업, 세부, 시작일차, 기간, 상태)
TASKS = [
    (1, "공통", "설계", "화면 설계", "오늘/갤러리/그림 상세/전시회 4개 화면", 1, 2),
    (1, "공통", "설계", "DB 스키마 설계", "5개 테이블, 하루 1장 중복 방지 제약", 2, 2),
    (1, "공통", "세팅", "Next.js 프로젝트 세팅", "GitHub 저장소, 기본 구조", 3, 2),
    (1, "공통", "세팅", "Supabase 연동", "프로젝트 생성, DB·Storage 연결", 4, 2),
    (1, "공통", "배포", "Vercel 배포 환경", "GitHub 푸시 시 자동 배포", 5, 3),
    (2, "1단계 필수", "백엔드", "로그인 / 회원가입", "Supabase Auth", 1, 3),
    (2, "1단계 필수", "프론트", "프로필", "닉네임, 그림체 선택 (profiles)", 3, 2),
    (2, "1단계 필수", "프론트", "글쓰기 피드", "짧은 글 작성·조회 (entries)", 3, 4),
    (2, "1단계 필수", "보안", "RLS 정책", "내 글은 나만 조회", 6, 2),
    (3, "1단계 필수", "AI", "텍스트 AI 장면 정리", "여러 조각글을 한 장면으로 요약", 1, 3),
    (3, "1단계 필수", "AI", "이미지 AI 그림 생성", "gpt-image-1-mini, 고정 그림체", 3, 3),
    (3, "1단계 필수", "백엔드", "그림 저장", "daily_artworks + Storage, 상태 관리", 4, 3),
    (3, "1단계 필수", "백엔드", "마감 트리거", "'오늘 마감' 버튼 + 매일 1회 자동 실행", 6, 2),
    (4, "1단계 필수", "프론트", "달력형 갤러리", "달력처럼 쌓이는 그림", 1, 4),
    (4, "1단계 필수", "프론트", "그림 상세", "그날 쓴 글과 함께 보기", 4, 3),
    (4, "1단계 필수", "마일스톤", "1단계 완료 점검", "필수 기능 전체 동작 확인", 7, 1),
    (5, "2단계 확장", "프론트", "전시회 만들기", "그림 고르기, 순서·설명 (exhibitions)", 1, 3),
    (5, "2단계 확장", "백엔드", "공개 링크", "공개 링크로 전시 열기, 공개 범위 RLS", 3, 3),
    (5, "2단계 확장", "프론트", "전시 관람", "다른 사람의 전시 보기", 5, 3),
    (6, "3단계 여유", "AI", "AI 큐레이터", "기간별 해설, 장면 요약 재활용", 1, 3),
    (6, "공통", "테스트", "통합 테스트", "버그 수정, 모바일 점검", 3, 3),
    (6, "공통", "배포", "최종 배포·시연 준비", "'오늘 마감' 현장 시연 리허설", 5, 2),
    (6, "공통", "마일스톤", "발표 / Q&A", "최종 발표", 7, 1),
]

STATUSES = ["대기", "진행중", "완료", "지연"]

BLUE = Font(color="1F4E9E")
BOLD = Font(bold=True)
HEAD_FILL = PatternFill("solid", fgColor="2F3E56")
HEAD_FONT = Font(bold=True, color="FFFFFF")
THIN = Side(style="thin", color="D0D5DD")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center")
FILL = {
    "done": PatternFill("solid", fgColor="B7E1CD", bgColor="B7E1CD"),
    "doing": PatternFill("solid", fgColor="A4C2F4", bgColor="A4C2F4"),
    "late": PatternFill("solid", fgColor="F4B6B6", bgColor="F4B6B6"),
    "plan": PatternFill("solid", fgColor="F6C77A", bgColor="F6C77A"),
    "today": PatternFill("solid", fgColor="FFF2CC", bgColor="FFF2CC"),
    "weekend": PatternFill("solid", fgColor="E7E9EE", bgColor="E7E9EE"),
}

wb = Workbook()

# ---------- 일정관리 ----------
ws = wb.active
ws.title = "일정관리"
ws["A1"] = "하루조각 개발 일정관리"
ws["A1"].font = Font(bold=True, size=16)
ws["A2"] = "6주 개발 계획 기준. 일정은 과제 마감일에 맞춰 조정."

ws["A3"] = "시작일(월)"
ws["A3"].font = BOLD
ws["C3"] = START
ws["C3"].font = BLUE
ws["C3"].number_format = "yyyy-mm-dd"
ws["E3"], ws["F3"] = "전체 작업", f"=COUNTA(E6:E{5 + len(TASKS)})"
ws["G3"], ws["H3"] = "완료", f'=COUNTIF(L6:L{5 + len(TASKS)},"완료")'
ws["I3"], ws["J3"] = "평균 진행률", f"=AVERAGE(M6:M{5 + len(TASKS)})"
ws["J3"].number_format = "0%"
for c in ("E3", "G3", "I3"):
    ws[c].font = BOLD
ws["A4"] = "파란 글씨 = 입력 셀 (시작일, 주차, 시작 일차, 기간, 담당, 상태, 진행률, 비고). 날짜는 자동 계산."
ws["A4"].font = Font(italic=True, color="667085")

headers = ["ID", "주차", "단계", "구분", "작업", "세부 내용", "시작 일차", "기간(일)",
           "시작일", "종료일", "담당", "상태", "진행률", "비고"]
for i, h in enumerate(headers, 1):
    c = ws.cell(row=5, column=i, value=h)
    c.fill, c.font, c.alignment, c.border = HEAD_FILL, HEAD_FONT, CENTER, BOX
ws["A5"].comment = Comment(
    "Source: 하루조각(텍스트 기반 그림일기).pdf, p.5 주요 기능 · p.10 개발 계획, uploaded 2026-10-31", "Claude")

for n, (wk, stage, cat, task, detail, sday, dur) in enumerate(TASKS):
    r = 6 + n
    row = [f"T{n + 1:02d}", wk, stage, cat, task, detail, sday, dur,
           f"=$C$3+(B{r}-1)*7+G{r}-1", f"=I{r}+H{r}-1", "", "대기", 0, ""]
    for i, v in enumerate(row, 1):
        c = ws.cell(row=r, column=i, value=v)
        c.border = BOX
        if i in (2, 7, 8, 11, 12, 13, 14):
            c.font = BLUE
        if i in (1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13):
            c.alignment = CENTER
    ws.cell(row=r, column=9).number_format = "yyyy-mm-dd"
    ws.cell(row=r, column=10).number_format = "yyyy-mm-dd"
    ws.cell(row=r, column=13).number_format = "0%"
    if cat == "마일스톤":
        ws.cell(row=r, column=5).font = BOLD

last = 5 + len(TASKS)
dv = DataValidation(type="list", formula1='"' + ",".join(STATUSES) + '"', allow_blank=True)
ws.add_data_validation(dv)
dv.add(f"L6:L{last}")
pv = DataValidation(type="decimal", operator="between", formula1="0", formula2="1", allow_blank=True)
ws.add_data_validation(pv)
pv.add(f"M6:M{last}")

for status, key in (("완료", "done"), ("진행중", "doing"), ("지연", "late")):
    ws.conditional_formatting.add(f"L6:L{last}", FormulaRule(formula=[f'$L6="{status}"'], fill=FILL[key]))

for col, w in zip("ABCDEFGHIJKLMN", [6, 6, 11, 9, 20, 34, 9, 8, 12, 12, 10, 9, 8, 24]):
    ws.column_dimensions[col].width = w
ws.freeze_panes = "A6"

# ---------- 간트차트 ----------
g = wb.create_sheet("간트차트")
g["A1"] = "하루조각 간트차트"
g["A1"].font = Font(bold=True, size=16)
g["A2"] = "일정관리 탭과 연동. 주황=예정, 파랑=진행중, 초록=완료, 빨강=지연, 노란 열=오늘"
g["A2"].font = Font(italic=True, color="667085")

fixed = ["ID", "작업", "시작일", "종료일", "상태"]
FIRST = len(fixed) + 1  # F
for i, h in enumerate(fixed, 1):
    for rr in (3, 4, 5):
        c = g.cell(row=rr, column=i)
        c.fill, c.border = HEAD_FILL, BOX
    c = g.cell(row=4, column=i, value=h)
    c.font, c.alignment = HEAD_FONT, CENTER
    g.merge_cells(start_row=3, start_column=i, end_row=5, end_column=i)
    g.cell(row=3, column=i, value=h).font = HEAD_FONT
    g.cell(row=3, column=i).alignment = CENTER

for d in range(DAYS):
    col = FIRST + d
    L = get_column_letter(col)
    if d % 7 == 0:
        c = g.cell(row=3, column=col, value=f"{d // 7 + 1}주차")
        c.fill, c.font, c.alignment = HEAD_FILL, HEAD_FONT, CENTER
        g.merge_cells(start_row=3, start_column=col, end_row=3, end_column=col + 6)
    date_c = g.cell(row=4, column=col, value="=일정관리!$C$3" if d == 0 else f"={get_column_letter(col - 1)}4+1")
    date_c.number_format = "d"
    day_c = g.cell(row=5, column=col, value=f'=CHOOSE(WEEKDAY({L}4),"일","월","화","수","목","금","토")')
    for c in (date_c, day_c):
        c.alignment, c.border = CENTER, BOX
        c.font = Font(size=9)
    g.column_dimensions[L].width = 3.6

for n in range(len(TASKS)):
    r = 6 + n
    src = 6 + n
    vals = [f"=일정관리!A{src}", f"=일정관리!E{src}", f"=일정관리!I{src}", f"=일정관리!J{src}", f"=일정관리!L{src}"]
    for i, v in enumerate(vals, 1):
        c = g.cell(row=r, column=i, value=v)
        c.border = BOX
        if i != 2:
            c.alignment = CENTER
    g.cell(row=r, column=3).number_format = "mm-dd"
    g.cell(row=r, column=4).number_format = "mm-dd"
    for d in range(DAYS):
        g.cell(row=r, column=FIRST + d).border = BOX

glast = 5 + len(TASKS)
F, LASTC = get_column_letter(FIRST), get_column_letter(FIRST + DAYS - 1)
grid = f"{F}6:{LASTC}{glast}"
inbar = f"{F}$4>=$C6,{F}$4<=$D6"
for status, key in (("완료", "done"), ("진행중", "doing"), ("지연", "late")):
    g.conditional_formatting.add(grid, FormulaRule(formula=[f'AND({inbar},$E6="{status}")'], fill=FILL[key], stopIfTrue=True))
g.conditional_formatting.add(grid, FormulaRule(formula=[f"AND({inbar})"], fill=FILL["plan"], stopIfTrue=True))
g.conditional_formatting.add(f"{F}4:{LASTC}{glast}", FormulaRule(formula=[f"{F}$4=TODAY()"], fill=FILL["today"]))
g.conditional_formatting.add(f"{F}4:{LASTC}5", FormulaRule(formula=[f"WEEKDAY({F}$4,2)>5"], fill=FILL["weekend"]))

for col, w in zip("ABCDE", [6, 20, 8, 8, 8]):
    g.column_dimensions[col].width = w
g.freeze_panes = g.cell(row=6, column=FIRST)

wb.save("하루조각_일정관리.xlsx")
print("saved")
