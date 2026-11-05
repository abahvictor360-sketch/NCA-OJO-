"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearLocal } from "@/lib/store";
import { SITE_URL } from "@/lib/utils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [info, setInfo] = useState<string | null>(null);
  // Someone else is already signed in on this device while an invite link was opened
  const [otherUser, setOtherUser] = useState<string | null>(null);

  useEffect(() => {
    // Invite links look like /login/?setup=1&email=new.admin@example.com
    const q = new URLSearchParams(window.location.search);
    const invited = (q.get("email") ?? "").trim().toLowerCase();
    const setup = q.has("setup");
    if (setup) setMode("setup");
    if (invited) setEmail(invited);
    (async () => {
      const { data } = await supabase().auth.getSession();
      const current = data.session?.user.email?.toLowerCase();
      if (!current) return;
      // Already signed in: go to the app, unless this is an invite for someone else
      if (setup && current !== invited) setOtherUser(current);
      else window.location.href = "/";
    })();
  }, []);

  async function switchUser() {
    setBusy(true);
    await supabase().auth.signOut({ scope: "local" });
    await clearLocal();
    setOtherUser(null);
    setBusy(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === "setup") {
      const { data, error } = await supabase().auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${SITE_URL}/login/` },
      });
      setBusy(false);
      if (error) {
        setError(/registered/i.test(error.message) ? "This email already has a password. Sign in instead." : error.message);
        return;
      }
      if (data.session) {
        window.location.href = "/";
        return;
      }
      setInfo("Almost done. Open the email we just sent, tap the confirm link, then sign in here.");
      setMode("signin");
      return;
    }
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setError("Wrong email or password.");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.jpg" alt="New Creation Assembly logo" width={96} height={96} priority className="rounded-full" />
          <h1 className="mt-4 text-xl font-semibold">New Creation Assembly Ojo</h1>
          <p className="text-sm text-muted">Overcomers Parish · Attendance</p>
        </div>

        {otherUser && (
          <div className="card mb-4 space-y-3 p-5 text-sm">
            <p>
              This device is signed in as <b>{otherUser}</b>. To create a password for{" "}
              {email ? <b>{email}</b> : "a new admin"}, sign that account out first.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={switchUser}>
                Sign out {otherUser.split("@")[0]}
              </button>
              <button type="button" className="btn-outline btn-sm" onClick={() => (window.location.href = "/")}>
                Back to the app
              </button>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className={`card space-y-4 p-6 ${otherUser ? "hidden" : ""}`}>
          <div>
            <h2 className="text-base font-semibold">{mode === "signin" ? "Admin sign in" : "Create your password"}</h2>
            <p className="text-sm text-muted">
              {mode === "signin"
                ? "Pastors and admins only."
                : "Use the email the super admin added. Choose a password of at least 6 characters."}
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-9"
                placeholder="pastor@example.com"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Password</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="password"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-9"
              />
            </div>
          </label>

          {error && <p className="rounded-lg bg-brand-red-soft px-3 py-2 text-sm text-brand-red">{error}</p>}
          {info && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{info}</p>}

          <button type="submit" disabled={busy} className="btn-primary btn-md w-full">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create password"}
          </button>

          <button
            type="button"
            className="w-full text-center text-sm text-navy-600 hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "setup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? "First time? Create password" : "Already have a password? Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
