// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();

  // 1. Jika AuthContext masih memproses data, tahan render halaman
  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-xs sm:text-sm font-medium">Memverifikasi Otoritas Akun...</div>;
  }

  // 2. Jika user sama sekali belum terautentikasi (belum login sukses), tendang ke /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Jika rute ini meminta spesifikasi hak akses (allowedRoles)
  if (allowedRoles && allowedRoles.length > 0) {
    // Normalisasi role dari profil (Ubah ke huruf kecil semua agar aman)
    const userRoleClean = profile?.role ? String(profile.role).trim().toLowerCase() : '';
    
    // Normalisasi daftar allowedRoles dari properti Route menjadi huruf kecil semua
    const cleanAllowedRoles = allowedRoles.map(r => String(r).trim().toLowerCase());

    // Cek apakah role user saat ini ada di dalam daftar role yang diizinkan masuk rute ini
    const statusIzinAkses = cleanAllowedRoles.includes(userRoleClean);

    if (!statusIzinAkses) {
      console.warn(`[Akses Ditolak] Role '${userRoleClean}' mencoba mengakses rute khusus '${cleanAllowedRoles.join('/')}'`);
      // Jika rolenya ilegal untuk halaman tersebut, kembalikan ke gerbang utama '/' untuk di-redirect ulang
      return <Navigate to="/" replace />;
    }
  }

  // Jika lolos semua screening keamanan, izinkan komponen anak di-render
  return children;
}