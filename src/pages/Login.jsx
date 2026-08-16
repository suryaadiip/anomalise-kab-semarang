// src/pages/Login.jsx
import { useState } from 'react';
import { supabaseAuth, supabaseData } from '../lib/supabase'; // Pastikan kedua client di-import
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Panggil konteks jika diperlukan trigger manual

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

const handleGoogleLogin = async () => {
  setErrorMsg('');
  setLoading(true);

  try {
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error('Google Login Error:', err);
    setErrorMsg(err.message || 'Gagal login dengan Google.');
    setLoading(false);
  }
};
const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(false); // Biarkan state tracking berjalan

    console.log("=== AWAL PROSES LOGIN ===");
    console.log("Input Email:", email);

    try {
      // 1. Autentikasi Utama lewat Supabase Auth Proyek Lama
      console.log("Mengirim request ke supabaseAuth.auth.signInWithPassword...");
      const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        console.error("❌ Error Supabase Auth:", authError.message);
        throw authError;
      }
      
      console.log("✅ Supabase Auth Sukses! Data User Auth:", authData?.user);

      const cleanEmail = email.trim().toLowerCase();
      console.log("Email setelah dibersihkan (lowercase & trim):", cleanEmail);

      // 2. Cek ke tabel app_users
      console.log("Mencari di tabel public.app_users...");
      const { data: kantorUser, error: kantorErr } = await supabaseData
        .from('app_users')
        .select('email, role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (kantorErr) {
        console.error("❌ Error saat query tabel app_users:", kantorErr.message);
      }
      console.log("Hasil query app_users:", kantorUser);

      // 3. Cek ke tabel petugas
      console.log("Mencari di tabel public.petugas...");
      const { data: lapanganUser, error: lapanganErr } = await supabaseData
        .from('petugas')
        .select('email, posisi_tugas')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (lapanganErr) {
        console.error("❌ Error saat query tabel petugas:", lapanganErr.message);
      }
      console.log("Hasil query petugas:", lapanganUser);

      // 4. Evaluasi Hasil Akhir
      if (!kantorUser && !lapanganUser) {
        console.warn("⚠️ Akun ditemukan di Auth, tetapi TIDAK terdaftar di kedua tabel lokal (app_users / petugas). Melakukan signOut...");
        await supabaseAuth.auth.signOut();
        throw new Error('Akun Anda aktif, tetapi tidak terdaftar sebagai Pegawai Kantor maupun Mitra Lapangan di aplikasi ini.');
      }

      console.log("🚀 Lolos screening! Mengalihkan ke halaman utama (/)");
      navigate('/');
      
    } catch (err) {
      console.error("=== PROSES LOGIN GAGAL ===", err);
      setErrorMsg(err.message || 'Email atau password salah.');
    } finally {
      setLoading(false);
      console.log("=== AKHIR PROSES LOGIN ===");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-orange-50/40 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-6 sm:p-8 shadow-md border border-slate-200">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">SIMALI</h2>
          <p className="text-xs text-slate-500 font-medium">Sistem Monitoring Anomali Sensus Ekonomi 2026</p>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600 border border-rose-200 font-medium leading-relaxed">
            ⚠️ {errorMsg}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Email Resmi Petugas</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-3xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-slate-50 font-medium"
              placeholder="nama@bps.go.id atau mitra@gmail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Kata Sandi</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-3xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-slate-50 font-medium"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 rounded-xl shadow-2xs text-xs sm:text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all mt-6"
          >
            {loading ? 'Memverifikasi Hak Akses...' : 'Masuk Dashboard'}
          </button>
          <div className="relative my-5">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-slate-200"></div>
  </div>
  <div className="relative flex justify-center">
    <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      atau
    </span>
  </div>
</div>

<button
  type="button"
  onClick={handleGoogleLogin}
  disabled={loading}
  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-bold text-slate-700 shadow-sm transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
>
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="#4285F4"
      d="M21.35 12.23c0-.79-.07-1.55-.23-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42z"
    />
    <path
      fill="#34A853"
      d="M12 21.6c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.93-3.31.93-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.6z"
    />
    <path
      fill="#FBBC05"
      d="M6.54 13.7a5.86 5.86 0 0 1 0-3.4V7.77H3.3a9.75 9.75 0 0 0 0 8.46l3.24-2.53z"
    />
    <path
      fill="#EA4335"
      d="M12 6.27c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.24 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.7 5.37l3.24 2.53C7.31 7.99 9.46 6.27 12 6.27z"
    />
  </svg>

  {loading ? 'Menghubungkan ke Google...' : 'Masuk dengan Google'}
</button>
        </form>
      </div>
    </div>
  );
}