"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import s from "@/app/styles/dashboard.module.css";
import VoicePanel from "@/app/components/VoicePanel";
import { supabaseBrowser } from "@/lib/supabaseClient";

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type RecentNote = {
  id: string;
  title: string;
  summary: string;
  time: string; // human readable
};

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser();
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});

  // ui state
  const [listening, setListening] = useState(false);
  const toggleListening = () => setListening((v) => !v);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  // stats
  const [totalMeetings, setTotalMeetings] = useState<number>(0);
  const [totalNotes, setTotalNotes] = useState<number>(0);
  const [totalWords, setTotalWords] = useState<number>(0);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [statsLoading, setStatsLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session) {
        router.replace("/login");
        return;
      }
      setEmail(session.user.email || "");
      setMeta((session.user.user_metadata as UserMeta) || {});
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (!sess) router.replace("/login");
    });

    // load stats & recent notes
    (async () => {
      try {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) return;

        // total meetings
        const { count: meetingsCount, error: meetingsErr } = await supabase
          .from("meetings")
          .select("meeting_id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (!meetingsErr && typeof meetingsCount === "number") setTotalMeetings(meetingsCount);

        // notes data (for count, recent, and word count)
        const { data: notesData, count: notesCount, error: notesErr } = await supabase
          .from("notes")
          .select(
            `
              note_id,
              transcript_text,
              summary_content,
              created_at,
              meetings:meeting_id ( title, user_id )
            `,
            { count: "exact" }
          )
          .eq("meetings.user_id", userId)
          .order("created_at", { ascending: false });

        if (!notesErr) {
          if (typeof notesCount === "number") setTotalNotes(notesCount);

          // word count from transcript_text
          const totalWordsCalc =
            notesData?.reduce((acc, n) => acc + (n.transcript_text || "").split(/\s+/).filter(Boolean).length, 0) || 0;
          setTotalWords(totalWordsCalc);

          // recent 4
          const recent = (notesData || []).slice(0, 4).map((n: any) => {
            const time = new Date(n.created_at || Date.now()).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return {
              id: n.note_id,
              title: n.meetings?.title || "Notulensi Rapat",
              summary: n.summary_content || "",
              time,
            } as RecentNote;
          });
          setRecentNotes(recent);
        }
      } catch (e) {
        console.error("Failed to load dashboard stats:", e);
      } finally {
        setStatsLoading(false);
      }
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  // detect mobile and keep sidebar behavior consistent
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close dropdown when clicking outside (listener hanya aktif saat dropdown terbuka)
  useEffect(() => {
    if (!showProfileDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (avatarRef.current && !avatarRef.current.contains(target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileDropdown]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  const closeProfileDropdown = () => {
    setShowProfileDropdown(false);
  };

  const username = meta.username || "Faisal";
  const avatar   = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Memuat dashboard…</div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${s.app} ${sidebarOpen ? "" : s.appCollapsed}`}>
      <aside className={`${s.sidebar} ${sidebarOpen ? "" : s.sidebarCollapsed}`}>
        <div className={s.sbInner}>
          <div className={s.brand}>
            <div className={s.brandName}>NotaKu</div>
          </div>

          <nav className={s.nav} aria-label="Sidebar">
            <a
              className={`${s.navItem} ${pathname === "/dashboard" ? s.active : ""}`}
              href="/dashboard"
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
              <span>Dashboard</span>
            </a>
            <a
              className={`${s.navItem} ${pathname === "/history" ? s.active : ""}`}
              href="/history"
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span>History</span>
            </a>
            <a
              className={`${s.navItem} ${pathname === "/settings" ? s.active : ""}`}
              href="/settings"
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Settings</span>
            </a>
          </nav>

          {/* Footer sidebar */}
          <div className={s.sbFooter}>
            <div style={{ opacity: 0.6 }}>© 2025 NotaKu</div>
          </div>
        </div>
      </aside>

      {/* overlay for mobile when sidebar open */}
      {isMobile && sidebarOpen && (
        <div
          className={s.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <header className={s.topbar}>
        <div className={s.tbWrap}>
          <div className={s.leftGroup}>
            <button
              className={s.sidebarToggle}
              aria-pressed={!sidebarOpen}
              aria-label={sidebarOpen ? "Tutup sidebar" : "Buka sidebar"}
              onClick={toggleSidebar}
            >
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <div className={s.search} role="search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input type="search" placeholder="Search something..." />
            </div>
          </div>

          <div className={s.rightGroup}>
            <button className={s.listenBtn} aria-pressed={listening} onClick={toggleListening}>
              <span className={s.dot} aria-hidden />
              <span className={s.btnLabel}>{listening ? "Stop Listening" : "Start Listening"}</span>
            </button>

            <div className={s.avatar} onClick={toggleProfileDropdown} ref={avatarRef}>
              <Image src={avatar} alt="Foto profil" width={40} height={40} unoptimized className={s.avatarImg} />
              <div className={s.meta}>
                <div className={s.name}>{username}</div>
                <div className={s.role}></div>
              </div>
              
              {showProfileDropdown && (
                <div className={s.profileDropdown}>
                  <button className={s.dropdownItem} onClick={() => {
                    closeProfileDropdown();
                    router.push('/profile');
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Profile
                  </button>
                  <button className={s.dropdownItem} onClick={onLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16,17 21,12 16,7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={s.content}>
        {!listening ? (
          <div className={s.dashboardContainer}>
            {/* 3 Cards di bagian atas */}
            <div className={s.topCards}>
              <div className={s.statsCard}>
                <div className={s.cardIcon}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </div>
                <div className={s.cardContent}>
                  <h3>Total Rapat</h3>
                  <div className={s.cardValue}>{statsLoading ? "…" : totalMeetings}</div>
                  <div className={s.cardSubtext}>Total meeting tersimpan</div>
                </div>
              </div>

              <div className={s.statsCard}>
                <div className={s.cardIcon}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10,9 9,9 8,9"></polyline>
                  </svg>
                </div>
                <div className={s.cardContent}>
                  <h3>Kata Ditranskripsi</h3>
                  <div className={s.cardValue}>{statsLoading ? "…" : totalWords.toLocaleString("id-ID")}</div>
                  <div className={s.cardSubtext}>Akumulasi dari transkripsi</div>
                </div>
              </div>

              <div className={s.statsCard}>
                <div className={s.cardIcon}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h7l-1 8 10-12h-7z"></path>
                  </svg>
                </div>
                <div className={s.cardContent}>
                  <h3>Notulensi Dibuat</h3>
                  <div className={s.cardValue}>{statsLoading ? "…" : totalNotes}</div>
                  <div className={s.cardSubtext}>Total notulensi tersimpan</div>
                </div>
              </div>
            </div>

            {/* Recent Activity (recent opened summarize files) */}
            <div className={s.recentSection}>
              <h2>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', display: 'inline-block', verticalAlign: 'middle'}}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12,6 12,12 16,14"></polyline>
                </svg>
                Notulensi Terbaru
              </h2>
              <div className={s.recentList}>
                {recentNotes.map((item) => (
                  <div key={item.id} className={s.recentItem}>
                    <div className={s.recentIcon}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10,9 9,9 8,9"></polyline>
                      </svg>
                    </div>
                    <div className={s.recentContent}>
                      <div className={s.recentTitle}>{item.title}</div>
                      <div className={s.recentDesc}>
                        {item.summary?.slice(0, 120) || "Tidak ada ringkasan"}
                        {item.summary?.length > 120 ? "…" : ""}
                      </div>
                      <div className={s.recentTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
                {(!recentNotes || recentNotes.length === 0) && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14,2 14,8 20,8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10,9 9,9 8,9"></polyline>
                    </svg>
                    <p style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 500, color: '#1f2937' }}>Belum Ada Notulensi</p>
                    <p style={{ margin: '0 0 24px', fontSize: '14px' }}>Mulai buat notulensi rapat pertama Anda sekarang!</p>
                    <button 
                      onClick={toggleListening}
                      style={{
                        padding: '10px 24px',
                        background: 'linear-gradient(to right, #3b82f6, #2563eb)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                        transition: 'all 0.2s'
                      }}
                    >
                      Mulai Rekam Sekarang
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Tips & Best Practices */}
            <div style={{ marginTop: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#1f2937' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', display: 'inline-block', verticalAlign: 'middle'}}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Tips & Panduan
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ fontSize: '24px', flexShrink: 0 }}>🎤</div>
                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>Mulai Rekaman</h3>
                      <p style={{ margin: '0', fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>Klik tombol "Start Listening" untuk memulai merekam suara rapat Anda</p>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ fontSize: '24px', flexShrink: 0 }}>✨</div>
                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Ringkasan Otomatis</h3>
                      <p style={{ margin: '0', fontSize: '13px', color: '#78350f', lineHeight: '1.5' }}>AI akan otomatis membuat ringkasan rapat Anda secara real-time</p>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ fontSize: '24px', flexShrink: 0 }}>📤</div>
                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: '#166534' }}>Export & Bagikan</h3>
                      <p style={{ margin: '0', fontSize: '13px', color: '#15803d', lineHeight: '1.5' }}>Simpan notulensi dalam format txt atau bagikan dengan tim Anda</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={s.voiceWrap} id="voice-container">
            <div className={s.voiceFrame}>
              <VoicePanel apiBase={process.env.NEXT_PUBLIC_API_BASE || ""} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
