"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import SharePopup from "@/app/components/SharePopup";
import s from "@/app/styles/dashboard.module.css";
import d from "@/app/styles/detail.module.css";

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type HistoryItem = {
  id: string;
  date: string;       
  duration: string;   
  transcript: string;
  summary: string;
};

// Sample data - in real app this would come from API/database
const SAMPLE_DATA: { [key: string]: HistoryItem } = {
  "1": {
    id: "1",
    date: "15 Januari 2025, 14:30",
    duration: "2 menit 15 detik",
    transcript: 'Selamat siang semua, hari ini kita akan membahas progress proyek yang sedang berjalan. Tim development sudah menyelesaikan fitur utama dan sedang dalam tahap testing. Kita perlu koordinasi untuk deployment minggu depan. Selain itu, ada beberapa bug yang perlu diperbaiki sebelum release.',
    summary: "Rapat membahas progress proyek. Tim development telah menyelesaikan fitur utama dan sedang testing. Perlu koordinasi untuk deployment minggu depan dan perbaikan bug sebelum release.",
  },
  "2": {
    id: "2", 
    date: "15 Januari 2025, 10:15",
    duration: "1 menit 45 detik",
    transcript: "Rapat koordinasi tim untuk membahas timeline dan resource yang dibutuhkan. Kita perlu memastikan semua anggota tim memahami tugas masing-masing dan deadline yang telah ditetapkan. Ada beberapa kendala yang perlu diselesaikan bersama.",
    summary: "Rapat koordinasi membahas timeline dan resource. Perlu memastikan semua anggota memahami tugas dan deadline, serta menyelesaikan kendala bersama.",
  },
};

export default function DetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = supabaseBrowser();
  const id = params.id as string;

  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // detail data
  const [detailData, setDetailData] = useState<HistoryItem | null>(null);
  
  // share popup
  const [showSharePopup, setShowSharePopup] = useState(false);

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

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  // Load detail data
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      
      try {
        // First try SAMPLE_DATA for backward compatibility
        if (SAMPLE_DATA[id]) {
          if (mounted) setDetailData(SAMPLE_DATA[id]);
          return;
        }

        // Try to load from database using note_id
        const { data, error } = await supabase
          .from("notes")
          .select(`
            note_id,
            transcript_text,
            summary_content,
            created_at,
            meetings:meeting_id ( title, started_at, finished_at, user_id )
          `)
          .eq("note_id", id)
          .single();

        if (error) {
          console.error("Error loading detail:", error);
          if (mounted) router.replace("/history");
          return;
        }

        if (mounted && data) {
          const date = new Date(data.created_at || Date.now());
          const formattedDate = date.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          let duration = "Tidak diketahui";
          if (data.meetings?.started_at && data.meetings?.finished_at) {
            const start = new Date(data.meetings.started_at);
            const end = new Date(data.meetings.finished_at);
            const diffMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
            duration = diffMin === 1 ? "1 menit" : `${diffMin} menit`;
          }

          setDetailData({
            id: data.note_id,
            title: data.meetings?.title || "Notulensi Rapat",
            date: formattedDate,
            duration,
            transcript: data.transcript_text || "",
            summary: data.summary_content || "",
          });
        }
      } catch (err: any) {
        console.error("Error fetching note detail:", err);
        if (mounted) router.replace("/history");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, router, supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProfileDropdown) {
        const target = event.target as Element;
        if (!target.closest(`.${s.avatar}`)) {
          setShowProfileDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Text copied to clipboard!");
  };

  const handleDelete = () => {
    if (confirm("Apakah Anda yakin ingin menghapus notulensi rapat ini?")) {
      // In real app, this would delete from database
      router.push("/history");
    }
  };

  const handleExport = () => {
    if (detailData) {
      const content = `Notulensi Rapat\n\nTanggal: ${detailData.date}\nDurasi: ${detailData.duration}\n\nTranskripsi:\n${detailData.transcript}\n\nNotulensi:\n${detailData.summary}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notulensi-rapat-${detailData.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const username = meta.username || email.split("@")[0] || "User";
  const avatar = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Loading...</div>
        </main>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Transcription not found</div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.app}>
      {/* SIDEBAR */}
      <aside className={s.sidebar}>
        <div className={s.sbInner}>
          <div className={s.brand}>
            <div className={s.brandName}>NotaKu</div>
          </div>

          <nav className={s.nav} aria-label="Sidebar">
            <a href="/dashboard" className={s.navItem}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
              <span>Dashboard</span>
            </a>
            <a href="/history" className={s.navItem}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span>History</span>
            </a>
            <a href="/settings" className={s.navItem}>
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
          </div>

          <div className={s.rightGroup}>
            <div className={s.avatar} onClick={toggleProfileDropdown}>
              <Image src={avatar} alt="Foto profil" width={36} height={36} unoptimized className={s.avatarImg} />
              <div className={s.meta}>
                <div className={s.name}>{username}</div>
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
        <div className={d.detailContainer}>
          {/* Header */}
          <div className={d.detailHeader}>
            <div className={d.headerInfo}>
              <h1 className={d.detailTitle}>Detail Notulensi Rapat</h1>
              <div className={d.detailMeta}>
                <div className={d.metaItem}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {detailData.date}
                </div>
                <div className={d.metaItem}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12,6 12,12 16,14"></polyline>
                  </svg>
                  {detailData.duration}
                </div>
              </div>
            </div>
            
            <div className={d.headerActions}>
              <button className={d.actionButton} onClick={handleExport}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7,10 12,15 17,10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export
              </button>
              <button className={d.actionButton} onClick={() => setShowSharePopup(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                Share
              </button>
            </div>
          </div>

          {/* Content */}
          <div className={d.detailContent}>
            {/* Transcript Section */}
            <section className={d.contentSection}>
              <div className={d.sectionHeader}>
                <h2 className={d.sectionTitle}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Transkripsi Lengkap
                </h2>
                <button className={d.copyButton} onClick={() => handleCopy(detailData.transcript)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                  Copy
                </button>
              </div>
              <div className={d.transcriptContent}>
                {detailData.transcript}
              </div>
            </section>

            {/* Summary Section */}
            <section className={d.contentSection}>
              <div className={d.sectionHeader}>
                <h2 className={d.sectionTitle}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10,9 9,9 8,9"></polyline>
                  </svg>
                  Notulensi Rapat
                </h2>
                <button className={d.copyButton} onClick={() => handleCopy(detailData.summary)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                  Copy
                </button>
              </div>
              <div className={d.summaryContent}>
                {detailData.summary}
              </div>
            </section>
          </div>

          {/* Footer Actions */}
          <div className={d.footerActions}>
            <button className={d.dangerButton} onClick={handleDelete}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Delete
            </button>
          </div>
        </div>
      </main>

      {/* Share Popup */}
      <SharePopup
        isOpen={showSharePopup}
        onClose={() => setShowSharePopup(false)}
        documentId={id}
        documentTitle={`Notulensi Rapat ${detailData?.date || ''}`}
      />
    </div>
  );
}
