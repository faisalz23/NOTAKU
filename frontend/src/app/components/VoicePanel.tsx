"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Diff, diffWords } from "diff";
import { supabaseBrowser } from "@/lib/supabaseClient";
import "@/app/styles/voice.css";

type Props = { apiBase?: string };

export default function VoicePanel({ apiBase = "" }: Props) {
  const supabase = supabaseBrowser();

  // Pastikan jatuh ke backend:5001 bila env kosong
  const resolvedApiBase =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_BACKEND_ORIGIN ||
    apiBase ||
    "http://127.0.0.1:5001";

  // Refs & state
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timestampRef = useRef<HTMLSpanElement>(null);
  const charCountRef = useRef<HTMLSpanElement>(null);
  const connectionStatusRef = useRef<HTMLSpanElement>(null);

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [manualStop, setManualStop] = useState(false);
  const manualStopRef = useRef<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [summarizeInFlight, setSummarizeInFlight] = useState(false);
  const [autoSummarizeEnabled] = useState(true);
  const [micPromptOpen, setMicPromptOpen] = useState(false);
  const [micPromptAccepted, setMicPromptAccepted] = useState(false);

  const fullTranscript = useRef<string>("");
  const lastFinalSummary = useRef<string>("");
  const pendingSummaryText = useRef<string>("");
  const streamBuffer = useRef<string>("");
  const firstTokenTimer = useRef<any>(null);
  const gotFirstToken = useRef<boolean>(false);
  const autoSummarizeTimer = useRef<any>(null);
  const progressInterval = useRef<any>(null);
  const clearHlTimer = useRef<any>(null);

  // ---------------- UI helpers ----------------
  const isSocketReady = () => {
    const currentSocket = socketRef.current;
    const isReady = currentSocket && currentSocket.connected;
    console.log("🔍 isSocketReady check:", isReady, "socket:", currentSocket?.connected, "id:", currentSocket?.id);
    return isReady;
  };

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    el.style.background = type === "success" ? "#22c55e" : "#ef4444";
    setTimeout(() => (el.style.display = "none"), 3000);
  };
  const showProgress = () => {
    const bar = progressBarRef.current,
      fill = progressFillRef.current;
    if (!bar || !fill) return;
    bar.style.display = "block";
    fill.style.width = "0%";
    let p = 0;
    progressInterval.current = setInterval(() => {
      p += Math.random() * 15;
      if (p > 90) p = 90;
      fill.style.width = `${p}%`;
    }, 200);
  };
  const hideProgress = () => {
    const bar = progressBarRef.current,
      fill = progressFillRef.current;
    if (!bar || !fill) return;
    bar.style.display = "none";
    fill.style.width = "0%";
    if (progressInterval.current) clearInterval(progressInterval.current);
  };
  const completeProgress = () => {
    const fill = progressFillRef.current;
    if (!fill) return;
    fill.style.width = "100%";
    setTimeout(hideProgress, 500);
  };
  const calcReadingTime = (t: string) =>
    Math.ceil(t.split(/\s+/).filter(Boolean).length / 200);
  const updateCountDisplay = (text: string) => {
    const el = charCountRef.current;
    if (!el) return;
    if (!text) {
      el.textContent = "";
      return;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const minutes = calcReadingTime(text);
    el.textContent = `${text.length} karakter, ${words} kata, ~${minutes} menit baca`;
  };
  const escapeHtml = (s: string) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const mdToHtml = (t: string) =>
    escapeHtml(t || "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  const renderDiff = (prev: string, next: string, el: HTMLElement) => {
    if (clearHlTimer.current) {
      clearTimeout(clearHlTimer.current);
      clearHlTimer.current = null;
    }
    if (!Diff || prev === next) {
      el.innerHTML = mdToHtml(next || "");
      return;
    }
    const parts = diffWords(prev ?? "", next ?? "");
    el.innerHTML = parts
      .map((p: any) => {
        const html = mdToHtml(p.value);
        if (p.added) return `<span class="hl-add">${html}</span>`;
        if (p.removed) return "";
        return html;
      })
      .join("");
    clearHlTimer.current = setTimeout(() => {
      el.innerHTML = mdToHtml(next || "");
      clearHlTimer.current = null;
    }, 2500);
  };

  // ---------------- Init Socket.IO (send token via auth/query) ----------------
  useEffect(() => {
    let mounted = true;
    let s: Socket | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!mounted) return;
      s = io(resolvedApiBase, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        timeout: 8000,
        auth: token ? { token } : undefined,
        query: token ? { token } : undefined,
      });
      
      // Set socket state immediately after creation
      console.log("🔌 Creating socket:", s?.connected);
      setSocket(s);
      socketRef.current = s;

      // Handler untuk auth_result
      s.on("auth_result", (data: any) => {
        console.log("🔐 Auth result:", data);
        if (data?.ok) {
          console.log("✅ Authentication successful");
        } else {
          console.error("❌ Authentication failed:", data?.error);
        }
      });

      // Optional: autentikasi eksplisit setelah connect
      s.on("connect", async () => {
        console.log("✅ Socket connected successfully");
        // Update socket state immediately after connect
        setSocket(s);
        socketRef.current = s;
        
        // Pastikan token fresh saat connect
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const freshToken = session?.access_token;
          if (freshToken) {
            console.log("🔐 Authenticating with fresh token");
            s!.emit("authenticate", { token: freshToken });
          } else if (token) {
            console.log("🔐 Authenticating with initial token");
            s!.emit("authenticate", { token });
          } else {
            console.warn("⚠️ No token available for authentication");
          }
        } catch (err) {
          console.error("❌ Failed to get token on connect:", err);
        }
        
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🟢 Terhubung";
          connectionStatusRef.current.style.color = "#22c55e";
        }
        setSummarizeInFlight(false);
      });

      s.on("disconnect", () => {
        console.log("❌ Socket disconnected");
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🔴 Terputus";
          connectionStatusRef.current.style.color = "#ef4444";
        }
        setSummarizeInFlight(false);
        editorRef.current?.classList.remove("loading");
        hideProgress();
      });

      s.on("connect_error", (err) => {
        console.error("❌ Socket connection error:", err);
        if (connectionStatusRef.current) {
          connectionStatusRef.current.textContent = "🟡 Error";
          connectionStatusRef.current.style.color = "#ffc107";
        }
        setSummarizeInFlight(false);
        editorRef.current?.classList.remove("loading");
        hideProgress();
        if (String(err?.message || "").includes("unauthorized")) {
          showToast("Sesi kadaluarsa. Silakan login ulang.", "error");
        }
      });

      // Stream handler
      s.on("summary_stream", async (data: any) => {
        console.log("📡 Received summary_stream data:", data);
        const editor = editorRef.current!;
        if (!editor) return;

        if (data?.error) {
          console.error("❌ Summary stream error:", data.error);
          
          // Jika unauthorized, coba re-authenticate dan retry
          if (data.error === "unauthorized" || String(data.error).includes("unauthorized")) {
            console.log("🔐 Unauthorized error detected, attempting re-authentication...");
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              
              if (!token) {
                console.error("❌ No token available");
                showToast("Sesi kadaluarsa. Silakan login ulang.", "error");
                setSummarizeInFlight(false);
                hideProgress();
                editor.classList.remove("loading");
                return;
              }
              
              if (s && s.connected) {
                console.log("🔄 Re-authenticating socket with fresh token...");
                
                // Set up one-time listener untuk auth_result
                const authHandler = (authData: any) => {
                  s!.off("auth_result", authHandler);
                  if (authData?.ok) {
                    console.log("✅ Re-authentication successful, retrying summarize...");
                    const text = transcriptRef.current?.value.trim() || "";
                    if (text.length > 10) {
                      // Reset state sebelum retry
                      setSummarizeInFlight(false);
                      setTimeout(() => {
                        requestSummarize(text, false);
                      }, 300);
                    }
                  } else {
                    console.error("❌ Re-authentication failed:", authData?.error);
                    showToast("Gagal autentikasi. Silakan login ulang.", "error");
                    setSummarizeInFlight(false);
                    hideProgress();
                    editor.classList.remove("loading");
                  }
                };
                
                s.once("auth_result", authHandler);
                s.emit("authenticate", { token });
                
                // Timeout jika auth tidak selesai dalam 3 detik - fallback ke HTTP
                setTimeout(() => {
                  s!.off("auth_result", authHandler);
                  if (summarizeInFlight) {
                    console.error("❌ Re-authentication timeout, falling back to HTTP");
                    // Fallback ke HTTP summarize
                    setSummarizeInFlight(false);
                    const text = transcriptRef.current?.value.trim() || "";
                    if (text.length > 10) {
                      // Panggil HTTP fallback langsung
                      (async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const token = session?.access_token;
                          if (!token) {
                            showToast("Sesi kadaluarsa. Silakan login ulang.", "error");
                            hideProgress();
                            editor.classList.remove("loading");
                            return;
                          }
                          
                          setSummarizeInFlight(true);
                          const res = await fetch(`${resolvedApiBase}/summarize`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ text }),
                          });
                          const raw = await res.text();
                          const data = raw ? JSON.parse(raw) : {};
                          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

                          const next = (data.summary || "").trim();
                          const prev = lastFinalSummary.current || "";
                          if (editorRef.current) {
                            try {
                              renderDiff(prev, next, editorRef.current);
                            } catch {
                              editorRef.current.innerHTML = mdToHtml(next);
                            }
                            editorRef.current.classList.remove("loading");
                          }
                          lastFinalSummary.current = next;
                          updateCountDisplay(next);
                          if (timestampRef.current)
                            timestampRef.current.textContent = new Date().toLocaleString();
                          showToast("Notulensi diperbarui (HTTP fallback)", "success");
                        } catch (err: any) {
                          showToast(`Gagal: ${err.message}`, "error");
                        } finally {
                          completeProgress();
                          setSummarizeInFlight(false);
                          editor.classList.remove("loading");
                        }
                      })();
                    } else {
                      hideProgress();
                      editor.classList.remove("loading");
                    }
                  }
                }, 3000);
                
                return;
              } else {
                console.error("❌ Socket not connected");
                showToast("Koneksi terputus. Silakan refresh halaman.", "error");
              }
            } catch (err) {
              console.error("❌ Re-authentication failed:", err);
              showToast("Gagal autentikasi. Silakan login ulang.", "error");
            }
          } else {
            showToast(data.message || data.error, "error");
          }
          
          setSummarizeInFlight(false);
          hideProgress();
          editor.classList.remove("loading");
          return;
        }

        if (data?.token) {
          if (!gotFirstToken.current) {
            gotFirstToken.current = true;
            if (firstTokenTimer.current) {
              clearTimeout(firstTokenTimer.current);
              firstTokenTimer.current = null;
            }
          }
          streamBuffer.current += data.token;

          const prev =
            (lastFinalSummary.current || "") +
            (pendingSummaryText.current || "");
          const next = (prev + streamBuffer.current).trimStart();

          try {
            renderDiff(prev, next, editor);
          } catch {
            editor.innerHTML = mdToHtml(next);
          }
          updateCountDisplay(next);
        }

        if (data?.final) {
          const prev = lastFinalSummary.current || "";
          const next = (data.final || "").trim();
          try {
            renderDiff(prev, next, editor);
          } catch {
            editor.innerHTML = mdToHtml(next);
          }
          lastFinalSummary.current = next;
          updateCountDisplay(next);
          streamBuffer.current = "";
          pendingSummaryText.current = "";
        }

        if (data?.end) {
          if (!data.final) {
            if (firstTokenTimer.current) {
              clearTimeout(firstTokenTimer.current);
              firstTokenTimer.current = null;
            }
            pendingSummaryText.current = (
              pendingSummaryText.current + streamBuffer.current
            ).trimStart();
            streamBuffer.current = "";
            const prev = lastFinalSummary.current || "";
            const next = (pendingSummaryText.current || "").trim();
            try {
              renderDiff(prev, next, editor);
            } catch {
              editor.innerHTML = mdToHtml(next);
            }
            lastFinalSummary.current = next;
            pendingSummaryText.current = "";
            updateCountDisplay(next);
          }
          if (timestampRef.current)
            timestampRef.current.textContent = new Date().toLocaleString();
          setSummarizeInFlight(false);
          completeProgress();
          editor.classList.remove("loading");
          showToast("Notulensi final diperbarui", "success");
        }
      });

    })();

    // Reconnect saat session berubah
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, sess) => {
      const t = sess?.access_token;
      if (socket && socket.connected) socket.disconnect();
      const s2 = io(resolvedApiBase, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        timeout: 8000,
        auth: t ? { token: t } : undefined,
        query: t ? { token: t } : undefined,
      });
      s2.on("connect", () => {
        if (t) s2.emit("authenticate", { token: t });
      });
      setSocket(s2);
    });

    return () => {
      sub.subscription.unsubscribe();
      if (s) s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedApiBase]);

  // ---------------- Debug Socket State ----------------
  useEffect(() => {
    console.log("🔍 Socket state changed:", socket?.connected, socket?.id);
    console.log("🔍 Socket ref updated:", socketRef.current?.connected, socketRef.current?.id);
    socketRef.current = socket;
  }, [socket]);

  // ---------------- Init SpeechRecognition ----------------
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
      if (transcriptRef.current)
        transcriptRef.current.value = fullTranscript.current + interim;
      scheduleAutoSummarize();
    };

    rec.onend = () => {
      if (!manualStopRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };
    rec.onerror = (e: any) => {
      console.error("SpeechRecognition error:", e);
      showToast(`Gagal memulai/berjalan: ${e.error}`, "error");
    };

    setRecognition(rec);
  }, []);

  // ---------------- Actions ----------------
  const start = () => {
    setManualStop(false);
    manualStopRef.current = false;
    setIsRecording(true);

    // Reset UI hanya saat user klik Mulai
    if (transcriptRef.current) transcriptRef.current.value = "";
    if (editorRef.current) editorRef.current.innerHTML = "";
    fullTranscript.current = "";
    lastFinalSummary.current = "";
    pendingSummaryText.current = "";
    streamBuffer.current = "";
    if (timestampRef.current) timestampRef.current.textContent = "";
    if (charCountRef.current) charCountRef.current.textContent = "";

    try {
      recognition?.start();
    } catch {
      showToast("Tidak bisa mulai (izin mic?)", "error");
      setIsRecording(false);
    }
  };

  const handleStartClick = () => {
    if (!micPromptAccepted) {
      setMicPromptOpen(true);
      return;
    }
    start();
  };

  const confirmMicPrompt = () => {
    setMicPromptAccepted(true);
    setMicPromptOpen(false);
    start();
  };

  const cancelMicPrompt = () => setMicPromptOpen(false);

  const stop = () => {
    setManualStop(true);
    manualStopRef.current = true;
    setIsRecording(false);
    try {
      recognition?.stop();
    } catch {}
    socketRef.current?.emit("stop_stream");
    setSummarizeInFlight(false);
    hideProgress();
    editorRef.current?.classList.remove("loading");
    showToast("Rekaman dihentikan", "success");
  };

  const requestSummarize = async (text: string, showUI = true) => {
    console.log("🚀 requestSummarize called, text length:", text.length, "showUI:", showUI);
    if (summarizeInFlight || !text?.trim()) {
      console.log("❌ Request blocked - summarizeInFlight:", summarizeInFlight, "text empty:", !text?.trim());
      return;
    }

    // Retry mechanism jika socket belum siap
    if (!isSocketReady()) {
      console.log("⏳ Socket not ready, retrying in 500ms...");
      setTimeout(() => {
        if (isSocketReady()) {
          console.log("✅ Socket ready after retry, proceeding with summarize");
          requestSummarize(text, showUI);
        } else {
          console.error("❌ Socket still not ready after retry");
          showToast("Koneksi ke server belum siap. Silakan coba lagi.", "error");
        }
      }, 500);
      return;
    }

    // Pastikan token fresh sebelum emit
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        console.error("❌ No token available");
        showToast("Sesi kadaluarsa. Silakan login ulang.", "error");
        return;
      }

      // Re-authenticate socket dengan token fresh dan tunggu konfirmasi
      const currentSocket = socketRef.current!;
      if (currentSocket && currentSocket.connected) {
        console.log("🔐 Ensuring socket is authenticated with fresh token...");
        
        // Gunakan Promise untuk menunggu auth_result
        await new Promise<void>((resolve, reject) => {
          const authHandler = (authData: any) => {
            currentSocket.off("auth_result", authHandler);
            if (authData?.ok) {
              console.log("✅ Socket authenticated successfully");
              resolve();
            } else {
              console.error("❌ Authentication failed:", authData?.error);
              reject(new Error(authData?.error || "Authentication failed"));
            }
          };
          
          currentSocket.once("auth_result", authHandler);
          currentSocket.emit("authenticate", { token });
          
          // Timeout setelah 2 detik
          setTimeout(() => {
            currentSocket.off("auth_result", authHandler);
            reject(new Error("Authentication timeout"));
          }, 2000);
        });
      } else {
        console.error("❌ Socket not connected");
        showToast("Koneksi terputus. Silakan refresh halaman.", "error");
        return;
      }
    } catch (err: any) {
      console.error("❌ Failed to authenticate:", err);
      showToast(err.message || "Gagal autentikasi. Silakan login ulang.", "error");
      return;
    }

    setSummarizeInFlight(true);

    if (showUI) {
      if (editorRef.current) editorRef.current.innerText = "Memproses notulensi...";
      if (charCountRef.current) charCountRef.current.textContent = "Memproses...";
      showProgress();
      editorRef.current?.classList.add("loading");
    }

    pendingSummaryText.current = "";
    streamBuffer.current = "";
    gotFirstToken.current = false;
    if (firstTokenTimer.current) {
      clearTimeout(firstTokenTimer.current);
      firstTokenTimer.current = null;
    }

    // Minta stream dari server
    const currentSocket = socketRef.current!;
    console.log("📤 Emitting summarize_stream to socket:", currentSocket.connected, "id:", currentSocket.id);
    currentSocket.emit("summarize_stream", { text });

    // Watchdog 3s -> fallback HTTP /summarize
    firstTokenTimer.current = setTimeout(async () => {
      if (!gotFirstToken.current && summarizeInFlight) {
        socketRef.current?.emit("stop_stream");
        setSummarizeInFlight(false);
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;
          const res = await fetch(`${resolvedApiBase}/summarize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ text }),
          });
          const raw = await res.text();
          const data = raw ? JSON.parse(raw) : {};
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

          const next = (data.summary || "").trim();
          const prev = lastFinalSummary.current || "";
          if (editorRef.current) {
            try {
              renderDiff(prev, next, editorRef.current);
            } catch {
              editorRef.current.innerHTML = mdToHtml(next);
            }
            editorRef.current.classList.remove("loading");
          }
          lastFinalSummary.current = next;
          updateCountDisplay(next);
          if (timestampRef.current)
            timestampRef.current.textContent = new Date().toLocaleString();
          showToast("Notulensi diperbarui (HTTP)", "success");
        } catch (err: any) {
          showToast(`Gagal fallback HTTP: ${err.message}`, "error");
        } finally {
          completeProgress();
          setSummarizeInFlight(false);
          editorRef.current?.classList.remove("loading");
        }
      }
    }, 1500);
  };

  const scheduleAutoSummarize = () => {
    console.log("🔄 scheduleAutoSummarize called, autoSummarizeEnabled:", autoSummarizeEnabled);
    if (!autoSummarizeEnabled) return;
    clearTimeout(autoSummarizeTimer.current);
    autoSummarizeTimer.current = setTimeout(() => {
      const text = transcriptRef.current?.value.trim() || "";
      console.log("⏰ Auto-summarize timer triggered, text length:", text.length);
      if (text.length > 10) {
        console.log("📝 Requesting auto-summarize for text:", text.substring(0, 100) + "...");
        requestSummarize(text, false);
      }
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
    <div className="vp">
      <h2 style={{ textAlign: "center", margin: "8px 0 16px", color: "#1e293b" }}>
        🎙️ Notulensi Rapat Otomatis
      </h2>

      {/* Status koneksi (opsional tampilkan di UI-mu) */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <span ref={connectionStatusRef}>🟡 Menghubungkan…</span>
        <span style={{ marginLeft: 12 }} ref={timestampRef} />
      </div>

      <div className="container">
        {/* Kiri */}
        <div className="column transcript-col">
          <textarea
            ref={transcriptRef}
            id="transcript"
            placeholder="Transkripsi rapat akan muncul di sini..."
            readOnly
          />
          <div className="btn-group">
            <button 
              id="startBtn" 
              onClick={handleStartClick}
              style={{
                opacity: isRecording ? 0.6 : 1,
                cursor: isRecording ? "not-allowed" : "pointer",
              }}
              disabled={isRecording}
            >
              Mulai
            </button>
            <button 
              id="stopBtn" 
              onClick={stop}
              style={{
                background: isRecording ? "#ef4444" : "#6b7280",
                color: "#ffffff",
                opacity: isRecording ? 1 : 0.6,
                cursor: isRecording ? "pointer" : "not-allowed",
                transition: "all 0.3s ease",
                boxShadow: isRecording ? "0 0 12px rgba(239, 68, 68, 0.5)" : "none",
                transform: isRecording ? "scale(1)" : "scale(0.95)",
              }}
              disabled={!isRecording}
            >
              {isRecording ? "⏹ Menghentikan..." : "Stop"}
            </button>
          </div>
        </div>

        {/* Kanan */}
        {/* Kanan */}
<div className="column summary-col">
  <div
    ref={progressBarRef}
    className="progress-bar"
    style={{ display: "none" }}
  >
    <div ref={progressFillRef} className="progress-fill" />
  </div>

  <div
    ref={editorRef}
    id="summaryEditor"
    className="editor"
    contentEditable
    data-placeholder="Notulensi rapat akan muncul di sini..."
    onInput={() =>
      updateCountDisplay(editorRef.current?.textContent?.trim() || "")
    }
  />
  <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
    <span ref={charCountRef} />
  </div>

  {/* ✅ Tombol Simpan */}
  <div className="saveWrap" style={{ textAlign: "right" }}>
    <button
      onClick={async () => {
        const summaryText = editorRef.current?.textContent?.trim();
        const transcriptText = transcriptRef.current?.value?.trim();

        if (!summaryText) {
          showToast("Tidak ada notulensi untuk disimpan.", "error");
          return;
        }

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) {
            showToast("Silakan login terlebih dahulu.", "error");
            return;
          }

          const user = session.user;
          
          // Generate title dari summary (ambil 50 karakter pertama)
          const title = summaryText.substring(0, 50).replace(/\n/g, " ").trim() + (summaryText.length > 50 ? "..." : "");
          
          // Hitung durasi dari panjang transcript (estimasi: ~150 kata per menit)
          const wordCount = (transcriptText || "").split(/\s+/).filter(Boolean).length;
          const estimatedMinutes = Math.max(1, Math.round(wordCount / 150));
          const duration = estimatedMinutes === 1 ? "1 menit" : `${estimatedMinutes} menit`;

          console.log("💾 Menyimpan notulensi ke Supabase...", {
            user_id: user.id,
            title: title,
            transcript_length: transcriptText?.length || 0,
            summary_length: summaryText.length,
          });

          const nowIso = new Date().toISOString();

          // 1) Buat record meeting (status: finished, waktu sekarang)
          const { data: meetingRow, error: meetingError } = await supabase
            .from("meetings")
            .insert([
              {
                user_id: user.id,
                title: title || "Notulensi Rapat",
                status: "finished",
                started_at: nowIso,
                finished_at: nowIso,
                created_at: nowIso,
              },
            ])
            .select("meeting_id")
            .single();

          if (meetingError || !meetingRow) {
            console.error("❌ Gagal membuat meeting:", meetingError);
            showToast("Gagal membuat data meeting. Pastikan tabel 'meetings' sudah dibuat dan RLS mengizinkan.", "error");
            return;
          }

          // 2) Simpan notulensi ke tabel notes (relasi ke meeting_id)
          const insertNote = {
            meeting_id: meetingRow.meeting_id,
            transcript_text: transcriptText || "",
            summary_content: summaryText,
            is_shared: false,
            created_at: nowIso,
          };

          console.log("📤 Data yang akan disimpan ke notes:", insertNote);

          const { data, error, status, statusText } = await supabase
            .from("notes")
            .insert([insertNote])
            .select("note_id")
            .single();

          if (error) {
            // Log semua informasi yang tersedia
            console.error("❌ Supabase error object:", error);
            console.error("❌ Error properties:", Object.keys(error));
            console.error("❌ Error values:", {
              message: error?.message,
              code: error?.code,
              details: error?.details,
              hint: error?.hint,
              status: status,
              statusText: statusText,
            });
            
            // Coba akses error dengan berbagai cara
            let errorMsg = "Gagal menyimpan notulensi";
            
            // Cek semua property yang mungkin ada
            const errorProps = {
              message: (error as any)?.message,
              code: (error as any)?.code,
              details: (error as any)?.details,
              hint: (error as any)?.hint,
              error: (error as any)?.error,
              status: status,
              statusText: statusText,
            };
            
            console.error("❌ All error properties:", errorProps);
            
            // Prioritaskan message, lalu code, lalu details
            if (errorProps.message) {
              errorMsg = errorProps.message;
            } else if (errorProps.code) {
              errorMsg = `Error code: ${errorProps.code}`;
              if (errorProps.details) errorMsg += ` - ${errorProps.details}`;
              if (errorProps.hint) errorMsg += ` (${errorProps.hint})`;
            } else if (errorProps.details) {
              errorMsg = errorProps.details;
            } else if (errorProps.error) {
              errorMsg = String(errorProps.error);
            } else {
              // Jika semua kosong, kemungkinan besar table belum dibuat atau RLS issue
              errorMsg = "Tabel 'notes' atau 'meetings' belum siap, atau RLS tidak mengizinkan insert. Pastikan sudah menjalankan SQL di backend/setup_database.sql.";
            }
            
            throw new Error(errorMsg);
          }

          console.log("✅ Notulensi berhasil disimpan:", data);
          showToast("Notulensi berhasil disimpan!", "success");
          
          // Reset setelah simpan (opsional)
          // Bisa di-comment jika ingin tetap menampilkan notulensi
          // if (transcriptRef.current) transcriptRef.current.value = "";
          // if (editorRef.current) editorRef.current.innerHTML = "";
        } catch (err: any) {
          console.error("❌ Gagal menyimpan:", err);
          
          // Handle berbagai jenis error
          let errorMessage = "Gagal menyimpan notulensi.";
          
          if (err.message) {
            errorMessage = err.message;
          } else if (err.code) {
            errorMessage = `Error ${err.code}: ${err.message || "Unknown error"}`;
          } else if (typeof err === "string") {
            errorMessage = err;
          } else if (err.error) {
            errorMessage = err.error.message || JSON.stringify(err.error);
          } else {
            errorMessage = JSON.stringify(err);
          }
          
          // Pesan yang lebih user-friendly
          if (errorMessage.includes("relation") && errorMessage.includes("does not exist")) {
            errorMessage = "Tabel 'meetings' atau 'notes' belum dibuat. Jalankan SQL di backend/setup_database.sql.";
          } else if (errorMessage.includes("permission denied") || errorMessage.includes("RLS")) {
            errorMessage = "Permission denied. Pastikan Row Level Security policy sudah dibuat dengan benar.";
          } else if (errorMessage.includes("new row violates row-level security")) {
            errorMessage = "Row Level Security policy tidak mengizinkan insert. Periksa policy di Supabase.";
          }
          
          showToast(errorMessage, "error");
        }
      }}
      style={{
        background: "#1862d8",
        color: "white",
        padding: "6px 14px",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Simpan
    </button>
  </div>
</div>

      </div>

      {/* Modal izin mic (custom) */}
      {micPromptOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "20px",
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontWeight: 700, color: "#0f172a" }}>
              Izinkan mikrofon?
            </h3>
            <p style={{ margin: "0 0 12px", color: "#475569", lineHeight: 1.5 }}>
              Aplikasi perlu akses mikrofon untuk transkripsi real-time. Klik “Izinkan & Mulai”
              untuk memulai rekaman.
            </p>
            <ul style={{ margin: "0 0 16px 16px", color: "#475569", lineHeight: 1.5, fontSize: 14 }}>
              <li>Pastikan perangkat mic terpilih di sistem/browser.</li>
              <li>Izin bisa diubah di pengaturan situs browser jika sebelumnya ditolak.</li>
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={cancelMicPrompt}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
              <button
                onClick={confirmMicPrompt}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#1862d8",
                  color: "#fff",
                  cursor: "pointer",
                  boxShadow: "0 10px 24px rgba(24,98,216,0.35)",
                }}
              >
                Izinkan & Mulai
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={toastRef} id="toast" className="toast" />
    </div>
  );
}
