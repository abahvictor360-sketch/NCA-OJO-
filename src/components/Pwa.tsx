"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker and shows an "Install app" button where the browser supports it */
export default function Pwa() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // The desktop app serves files itself and does not need a service worker
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!install || hidden) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lg">
      <span className="text-sm">Install NCA Ojo on this device</span>
      <button
        className="btn-primary btn-sm"
        onClick={async () => {
          await install.prompt();
          setInstall(null);
        }}
      >
        <Download className="size-3.5" /> Install
      </button>
      <button className="p-1 text-muted" onClick={() => setHidden(true)} aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
