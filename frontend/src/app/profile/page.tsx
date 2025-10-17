"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import s from "@/app/styles/dashboard.module.css";
import h from "@/app/styles/settings.module.css";

type UserMeta = {
  username?: string;
  avatar_url?: string;
  full_name?: string;
  role?: string;
  [k: string]: any;
};

export default function ProfilePage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  
  // auth/session
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [meta, setMeta] = useState<UserMeta>({});
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  
  // form state
  const [formData, setFormData] = useState({
    username: "",
    full_name: "",
    avatar_url: "",
  });
  
  // UI state
  const [isEditing, setIsEditing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // load user data from auth.user_metadata (reverted to original behavior)
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
      const userMeta = (session.user.user_metadata as UserMeta) || {};
      setMeta(userMeta);

      // Initialize form data
      setFormData({
        username: userMeta.username || "",
        full_name: userMeta.full_name || "",
        avatar_url: userMeta.avatar_url || "",
      });
      
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

  // derived values
  const username = meta.username || email.split("@")[0] || "User";
  const avatar = meta.avatar_url || "https://i.pravatar.cc/64?img=12";

  const toggleProfileDropdown = () => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  const closeProfileDropdown = () => {
    setShowProfileDropdown(false);
  };

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast("Please select a valid image file", "error");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB", "error");
      return;
    }

    setUploading(true);

    try {
      // Keep old avatar url to delete after successful update
      const previousUrl = (formData.avatar_url || meta.avatar_url || "").toString();

      // Upload to Supabase Storage → avatars bucket
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes.session?.user?.id;
      if (!userId) {
        showToast("Session not found. Please login again.", "error");
        return;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const filePath = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type,
        });
      if (uploadError) {
        showToast(uploadError.message, "error");
        return;
      }

      const { data: publicData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const publicUrl = publicData.publicUrl;

      // Persist URL to user metadata
      const { error: updateErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });
      if (updateErr) {
        showToast(updateErr.message, "error");
        return;
      }

      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      setMeta(prev => ({ ...prev, avatar_url: publicUrl }));
      showToast("Avatar updated successfully!", "success");

      // Attempt to delete the previous avatar if it was stored in our avatars bucket
      try {
        if (previousUrl && previousUrl.includes('/storage/v1/object/public/avatars/')) {
          const parts = previousUrl.split('/storage/v1/object/public/avatars/');
          const oldPath = parts[1];
          if (oldPath && oldPath.length > 0 && oldPath !== filePath) {
            await supabase.storage.from('avatars').remove([oldPath]);
          }
        }
      } catch (_) {
        // ignore cleanup errors
      }
    } catch (error) {
      showToast("Failed to upload avatar", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          username: formData.username,
          full_name: formData.full_name,
          avatar_url: formData.avatar_url,
        }
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      setMeta(prev => ({ ...prev, ...formData }));
      showToast("Profile updated successfully!", "success");
    } catch (error) {
      showToast("Failed to update profile", "error");
    }
  };

  const handlePasswordUpdate = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) {
        showToast(error.message, "error");
        return;
      }

      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setShowPasswordForm(false);
      showToast("Password updated successfully!", "success");
    } catch (error) {
      showToast("Failed to update password", "error");
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className={s.app}>
        <main className={s.content}>
          <div className={s.card}>Loading profile...</div>
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
            <Image src="/logo_neurabot.jpg" alt="Logo Neurabot" width={36} height={36} className={s.brandImg} />
            <div className={s.brandName}>Neurabot</div>
          </div>

          <nav className={s.nav} aria-label="Sidebar">
            <a className={s.navItem} href="/dashboard">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
              <span>Dashboard</span>
            </a>
            <a className={s.navItem} href="/history">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span>History</span>
            </a>
            <a className={s.navItem} href="/settings">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Settings</span>
            </a>
          </nav>

          <div className={s.sbFooter}>
            <div style={{ opacity: 0.6 }}>© 2025 Neurabot</div>
          </div>
        </div>
      </aside>

      {/* TOPBAR */}
      <header className={s.topbar}>
        <div className={s.tbWrap}>
          <div className={s.leftGroup}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>Profile</h1>
          </div>

          <div className={s.rightGroup}>
            <div className={s.avatar} onClick={toggleProfileDropdown}>
              <Image src={avatar} alt="Foto profil" width={36} height={36} unoptimized className={s.avatarImg} />
              <div className={s.meta}>
                <div className={s.name}>{username}</div>
              </div>
              
              {showProfileDropdown && (
                <div className={s.profileDropdown}>
                  <button className={s.dropdownItem} onClick={closeProfileDropdown}>
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
          {/* Profile Information */}
          <section className={h.section}>
            <h3>Profile Information</h3>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Avatar</div>
                <div className={h.desc}>Upload a profile picture</div>
              </div>
              <div className={h.control}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Image 
                    src={formData.avatar_url || avatar} 
                    alt="Profile" 
                    width={64} 
                    height={64} 
                    style={{ borderRadius: '50%', objectFit: 'cover' }}
                    unoptimized 
                    onError={(_e: any) => {
                      // Fallback ke placeholder bila URL rusak/expired
                      setFormData(prev => ({ ...prev, avatar_url: "https://i.pravatar.cc/64?img=12" }));
                    }}
                  />
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      disabled={uploading}
                      style={{ display: 'none' }}
                      id="avatar-upload"
                    />
                    <label htmlFor="avatar-upload" style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      background: '#667eea',
                      color: 'white',
                      borderRadius: '8px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>
                      {uploading ? 'Uploading...' : 'Change Avatar'}
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Username</div>
                <div className={h.desc}>Your unique username</div>
              </div>
              <div className={h.control}>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className={h.input}
                  style={{ minWidth: '200px' }}
                />
              </div>
            </div>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Full Name</div>
                <div className={h.desc}>Your display name</div>
              </div>
              <div className={h.control}>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  className={h.input}
                  style={{ minWidth: '200px' }}
                />
              </div>
            </div>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Email</div>
                <div className={h.desc}>Your email address (cannot be changed)</div>
              </div>
              <div className={h.control}>
                <input
                  type="email"
                  value={email}
                  disabled
                  className={h.input}
                  style={{ minWidth: '200px', opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
            </div>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Role</div>
                <div className={h.desc}>Your assigned role</div>
              </div>
              <div className={h.control}>
                <span className={`${h.status} ${h.statusActive}`}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  {meta.role || 'Not assigned'}
                </span>
              </div>
            </div>
          </section>

          {/* Password Settings */}
          <section className={h.section}>
            <h3>Password Settings</h3>

            <div className={h.item}>
              <div className={h.info}>
                <div className={h.label}>Password</div>
                <div className={h.desc}>Change your password</div>
              </div>
              <div className={h.control}>
                <button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  style={{
                    padding: '8px 16px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  {showPasswordForm ? 'Cancel' : 'Change Password'}
                </button>
              </div>
            </div>

            {showPasswordForm && (
              <>
                <div className={h.item}>
                  <div className={h.info}>
                    <div className={h.label}>Current Password</div>
                    <div className={h.desc}>Enter your current password</div>
                  </div>
                  <div className={h.control}>
                    <input
                      type="password"
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className={h.input}
                      style={{ minWidth: '200px' }}
                    />
                  </div>
                </div>

                <div className={h.item}>
                  <div className={h.info}>
                    <div className={h.label}>New Password</div>
                    <div className={h.desc}>Enter your new password (min 6 characters)</div>
                  </div>
                  <div className={h.control}>
                    <input
                      type="password"
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className={h.input}
                      style={{ minWidth: '200px' }}
                    />
                  </div>
                </div>

                <div className={h.item}>
                  <div className={h.info}>
                    <div className={h.label}>Confirm New Password</div>
                    <div className={h.desc}>Confirm your new password</div>
                  </div>
                  <div className={h.control}>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      className={h.input}
                      style={{ minWidth: '200px' }}
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Actions */}
          <div className={h.actionsBar}>
            {isEditing && (
              <button className={h.btnSave} onClick={handleSaveProfile}>
                Save
              </button>
            )}
            
            {showPasswordForm && (
              <button 
                className={h.btnSave} 
                onClick={handlePasswordUpdate}
              >
                Save
              </button>
            )}
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
