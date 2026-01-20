"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import SharePopup from "@/app/components/SharePopup";
import s from "@/app/styles/dashboard.module.css"; // reuse layout styles
import h from "@/app/styles/history.module.css";   // styles khusus history

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type HistoryItem = {
  id: string;
  title?: string;
  date: string;       
  duration: string;   
  transcript: string;
  summary: string;
  created_at?: string;
};

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = supabaseBrowser();
  const avatarRef = useRef<HTMLDivElement | null>(null);

  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  
  // ui state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const toggleSidebar = () => setSidebarOpen((v) => !v);
  
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [shareTarget, setShareTarget] = useState<HistoryItem | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Load history from Supabase
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

      // Load history dari tabel notes (join meetings)
      try {
        const { data, error } = await supabase
          .from("notes")
          .select(`
            note_id,
            transcript_text,
            summary_content,
            created_at,
            meetings:meeting_id ( title, started_at, finished_at, user_id )
          `)
          .eq("meetings.user_id", session.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (mounted && data) {
          const formattedItems: HistoryItem[] = data.map((item: any) => {
            const date = new Date(item.created_at || Date.now());
            const formattedDate = date.toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            // Estimasi durasi dari started_at/finished_at jika ada
            let duration = "Tidak diketahui";
            if (item.meetings?.started_at && item.meetings?.finished_at) {
              const start = new Date(item.meetings.started_at);
              const end = new Date(item.meetings.finished_at);
              const diffMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
              duration = diffMin === 1 ? "1 menit" : `${diffMin} menit`;
            }

            return {
              id: item.note_id,
              title: item.meetings?.title || "Notulensi Rapat",
              date: formattedDate,
              duration,
              transcript: item.transcript_text || "",
              summary: item.summary_content || "",
              created_at: item.created_at,
            };
          });
          setItems(formattedItems);
        }
      } catch (err: any) {
        console.error("Error loading history:", err);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoadingHistory(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (!sess) router.replace("/login");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      const wasMobile = isMobile;
      setIsMobile(mobile);
      
      // Auto-close sidebar when switching to mobile
      if (mobile && sidebarOpen) {
        setSidebarOpen(false);
      }
      // Auto-open sidebar when switching to desktop
      else if (!mobile && wasMobile) {
        setSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile, sidebarOpen]);

  // Close dropdown when clicking outside (only attach listener while open)
  useEffect(() => {
    if (!showProfileDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const host = avatarRef.current;
      if (host && target && !host.contains(target)) setShowProfileDropdown(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileDropdown]);

  const username = meta.username || email.split("@")[0] || "User";
  const avatar = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.date.toLowerCase().includes(q) ||
        it.duration.toLowerCase().includes(q) ||
        it.transcript.toLowerCase().includes(q) ||
        it.summary.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Transkrip tersalin ✅");
    } catch {
      alert("Gagal menyalin.");
    }
  };

  const handleExport = (item: HistoryItem) => {
    try {
      console.log("Export started for:", item);
      const content = `Notulensi Rapat\n\nJudul: ${item.title}\nTanggal: ${item.date}\nDurasi: ${item.duration}\n\nTranskripsi:\n${item.transcript}\n\nNotulensi:\n${item.summary}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notulensi-rapat-${item.id}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log("Export completed");
      setSuccessMessage("Notulensi berhasil diunduh ✅");
      setSuccessModalOpen(true);
      setTimeout(() => setSuccessModalOpen(false), 2000);
    } catch (err) {
      console.error("Error exporting:", err);
      setSuccessMessage("Gagal mengunduh notulensi.");
      setSuccessModalOpen(true);
      setTimeout(() => setSuccessModalOpen(false), 2000);
    }
  };

  const handleShare = (item: HistoryItem) => {
    console.log("Share clicked for:", item);
    setShareTarget(item);
    setShowSharePopup(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("notes").delete().eq("note_id", id);

      if (error) throw error;

      setItems((prev) => prev.filter((x) => x.id !== id));
      alert("Riwayat berhasil dihapus ✅");
    } catch (err: any) {
      console.error("Error deleting history:", err);
      alert("Gagal menghapus riwayat. Silakan coba lagi.");
    }
  };

  const openDeleteModal = (item: HistoryItem) => {
    setDeleteTarget(item);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    await handleDelete(deleteTarget.id);
    setDeleting(false);
    closeDeleteModal();
  };

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

  if (loading || loadingHistory) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Memuat riwayat...</div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${s.app} ${sidebarOpen ? "" : s.appCollapsed}`}>
      {/* Overlay for mobile */}
      {isMobile && sidebarOpen && <div className={s.sidebarOverlay} onClick={toggleSidebar} />}
      
      {/* SIDEBAR */}
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

          <div className={s.sbFooter}>
            <div style={{ opacity: 0.6 }}>© 2025 NotaKu</div>
          </div>
        </div>
      </aside>
      

      {/* TOPBAR */}
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
              <input
                type="search"
                placeholder="Search history..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search history"
              />
            </div>
          </div>

          <div className={s.rightGroup}>
            <div className={s.avatar} onClick={toggleProfileDropdown} ref={avatarRef}>
              <Image
                src={avatar}
                alt="Foto profil"
                width={40}
                height={40}
                unoptimized
                className={s.avatarImg}
              />
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

      {/* CONTENT */}
      <main className={s.content}>
        <div className={h.historyContainer}>
          <div className={h.historyHeader}>
            <h2 className={h.title}>Riwayat Notulensi Rapat</h2>
          </div>

          {filtered.length === 0 ? (
            <div className={h.emptyState}>
              <div className={h.emptyIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v5l4 2"></path>
                  <path d="M21 12A9 9 0 1 1 3 12"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </div>
              <h3>Belum Ada Riwayat</h3>
              <p>Mulai gunakan Notulensi Rapat untuk melihat riwayat transkripsi dan notulensi Anda di sini. Setelah menyimpan notulensi, data akan muncul di sini.</p>
            </div>
          ) : (
            <div className={h.historyGrid}>
              {filtered.map((it) => (
                <article key={it.id} className={h.historyCard}>
                  <div className={h.cardHeader}>
                    <div className={h.cardDate}>
                      <span className={h.dateIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                      </span>
                      {it.date}
                      {it.duration && (
                        <>
                          <span style={{ margin: "0 8px", opacity: 0.5 }}>•</span>
                          <span style={{ fontSize: "12px", opacity: 0.7 }}>{it.duration}</span>
                        </>
                      )}
                    </div>
                    <div className={h.cardTopActions}>
                      <button className={h.exportBtn} onClick={() => handleExport(it)} title="Export">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7,10 12,15 17,10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </button>
                      <button className={h.shareBtn} onClick={() => handleShare(it)} title="Share">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="18" cy="5" r="3"></circle>
                          <circle cx="6" cy="12" r="3"></circle>
                          <circle cx="18" cy="19" r="3"></circle>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className={h.cardContent}>
                    <div className={h.transcriptSection}>
                      <h4 className={h.sectionTitle}>
                        <span className={h.sectionIcon}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                          </svg>
                        </span>
                        Transkripsi
                      </h4>
                      <div className={h.transcriptText}>
                        {it.transcript}
                      </div>
                    </div>

                    <div className={h.summarySection}>
                      <h4 className={h.sectionTitle}>
                        <span className={h.sectionIcon}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14,2 14,8 20,8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10,9 9,9 8,9"></polyline>
                          </svg>
                        </span>
                        Notulensi
                      </h4>
                      <div className={h.summaryText}>
                        {it.summary}
                      </div>
                    </div>
                  </div>

                  <div className={h.cardActions}>
                          <button className={`${h.actionBtn} ${h.secondaryBtn}`} onClick={() => router.push(`/detail/${it.id}`)}>
                            <span className={h.btnIcon}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </svg>
                            </span>
                            View Details
                          </button>
                    <button className={`${h.actionBtn} ${h.secondaryBtn}`} onClick={() => handleCopy(it.transcript)}>
                      <span className={h.btnIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        </svg>
                      </span>
                      Copy
                    </button>
                    <button className={`${h.actionBtn} ${h.dangerBtn}`} onClick={() => openDeleteModal(it)}>
                      <span className={h.btnIcon}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,6 5,6 21,6"></polyline>
                          <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </span>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal konfirmasi hapus */}
      {deleteModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "16px",
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: "20px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontWeight: 700, color: "#0f172a" }}>
              Hapus notulensi ini?
            </h3>
            <p style={{ margin: "0 0 16px", color: "#475569", lineHeight: 1.5 }}>
              Tindakan ini tidak bisa dibatalkan. Notulensi dan transkripsi akan dihapus permanen.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={closeDeleteModal}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: "white",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: deleting ? "#94a3b8" : "#ef4444",
                  color: "white",
                  cursor: deleting ? "not-allowed" : "pointer",
                  boxShadow: "0 8px 20px rgba(239,68,68,0.35)",
                }}
              >
                {deleting ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {successModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "16px",
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: "20px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto", color: "#22c55e" }}>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p style={{ margin: "0", fontWeight: 500, color: "#0f172a", fontSize: "16px" }}>
              {successMessage}
            </p>
          </div>
        </div>
      )}

      {/* Share Popup */}
      <SharePopup
        isOpen={showSharePopup}
        onClose={() => setShowSharePopup(false)}
        documentId={shareTarget?.id || ""}
        documentTitle={shareTarget?.title}
      />
    </div>
  );
}

