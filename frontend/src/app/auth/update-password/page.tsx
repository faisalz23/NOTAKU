"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if user is authenticated and has a valid session
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        setErr("Session error: " + error.message);
        return;
      }

      if (!session) {
        setErr("Invalid or expired reset link. Please request a new password reset.");
        return;
      }
    };

    checkSession();
  }, [supabase.auth]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    // Validate passwords
    if (password.length < 6) {
      setErr("Password must be at least 6 characters long.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      // Update password
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      // Success - redirect to login with success message
      setSuccess(true);
      setTimeout(() => {
        router.push("/login?message=Password updated successfully");
      }, 2000);

    } catch (error) {
      setErr("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    router.push("/login");
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="form-side">
          <div className="form-box">
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ 
                fontSize: '48px', 
                marginBottom: '20px',
                color: '#10b981'
              }}>
                ✓
              </div>
              <h1>Password Updated!</h1>
              <p style={{ 
                color: '#6b7280', 
                marginBottom: '24px',
                fontSize: '16px'
              }}>
                Your password has been successfully updated.
              </p>
              <p style={{ 
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                Redirecting to login page...
              </p>
            </div>
          </div>
        </div>
        <div className="image-side">
          <img src="/login.jpg" alt="Success Illustration" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="form-side">
        <div className="form-box">
          <h1>Reset Your Password</h1>
          <p style={{ textAlign:'center', color:'#6b7280', marginBottom:24, fontSize:14 }}>
            Enter your new password below
          </p>

          {err && <div className="alert">{err}</div>}

          <form onSubmit={onSubmit}>
            <label>New Password</label>
            <input
              type="password"
              placeholder="Enter your new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />

            <label>Confirm New Password</label>
            <input
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          <p className="muted center">
            Remember your password? <a href="/login">Back to login</a>
          </p>
        </div>
      </div>

      <div className="image-side">
        <img src="/login.jpg" alt="Password Reset Illustration" />
      </div>
    </div>
  );
}
