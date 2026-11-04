"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Art from "@/components/Art";
import { IconBack, IconNext, Screen, TopBar } from "@/components/ui";
import { clock, longDate } from "@/lib/date";
import { drawScene, summarizeDay } from "@/lib/ai";
import { downloadSvgAsPng } from "@/lib/download";
import { byTime, sortedArtworks, useStore } from "@/lib/store";
import { styleOf, withParticle } from "@/lib/styles";
import s from "./detail.module.css";

export default function DetailPage() {
  return (
    <Screen>
      <Detail />
    </Screen>
  );
}

function Detail() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const { db, toggleExhibit, redrawArtwork } = useStore();
  const art = db.artworks[date];
  const frame = useRef<HTMLSpanElement>(null);
  const [saving, setSaving] = useState(false);
  const [redrawing, setRedrawing] = useState(false);

  // Dev-only trace so each redraw step can be followed in the browser console.
  const trace = (...a: unknown[]) => {
    if (process.env.NODE_ENV !== "production") console.debug("[redraw]", ...a);
  };

  /** "다시 그리기": same fragments, summarized and drawn again in the current profile style. */
  async function redraw() {
    if (!art || redrawing) return;
    const style = db.profile?.style ?? art.style;
    const ok = confirm(
      `${withParticle(style)} 다시 그릴까요?\n지금 그림은 새 그림으로 바뀌고, 오늘의 AI 사용 횟수를 1회씩 써요.`,
    );
    if (!ok) return;
    setRedrawing(true);
    try {
      trace("start", { date, style, entries: art.entries.length });
      const summary = await summarizeDay(art.entries);
      trace("summarized", summary);
      const { scene } = await drawScene(summary, style);
      trace("drawn", { scene });
      await redrawArtwork(date, { scene, style, summary: summary.summary, tags: summary.tags });
      trace("saved");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "다시 그리지 못했어요");
    } finally {
      setRedrawing(false);
    }
  }

  async function download() {
    const svg = frame.current?.querySelector("svg");
    if (!svg || saving) return;
    setSaving(true);
    try {
      await downloadSvgAsPng(svg, `하루조각-${date}.png`);
    } catch (err) {
      console.error(err);
      alert("그림을 저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  if (!art) {
    return (
      <>
        <TopBar title={longDate(date)} back="/gallery" />
        <div className="loading">이날은 그림이 없어요.</div>
      </>
    );
  }

  // Newest first, so "previous day" is the next index.
  const list = sortedArtworks(db);
  const i = list.findIndex((w) => w.date === date);
  const older = list[i + 1]?.date;
  const newer = list[i - 1]?.date;
  const inShow = db.exhibition.dates.includes(date);

  return (
    <>
      <TopBar title={longDate(date)} back="/gallery">
        <button className="icon-btn" aria-label="전날 그림" disabled={!older} onClick={() => older && router.replace(`/gallery/${older}`)}>
          <IconBack />
        </button>
        <button className="icon-btn" aria-label="다음날 그림" disabled={!newer} onClick={() => newer && router.replace(`/gallery/${newer}`)}>
          <IconNext />
        </button>
      </TopBar>

      <main className={`scroll ${s.main}`}>
        <figure className={s.figure}>
          <span ref={frame} className={s.frame} aria-busy={redrawing}>
            <Art scene={art.scene} />
          </span>
          <figcaption>
            <span className={s.badge}>{styleOf(art.style).label}</span>
            <span role="status">{redrawing ? "다시 그리는 중…" : "[이미지 AI 연결 전 · 예시 그림]"}</span>
          </figcaption>
        </figure>

        <section className="card">
          <h2 className={`eyebrow ${s.h}`}>AI가 정리한 장면</h2>
          <p className={s.summary}>{art.summary}</p>
          {art.tags.length > 0 && (
            <div className={s.tags}>
              {art.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
          )}
        </section>

        <section className={s.entries}>
          <h2>그날의 조각 {art.entries.length}개</h2>
          {[...art.entries].sort(byTime).map((e) => {
            const t = clock(e.at);
            return (
              <div key={e.id} className={s.entry}>
                <span>
                  {t.am ? "오전" : "오후"} {t.label}
                </span>
                <p className="hand">{e.text}</p>
              </div>
            );
          })}
        </section>
      </main>

      <div className={`bar ${s.actions}`}>
        <button className={s.download} aria-label="그림 저장" title="그림 저장 (PNG)" onClick={download} disabled={saving || redrawing}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
        </button>
        <button
          className="btn ghost"
          onClick={redraw}
          disabled={redrawing || art.entries.length === 0}
          title={art.entries.length === 0 ? "조각이 없는 날은 다시 그릴 수 없어요" : undefined}
        >
          {redrawing ? "그리는 중…" : "다시 그리기"}
        </button>
        <button className={inShow ? "btn ghost" : "btn"} onClick={() => toggleExhibit(date)} disabled={redrawing}>
          {inShow ? "전시회에서 내리기" : "전시회에 걸기"}
        </button>
      </div>
    </>
  );
}
