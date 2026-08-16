// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabaseAuth, supabaseData } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isInitialLoad = true;

    // 1. Ambil session aktif saat aplikasi pertama kali dimuat
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchUserProfile(session.user.email);
      } else {
        setLoading(false);
      }
      isInitialLoad = false; // Tandai bahwa inisialisasi awal selesai
    });

    // 2. Dengarkan perubahan status auth (Login / Logout)
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      // JANGAN jalankan ulang fetch jika ini adalah event 'SIGNED_IN' yang dipicu otomatis saat initial load
      if (event === 'SIGNED_IN' && isInitialLoad) {
        return;
      }

      if (session) {
        setUser(session.user);
        fetchUserProfile(session.user.email);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fungsi untuk mengambil detail profil (Hanya mengambil kolom esensial)
  const fetchUserProfile = async (email) => {
    if (!email) {
      setLoading(false);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      // 💡 HEMAT EGRESS: Batasi kolom, jangan select('*')
      // Sesuai kebutuhan komponen Anda, hanya butuh nama_pengguna/email untuk identitas navbar
      const { data: kantorUser, error: kantorErr } = await supabaseData
        .from('app_users')
        .select('email, nama_pengguna, role') 
        .eq('email', cleanEmail)
        .maybeSingle();

      if (kantorErr) console.error("Log error app_users:", kantorErr.message);

      if (kantorUser) {
        setProfile({
          ...kantorUser,
          tipe_akun: 'KANTOR'
        });
        return; 
      }

      // 💡 HEMAT EGRESS: Batasi kolom untuk petugas lapangan
      const { data: lapanganUser, error: lapanganErr } = await supabaseData
        .from('petugas')
        .select('email, nama_petugas, posisi_tugas')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (lapanganErr) console.error("Log error petugas:", lapanganErr.message);

      if (lapanganUser) {
        setProfile({
          email: lapanganUser.email,
          nama_pengguna: lapanganUser.nama_petugas, 
          role: lapanganUser.posisi_tugas,          
          tipe_akun: 'LAPANGAN'
        });
        return;
      }

      setProfile(null);
    } catch (err) {
      console.error("Gagal mendeteksi profil pengguna secara relasional:", err.message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    await supabaseAuth.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);