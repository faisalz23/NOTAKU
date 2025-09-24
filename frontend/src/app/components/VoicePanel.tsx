"use client";

import { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";
import { Diff, diffWords } from "diff";
import { supabaseBrowser } from "@/lib/supabaseClient";           // ⟵ NEW
import "@/app/styles/voice.css";

type Props = { apiBase?: string };

export default function VoicePanel({ apiBase = "" }: Props) {
  const supabase = supabaseBrowser();                              // ⟵ NEW

  // Refs & state (tidak berubah)
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timestampRef = useRef<HTMLSpanElement>(null);
  const charCountRef = useRef<HTMLSpanElement>(null);
  const connectionStatusRef = useRef<HTMLSpanElement>(null);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [manualStop, setManualStop] = useState(false);
  const [summarizeInFlight, setSummarizeInFlight] = useState(false);
  const [autoSummarizeEnabled] = useState(true);

  const fullTranscript = useRef<string>("");
  const lastFinalSummary = useRef<string>("");
  const pendingSummaryText = useRef<string>("");
  const streamBuffer = useRef<string>("");
  const firstTokenTimer = useRef<any>(null);
  const gotFirstToken = useRef<boolean>(false);
  const autoSummarizeTimer = useRef<any>(null);
  const progressInterval = useRef<any>(null);
  const clearHlTimer = useRef<any>(null);

  // UI helpers (unchanged) ....................................................
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    el.style.background = type === "success" ? "#22c55e" : "#ef4444";
    setTimeout(() => (el.style.display = "none"), 3000);
  };
  const showProgress = () => { const bar = progressBarRef.current, fill = progressFillRef.current; if (!bar || !fill) return;
    bar.style.display = "block"; fill.style.width = "0%"; let p = 0;
    progressInterval.current = setInterval(() => { p += Math.random() * 15; if (p > 90) p = 90; fill.style.width = `${p}%`; }, 200);
  };
  const hideProgress = () => { const bar = progressBarRef.current, fill = progressFillRef.current; if (!bar || !fill) return;
    bar.style.display = "none"; fill.style.width = "0%";
  };
  const completeProgress = () => { const fill = progressFillRef.current; if (!fill) return; fill.style.width = "100%"; setTimeout(hideProgress, 500); };
  const calcReadingTime = (t: string) => Math.ceil(t.split(/\s+/).filter(Boolean).length / 200);
  const updateCountDisplay = (text: string) => {
    const el = charCountRef.current; if (!el) return;
    if (!text) { el.textContent = ""; return; }
    const words = text.split(/\s+/).filter(Boolean).length; const minutes = calcReadingTime(text);
    el.textContent = `${text.length} karakter, ${words} kata, ~${minutes} menit baca`;
  };
  const escapeHtml = (s: string) => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const mdToHtml = (t: string) => escapeHtml(t || "").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/\n/g,"<br>");
  const renderDiff = (prev: string, next: string, el: HTMLElement) => {
    if (clearHlTimer.current) { clearTimeout(clearHlTimer.current); clearHlTimer.current = null; }
    if (!Diff || prev === next) { el.innerHTML = mdToHtml(next || ""); return; }
    const parts = diffWords(prev ?? "", next ?? "");
    el.innerHTML = parts.map((p:any) => {
      const html = mdToHtml(p.value);
      if (p.added) return `<span class="hl-add">${html}</span>`;
      if (p.removed) return "";
      return html;
    }).join("");
    clearHlTimer.current = setTimeout(() => { el.innerHTML = mdToHtml(next || ""); clearHlTimer.current = null; }, 2500);
  };

  // =========================
  // Init Socket.IO (KIRIM TOKEN)
  // =========================
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || undefined;

      if (!mounted) return;
      const s = io(apiBase || undefined, {
        transports: ["websocket"],
        upgrade: false,
        timeout: 8000,
        auth: { token },                                 // <<<<<< penting
      });
      setSocket(s);

      s.on("connect", () => {
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🟢 Terhubung";
          connectionStatusRef.current.style.color = "#22c55e";
        }
        setSummarizeInFlight(false);
      });
      s.on("disconnect", () => {
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🔴 Terputus";
          connectionStatusRef.current.style.color = "#ef4444";
        }
        setSummarizeInFlight(false);
      });
      s.on("connect_error", (err) => {
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🟡 Error";
          connectionStatusRef.current.style.color = "#ffc107";
        }
        setSummarizeInFlight(false);
        if (String(err?.message || "").includes("unauthorized")) {
          showToast("Sesi kadaluarsa. Silakan login ulang.", "error");
        }
      });

      // stream handler (unchanged)
      s.on("summary_stream", (data: any) => {
        const editor = editorRef.current!;
        if (!editor) return;
        if (data?.error) { setSummarizeInFlight(false); showToast(data.message || data.error, "error"); hideProgress(); return; }
        if (data?.token) {
          if (!gotFirstToken.current) { gotFirstToken.current = true; if (firstTokenTimer.current) { clearTimeout(firstTokenTimer.current); firstTokenTimer.current = null; } }
          streamBuffer.current += data.token;
        }
        if (data?.final) {
          const prev = lastFinalSummary.current || "";
          const next = (data.final || "").trim();
          try { renderDiff(prev, next, editor); } catch { editor.innerHTML = mdToHtml(next); }
          lastFinalSummary.current = next; updateCountDisplay(next);
        }
        if (data?.end) {
          if (!data.final) {
            if (firstTokenTimer.current) { clearTimeout(firstTokenTimer.current); firstTokenTimer.current = null; }
            pendingSummaryText.current = (pendingSummaryText.current + streamBuffer.current).trimStart();
            streamBuffer.current = "";
            const prev = lastFinalSummary.current || "";
            const next = (pendingSummaryText.current || "").trim();
            try { renderDiff(prev, next, editor); } catch { editor.innerHTML = mdToHtml(next); }
            lastFinalSummary.current = next; pendingSummaryText.current = ""; updateCountDisplay(next);
          }
          if (timestampRef.current) timestampRef.current.textContent = new Date().toLocaleString();
          setSummarizeInFlight(false); completeProgress(); showToast("Ringkasan final diperbarui", "success");
        }
      });
    })();

    // refresh token → reconnect otomatis jika user sign-out/in di tab lain
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, sess) => {
      const t = sess?.access_token;
      if (socket && socket.connected) socket.disconnect();
      const s2 = io(apiBase || undefined, {
        transports: ["websocket"],
        upgrade: false,
        timeout: 8000,
        auth: { token: t },
      });
      setSocket(s2);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); socket?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // =========================
  // Init SpeechRecognition (unchanged)
  // =========================
  useEffect(() => {
    const w = window as any;
    if (!("webkitSpeechRecognition" in w) && !("SpeechRecognition" in w)) {
      alert("Browser tidak mendukung Web Speech API (coba Chrome).");
      return;
    }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "id-ID";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const chunk = event.results[i][0].transcript || "";
        if (event.results[i].isFinal) fullTranscript.current += chunk + " ";
        else interim += chunk;
      }
      if (transcriptRef.current) transcriptRef.current.value = fullTranscript.current + interim;
      scheduleAutoSummarize();
    };

    rec.onstart = () => {
      if (transcriptRef.current) transcriptRef.current.value = "";
      if (editorRef.current) editorRef.current.innerHTML = "";
      fullTranscript.current = ""; lastFinalSummary.current = ""; pendingSummaryText.current = ""; streamBuffer.current = "";
      if (timestampRef.current) timestampRef.current.textContent = "";
      if (charCountRef.current) charCountRef.current.textContent = "";
    };

    rec.onend = () => { if (!manualStop) { try { rec.start(); } catch {} } };
    rec.onerror = (e: any) => { console.error("SpeechRecognition error:", e); showToast(`Gagal memulai/berjalan: ${e.error}`, "error"); };

    setRecognition(rec);
  }, []);

  // =========================
  // Actions: start/stop/summarize (HTTP fallback kirim token)
  // =========================
  const start = () => { setManualStop(false); try { recognition?.start(); } catch { showToast("Tidak bisa mulai (izin mic?)", "error"); } };
  const stop  = () => { setManualStop(true); try { recognition?.stop(); } catch {} socket?.emit("stop_stream"); setSummarizeInFlight(false); hideProgress(); };

  const requestSummarize = (text: string, showUI = true) => {
    if (summarizeInFlight || !text?.trim()) return;
    setSummarizeInFlight(true);

    if (showUI) {
      if (editorRef.current) editorRef.current.innerText = "Memproses ringkasan...";
      if (charCountRef.current) charCountRef.current.textContent = "Memproses...";
      showProgress(); editorRef.current?.classList.add("loading");
    }

    pendingSummaryText.current = ""; streamBuffer.current = ""; gotFirstToken.current = false;
    if (firstTokenTimer.current) { clearTimeout(firstTokenTimer.current); firstTokenTimer.current = null; }

    socket?.emit("summarize_stream", { text });

    // watchdog 3s → fallback HTTP /summarize (dengan Authorization)
    firstTokenTimer.current = setTimeout(async () => {
      if (!gotFirstToken.current && summarizeInFlight) {
        socket?.emit("stop_stream"); setSummarizeInFlight(false);
        try {
          const { data: { session } } = await supabase.auth.getSession();   // ⟵ NEW
          const token = session?.access_token;
          const res = await fetch(`${apiBase}/summarize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),       // ⟵ NEW
            },
            body: JSON.stringify({ text }),
          });
          const raw = await res.text();
          const data = raw ? JSON.parse(raw) : {};
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const next = (data.summary || "").trim();
          const prev = lastFinalSummary.current || "";
          if (editorRef.current) { try { renderDiff(prev, next, editorRef.current); } catch { editorRef.current.innerHTML = mdToHtml(next); } }
          lastFinalSummary.current = next; updateCountDisplay(next);
          if (timestampRef.current) timestampRef.current.textContent = new Date().toLocaleString();
          showToast("Ringkasan diperbarui (HTTP)", "success");
        } catch (err: any) {
          showToast(`Gagal fallback HTTP: ${err.message}`, "error");
        } finally {
          completeProgress();
        }
      }
    }, 3000);
  };

  const scheduleAutoSummarize = () => {
    if (!autoSummarizeEnabled) return;
    clearTimeout(autoSummarizeTimer.current);
    autoSummarizeTimer.current = setTimeout(() => {
      const text = transcriptRef.current?.value.trim() || "";
      if (text.length > 10) requestSummarize(text, false);
    }, 1200);
  };

  // Keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const text = transcriptRef.current?.value.trim() || "";
        if (text) requestSummarize(text, true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [summarizeInFlight]);

  return (
    <>
      <h2 style={{ textAlign: "center", margin: "8px 0 16px", color: "#1862d8" }}>
        🎙️ Realtime Voice to Text
      </h2>

      <div className="container">
        {/* Kiri */}
        <div className="column transcript-col">
          <textarea ref={transcriptRef} id="transcript" placeholder="Transkrip akan muncul di sini..." readOnly />
          <div className="btn-group">
            <button id="startBtn" onClick={start}>Mulai</button>
            <button id="stopBtn" onClick={stop}>Stop</button>
          </div>
        </div>

        {/* Kanan */}
        <div className="column summary-col">
          <div ref={progressBarRef} className="progress-bar" style={{ display: "none" }}>
            <div ref={progressFillRef} className="progress-fill" />
          </div>

          <div
            ref={editorRef}
            id="summaryEditor"
            className="editor"
            contentEditable
            data-placeholder="Ringkasan akan muncul di sini..."
            onInput={() => updateCountDisplay(editorRef.current?.textContent?.trim() || "")}
          />
        </div>
      </div>

      <div ref={toastRef} id="toast" className="toast" />
    </>
  );
}
