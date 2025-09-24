"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [err, setErr]           = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);

    if (password !== confirm) {
      setErr("Password confirmation does not match.");
      return;
    }

    setLoading(true);
    // Daftar pakai Supabase; username disimpan di user_metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${location.origin}/login`, // jika email confirmation ON
      },
    });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    // Jika email confirmation diaktifkan, session akan null
    if (!data.session) {
      setInfo("Registration successful. Please check your email for verification and then sign in.");
    } else {
      // Kalau confirmation OFF → langsung login
      router.push("/dashboard");
    }
  };


  return (
    <div className="auth-container register-form">
      <div className="form-side">
        <div className="form-box">
          <h1>Create Account</h1>
          <p style={{ 
            textAlign: 'center', 
            color: '#6b7280', 
            marginBottom: '24px', 
            fontSize: '14px' 
          }}>
            Join us today and start your journey
          </p>

          {err && <div className="alert error">{err}</div>}
          {info && <div className="alert success">{info}</div>}

          <form onSubmit={onSubmit}>
            <label>Username</label>
            <input
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />

            <label>Email</label>
            <input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <label>Password</label>
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />

            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Confirm your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>


          <p className="muted center">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>

      <div className="image-side">
        {/* Pakai path absolut agar aman di Next.js public/ */}
        <img src="/login.jpg" alt="Register Illustration" />
      </div>
    </div>
  );
}
