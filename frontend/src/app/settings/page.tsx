"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import s from "@/app/styles/dashboard.module.css";  // layout (sidebar/topbar)
import h from "@/app/styles/settings.module.css";   // style khusus settings

type UserMeta = {
  username?: string;
  avatar_url?: string;
  [k: string]: any;
};

type Settings = {
  voiceLanguage: string;
  microphoneSensitivity: number;
  autoVoiceDetection: boolean;
  noiseFilter: boolean;
};

const DEFAULTS: Settings = {
  voiceLanguage: "id-ID",
  microphoneSensitivity: 50,
  autoVoiceDetection: true,
  noiseFilter: true,
};

export default function SettingsPage() {
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
  
  // form state
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [query, setQuery] = useState("");

  // status
  const [micStatus, setMicStatus] = useState<"active" | "inactive">("inactive");

  // toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("voiceToTextSettings");
      if (raw) {
        const merged = { ...DEFAULTS, ...JSON.parse(raw) };
        setSettings(merged);
      }
    } catch {
      // ignore
    }
  }, []);

  // system checks
  const checkMic = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStatus("active");
    } catch {
      setMicStatus("inactive");
    }
  };

  useEffect(() => {
    checkMic();
  }, []);

  // auth session management
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

  // handlers
  const save = () => {
    localStorage.setItem("voiceToTextSettings", JSON.stringify(settings));
    showToast("Pengaturan berhasil disimpan!", "success");
  };
  const reset = () => {
    if (confirm("Reset semua pengaturan ke default?")) {
      localStorage.removeItem("voiceToTextSettings");
      setSettings(DEFAULTS);
      showToast("Pengaturan telah direset ke default.", "success");
    }
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

  // derived values
  const username = meta.username || email.split("@")[0] || "User";
  const avatar = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  const onRange = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((prev) => ({ ...prev, [k]: Number(e.target.value) }));

  const onCheck = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((prev) => ({ ...prev, [k]: e.target.checked }));

  const onText = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setSettings((prev) => ({ ...prev, [k]: e.target.value }));

  // search filter sections
  const matchesQuery = (text: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return text.toLowerCase().includes(q);
  };

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Loading settings...</div>
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
                placeholder="Search settings..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search settings"
              />
            </div>
          </div>

          <div className={s.rightGroup}>
            <div className={s.avatar} onClick={toggleProfileDropdown} ref={avatarRef}>
              <Image src={avatar} alt="Foto profil" width={40} height={40} className={s.avatarImg} unoptimized />
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
        <div className={h.settingsContainer}>
          <div className={h.settingsHeader}>
            <h2 className={h.pageTitle}>Settings</h2>
            <div className={h.settingsSubtitle}>Manage app preferences, AI options, and system behaviors</div>
          </div>

          {/* Voice Settings */}
          {matchesQuery("pengaturan suara bahasa sensitivitas otomatis noise") && (
            <section className={h.section}>
              <h3 className={h.sectionTitle}>Voice Settings</h3>

              <div className={h.item}>
                <div className={h.info}>
                  <div className={h.label}>Recognition Language</div>
                  <div className={h.desc}>Choose the language for voice recognition</div>
                </div>
                <div className={h.control}>
                  <div className={h.selectWrap}>
                    <select id="voiceLanguage" value={settings.voiceLanguage} onChange={onText("voiceLanguage")}>
                      <option value="id-ID">Bahasa Indonesia</option>
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="ms-MY">Bahasa Malaysia</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={h.item}>
                <div className={h.info}>
                  <div className={h.label}>Microphone Sensitivity</div>
                  <div className={h.desc}>Adjust how sensitive the system detects voice</div>
                </div>
                <div className={h.control}>
                  <div className={h.rangeWrap}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.microphoneSensitivity}
                      onChange={onRange("microphoneSensitivity")}
                      className={h.range}
                    />
                    <span className={h.rangeValue}>{settings.microphoneSensitivity}%</span>
                  </div>
                </div>
              </div>

              <div className={h.item}>
                <div className={h.info}>
                  <div className={h.label}>Auto Voice Detection</div>
                  <div className={h.desc}>Start recording automatically when voice is detected</div>
                </div>
                <div className={h.control}>
                  <label className={h.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.autoVoiceDetection}
                      onChange={onCheck("autoVoiceDetection")}
                    />
                    <span className={h.slider} />
                  </label>
                </div>
              </div>

              <div className={h.item}>
                <div className={h.info}>
                  <div className={h.label}>Noise Filter</div>
                  <div className={h.desc}>Enable filter to reduce background noise</div>
                </div>
                <div className={h.control}>
                  <label className={h.toggle}>
                    <input type="checkbox" checked={settings.noiseFilter} onChange={onCheck("noiseFilter")} />
                    <span className={h.slider} />
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* General Settings (simplified) */}
          <section className={h.section}>
            <h3 className={h.sectionTitle}>Status Sistem</h3>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Mikrofon</div>
                <div className={h.desc}>Status akses mikrofon perangkat</div>
              </div>
              <div className={h.control}>
                <span className={`${h.status} ${micStatus === "active" ? h.statusActive : h.statusInactive}`}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
                  {micStatus === "active" ? "Tersedia" : "Tidak Tersedia"}
                </span>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className={h.actionsBar}>
            <button className={h.btnReset} onClick={reset}>Reset ke Default</button>
            <button className={h.btnSave} onClick={save}>Simpan Pengaturan</button>
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`${h.toast} ${toast.type === "success" ? h.success : h.error}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
