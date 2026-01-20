"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import s from "@/app/styles/dashboard.module.css";
import d from "@/app/styles/detail.module.css";

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
    transcript: 'Halo, ini adalah contoh transkrip dari sesi voice to text. Sistem ini bekerja dengan baik untuk mengkonversi suara menjadi teks secara real-time. Kemudian AI akan meringkas konten ini menjadi format yang lebih mudah dibaca. Proses ini melibatkan beberapa tahap yaitu capture audio, speech recognition, dan natural language processing untuk menghasilkan ringkasan yang akurat.',
    summary: "Sesi voice to text berhasil mengkonversi suara menjadi teks dengan baik. Sistem bekerja real-time dan AI merangkum konten menjadi format yang mudah dibaca.",
  },
  "2": {
    id: "2", 
    date: "15 Januari 2025, 10:15",
    duration: "1 menit 45 detik",
    transcript: "Testing sistem voice recognition untuk memastikan semua fitur berfungsi dengan baik. Ini adalah uji coba kedua untuk memverifikasi kualitas transkripsi dan ringkasan AI. Hasilnya menunjukkan bahwa sistem dapat menangkap audio dengan jelas dan mengkonversinya menjadi teks yang akurat.",
    summary: "Uji coba sistem voice recognition berhasil. Fitur transkripsi dan ringkasan AI berfungsi dengan baik.",
  },
};

export default function SharedPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [detailData, setDetailData] = useState<HistoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      if (SAMPLE_DATA[id]) {
        setDetailData(SAMPLE_DATA[id]);
      } else {
        setError('Document not found');
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Text copied to clipboard!");
  };

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card} style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div 
                style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid #e5e7eb',
                  borderTop: '3px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto'
                }}
              />
            </div>
            <div>Loading shared document...</div>
          </div>
        </main>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !detailData) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card} style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ marginBottom: '16px', color: '#ef4444' }}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <h2 style={{ marginBottom: '8px', color: '#1f2937' }}>Document Not Found</h2>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>{error || 'The requested document could not be found'}</p>
            <div style={{ fontSize: '14px', color: '#9ca3af' }}>
              This could be because:
              <ul style={{ textAlign: 'left', marginTop: '8px', paddingLeft: '20px' }}>
                <li>The document has been deleted</li>
                <li>The link is incorrect</li>
                <li>The document is no longer available</li>
              </ul>
            </div>
          </div>
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
            <div className={s.navItem} style={{ cursor: 'default', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
              <span>Dashboard</span>
            </div>
            <div className={s.navItem} style={{ cursor: 'default', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span>History</span>
            </div>
            <div className={s.navItem} style={{ cursor: 'default', opacity: 0.6 }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Settings</span>
            </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b7280', fontSize: '14px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Shared Document
            </div>
          </div>

          <div className={s.rightGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
              <div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Public Access
              </div>
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
              <h1 className={d.detailTitle}>Shared Transcription</h1>
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
                  Full Transcript
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
                  AI Summary
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
        </div>
      </main>
    </div>
  );
}
