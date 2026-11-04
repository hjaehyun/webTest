import csv, io, re
src = open("build_schedule.py", encoding="utf-8").read()
ns = {}
exec(src[src.index("TASKS = ["):src.index("STATUSES")], ns)
TASKS = ns["TASKS"]
N = len(TASKS); last = 5 + N; D = 42
seq = f"SEQUENCE(1,{D},0)"
rows = []
rows.append(["하루조각 개발 일정관리 + 간트차트 (출처: 하루조각(텍스트 기반 그림일기).pdf p.5·p.10)"])
rows.append(["시작일(월)", "", "2026-11-02", "", "전체 작업", f"=COUNTA(E6:E{last})", "완료", f'=COUNTIF(L6:L{last},"완료")', "평균 진행률", f"=AVERAGE(M6:M{last})"])
rows.append(["입력: 시작일, 주차, 시작 일차, 기간, 담당, 상태(대기/진행중/완료/지연), 진행률, 비고. 날짜·간트는 자동. 간트 기호: ▒예정 ▶진행중 ■완료 ✕지연"])
rows.append([""] * 14 + [f'=ARRAYFORMULA(IF(MOD({seq},7)=0,{seq}/7+1&"주차",""))'])
rows.append(["ID","주차","단계","구분","작업","세부 내용","시작 일차","기간(일)","시작일","종료일","담당","상태","진행률","비고",
             f'=ARRAYFORMULA(TEXT($C$2+{seq},"m/d"))'])
for n, (wk, stage, cat, task, detail, sday, dur) in enumerate(TASKS):
    r = 6 + n
    rows.append([f"T{n+1:02d}", wk, stage, cat, task, detail, sday, dur,
                 f"=$C$2+(B{r}-1)*7+G{r}-1", f"=I{r}+H{r}-1", "", "대기", "0%", "",
                 f'=ARRAYFORMULA(IF(($C$2+{seq}>=$I{r})*($C$2+{seq}<=$J{r}),SWITCH($L{r},"완료","■","진행중","▶","지연","✕","▒"),""))'])
buf = io.StringIO()
csv.writer(buf, lineterminator="\n").writerows(rows)
open("schedule.csv", "w", encoding="utf-8").write(buf.getvalue())
print(len(buf.getvalue()))
