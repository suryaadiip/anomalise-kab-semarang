// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DashboardLapangan from './pages/DashboardLapangan';
import DashboardKantor from './pages/DashboardKantor';
import ProtectedRoute from './components/ProtectedRoute';

function HomeRedirect() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center">Memproses Hak Akses...</div>;
  }

  if (profile) {
    const roleUser = profile.role?.toLowerCase();

    // MASUKKAN 'admin' KE KELOMPOK DASHBOARD KANTOR
    if (roleUser === 'pegawai' || roleUser === 'admin') {
      return <Navigate to="/kantor" replace />;
    }
    
    if (roleUser === 'pcl' || roleUser === 'pml') {
      return <Navigate to="/lapangan" replace />;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-center">
      <div className="max-w-md p-6 bg-white rounded-xl border shadow-sm">
        <h3 className="text-lg font-bold text-red-600 mb-2">Akses Terbendung</h3>
        <p className="text-sm text-slate-600 mb-4">
          Role akun Anda ({profile?.role}) tidak dikenali oleh sistem distribusi modul.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        } />

        <Route path="/lapangan" element={
          <ProtectedRoute allowedRoles={['pcl', 'pml']}>
            <DashboardLapangan />
          </ProtectedRoute>
        } />

        {/* IJINKAN ROLE 'admin' MENGAKSES DASHBOARD KANTOR */}
        <Route path="/kantor" element={
          <ProtectedRoute allowedRoles={['pegawai', 'admin']}>
            <DashboardKantor />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}