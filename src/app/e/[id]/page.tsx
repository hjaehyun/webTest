"use client";

import Link from "next/link";
import { useState } from "react";
import Art from "@/components/Art";
import { IconBack, IconNext } from "@/components/ui";
import { monthDay } from "@/lib/date";
import { useStore } from "@/lib/store";
import s from "./public.module.css";

// Public viewer: no sign-in needed. Until the DB exists it can only read this browser's data.
export default function PublicExhibitPage() {
  const { ready, db } = useStore();
  const [i, setI] = useState(0);
  const ex = db.exhibition;
  const works = ex.dates.map((d) => db.artworks[d]).filter(Boolean);
  const cur = works[Math.min(i, works.length - 1)];

  if (!ready) {
    return (
      <div className="app dark">
        <div className="loading">불러오는 중…</div>
      </div>
    );
  }

  return (
    <div className="app dark">
      {/* Owner preview opens this page in the same tab, so give them a way back.
          With a real DB this should check that the signed-in user owns the exhibition. */}
      {db.profile && (
        <Link href="/exhibition" className={s.ownerBar}>
          <IconBack />
          내 전시로
        </Link>
      )}
      <header className={s.head}>
        <div className={s.owner}>{db.profile?.nick ?? "[닉네임]"}의 전시</div>
        <h1 className="hand">{ex.title}</h1>
        <p>{ex.desc}</p>
      </header>

      <main className={s.main}>
        {!ex.isPublic || !cur ? (
          <p className={s.closed}>{ex.isPublic ? "아직 걸린 그림이 없어요." : "비공개 전시예요."}</p>
        ) : (
          <>
            <figure className={s.figure}>
              <div className={s.mat}>
                <Art scene={cur.scene} />
              </div>
              <figcaption>
                <span>{monthDay(cur.date)}</span>
                <span className="hand">{cur.entries[0]?.text ?? ""}</span>
              </figcaption>
            </figure>
            <div className={s.pager}>
              <button className={s.nav} aria-label="이전 그림" onClick={() => setI(i - 1)} disabled={i === 0}>
                <IconBack />
              </button>
              <span>
                {i + 1} / {works.length}
              </span>
              <button className={s.nav} aria-label="다음 그림" onClick={() => setI(i + 1)} disabled={i >= works.length - 1}>
                <IconNext />
              </button>
            </div>
          </>
        )}
      </main>

      <footer className={s.foot}>
        <span className="hand">하루조각</span>
        <Link href="/">나도 전시 열기</Link>
      </footer>
    </div>
  );
}
