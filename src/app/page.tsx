"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import s from "./login.module.css";

const LOGO = ["#C9D3F2", "#F3D9A8", "#D6E6D2", "#F0CFC6", null, "#DCD3EE"];

export default function LoginPage() {
  const router = useRouter();
  const { ready, authed, db, signIn, signUp } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const signup = mode === "signup";

  // Already signed in (e.g. coming back later): skip the form.
  useEffect(() => {
    if (ready && authed) router.replace(db.profile ? "/today" : "/profile");
  }, [ready, authed, db.profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (signup && password.length < 8) {
      setMessage("비밀번호는 8자 이상이어야 해요");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await (signup ? signUp(email, password) : signIn(email, password));
      router.push(next.profile ? "/today" : "/profile");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "잠시 후 다시 해주세요");
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(signup ? "login" : "signup");
    setMessage(null);
  }

  return (
    <div className="app">
      <div className={s.wrap}>
        <div className={s.hero}>
          <div className={s.logo} aria-hidden="true">
            {LOGO.map((c, i) => (
              <div key={i} className={c ? s.tile : `${s.tile} ${s.empty}`} style={c ? { background: c } : undefined} />
            ))}
          </div>
          <div className={s.copy}>
            <h1 className="hand">하루조각</h1>
            <p>
              무심코 남긴 조각들이 모여,
              <br />
              그날이 그려집니다
            </p>
          </div>
        </div>

        <form className={s.form} onSubmit={onSubmit}>
          <label className="field">
            이메일
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            비밀번호
            <input
              className="input"
              type="password"
              placeholder="8자 이상"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p className={s.error} role="alert">
              {message}
            </p>
          )}
          {signup && (
            <p className={s.notice}>
              조각글은 장면 정리를 위해 Google Gemini로, 그림 설명은 그림을 그리기 위해 Cloudflare Workers AI로 전송돼요. 무료
              등급에서는 서비스 개선에 쓰일 수 있으니, 이름이나 연락처는 적지 말아 주세요.
            </p>
          )}
          <button className="btn" type="submit" style={{ marginTop: 8 }} disabled={busy}>
            {busy ? "잠시만요…" : signup ? "가입하기" : "로그인"}
          </button>
          <div className={s.signup}>
            {signup ? "이미 계정이 있나요?" : "처음이신가요?"}
            <button type="button" onClick={switchMode}>
              {signup ? "로그인" : "회원가입"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
