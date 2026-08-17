// src/pages/DashboardLapangan.jsx
import React, { useState, useEffect } from 'react';
import { supabaseData } from '../lib/supabase'; 
import { useAuth } from '../context/AuthContext'; 

export default function DashboardLapangan() {
  const { profile: profilUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showPanduanModal, setShowPanduanModal] = useState(true);

  // DATA REFERENSI ATURAN
  const [masterAnomali, setMasterAnomali] = useState([]);

  // Data Raw Global Cache (Untuk rekap snapshot yang fleksibel & cepat)
  const [rawMonitoringData, setRawMonitoringData] = useState([]);
  const [availableSnapshots, setAvailableSnapshots] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState('terakhir');

  // Data Hirarki Lapangan
  const [daftarPclAgregat, setDaftarPclAgregat] = useState([]); 
  const [selectedPcl, setSelectedPcl] = useState(null);       
  const [daftarSls, setDaftarSls] = useState([]);              
  const [selectedSls, setSelectedSls] = useState(null);        
  const [daftarAnomaliRuta, setDaftarAnomaliRuta] = useState([]);

  // STATE FILTER TIPE MASALAH DI DETAIL
  const [filterTipeMasalah, setFilterTipeMasalah] = useState('SEMUA'); // 'SEMUA', 'ANOMALI', 'MISSING_VALUE'

  // Form Input Modal Justifikasi
  const [editingAnomali, setEditingAnomali] = useState(null); 
  const [statusKonfirmasiForm, setStatusKonfirmasiForm] = useState('Sesuai Kondisi Lapangan');
  const [catatanLapanganForm, setCatatanLapanganForm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatTanggalIndo = (stringTanggal) => {
    if (!stringTanggal || stringTanggal === '0000-00-00') return "-";
    const opsi = { day: '2-digit', month: 'short', year: 'numeric' };
    return new Date(stringTanggal).toLocaleDateString('id-ID', opsi);
  };

  const getInfoAnomali = (kode, tipe = 'deskripsi') => {
    const target = masterAnomali.find(a => a.kode === kode);
    if (!target) return kode;
    return tipe === 'deskripsi' ? target.deskripsi : target.aturan_teknis;
  };

  const fetchMasterAnomali = async () => {
  try {
    const { data, error } = await supabaseData
      .from('master_anomali')
      .select('kode, deskripsi, aturan_teknis, kata_kunci, kategori');

    if (error) throw error;

    console.log('=== MASTER ANOMALI ===');
    console.table(data);

    console.log('JUMLAH MASTER:', data?.length);
    console.log('MASTER ANOMALI RAW:', data);
    console.log('JUMLAH MASTER:', data?.length);
    console.log('MASTER ANOMALI RAW:', data);

    const masterA01 = data?.find(
      item => String(item.kode).trim().toUpperCase() === 'A01'
    );

    console.log('=== CEK A01 ===');
    console.log(masterA01);

    setMasterAnomali(data || []);
  } catch (err) {
    console.error(
      'Gagal memuat aturan master anomali:',
      err.message
    );
  }
};

  // --- 1. AMBIL SEMUA DATA MONITORING DEPAN (FETCH SINGLE SOURCE) ---
  const initWorkspaceData = async () => {
    setLoading(true);
    try {
      await fetchMasterAnomali();

      let query = supabaseData.from('view_monitoring_anomali').select('*');
      if (profilUser?.role === 'PML') {
        query = query.eq('pml_email', profilUser.email);
      } else if (profilUser?.role === 'PCL') {
        query = query.eq('pcl_email', profilUser.email);
      }

      const { data, error } = await query;
      if (error) throw error;

      const dbRows = data || [];
      setRawMonitoringData(dbRows);

      // Ekstrak daftar tanggal snapshot yang unik
      const daftarTanggal = [...new Set(dbRows.map(item => item.tanggal_snapshot))]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));

      setAvailableSnapshots(daftarTanggal);

      if (profilUser?.role === 'PCL') {
        setSelectedPcl({ email: profilUser.email, nama_petugas: profilUser.nama_pengguna });
      }

    } catch (err) {
      console.error('Gagal memuat workspace lapangan:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profilUser?.email) {
      initWorkspaceData();
    }
  }, [profilUser?.email]);

  // HELPER SINKRONISASI FILTER SNAPSHOT SECARA LOKAL
  const getFilteredRawBySnapshot = (allRows, snapshotTarget, listTgl = availableSnapshots) => {
    if (snapshotTarget === 'terakhir' && listTgl.length > 0) {
      return allRows.filter(r => r.tanggal_snapshot === listTgl[0]);
    } else if (snapshotTarget !== 'semua' && snapshotTarget !== 'terakhir') {
      return allRows.filter(r => r.tanggal_snapshot === snapshotTarget);
    }
    return allRows;
  };

  // --- REKAP AGREGAT PCL (LEVEL 0 PML) BERDASARKAN SNAPSHOT ---
  useEffect(() => {
    if (profilUser?.role !== 'PML' || rawMonitoringData.length === 0) return;

    const dataTerfilter = getFilteredRawBySnapshot(rawMonitoringData, selectedSnapshot);

    const hitungPcl = async () => {
      const { data: pclData } = await supabaseData
        .from('petugas')
        .select('email, nama_petugas, posisi_tugas')
        .eq('id_pml_atasan', profilUser.email);

      if (!pclData) return;

      const { data: slsData } = await supabaseData
        .from('muatan_sls')
        .select('idsubsls, petugas_id')
        .in('petugas_id', pclData.map(p => p.email));

      const mappedPcl = pclData.map(pcl => {
        const slsOwns = slsData ? slsData.filter(s => s.petugas_id === pcl.email).map(s => s.idsubsls) : [];
        const anomaliOwns = dataTerfilter.filter(a => slsOwns.includes(a.idsubsls));
        
        const kunciUnikSet = new Set(anomaliOwns.map(a => `${a.assignment_id}_${a.kode_anomali}`));
        const totalMasalahUnik = kunciUnikSet.size;

        let belumSelesaiUnik = 0;
        kunciUnikSet.forEach(kunci => {
          const barisTerkait = anomaliOwns.filter(a => `${a.assignment_id}_${a.kode_anomali}` === kunci);
          if (barisTerkait.some(b => b.status_konfirmasi === 'Belum Tindak Lanjut')) {
            belumSelesaiUnik++;
          }
        });

        return {
          ...pcl,
          totalBeban: totalMasalahUnik,
          belumSelesai: belumSelesaiUnik,
          sudahSelesai: Math.max(0, totalMasalahUnik - belumSelesaiUnik),
          jumlahSls: slsOwns.length
        };
      });

      mappedPcl.sort((a, b) => b.belumSelesai - a.belumSelesai);
      setDaftarPclAgregat(mappedPcl);
    };

    hitungPcl();
  }, [selectedSnapshot, rawMonitoringData, profilUser?.role]);

  // --- REKAP DAFTAR SLS (LEVEL 1 PCL/PML) BERDASARKAN SNAPSHOT ---
  useEffect(() => {
    if (!selectedPcl || rawMonitoringData.length === 0) return;

    const dataTerfilter = getFilteredRawBySnapshot(rawMonitoringData, selectedSnapshot);

    const hitungSls = async () => {
      const { data: slsData } = await supabaseData
        .from('muatan_sls')
        .select('idsubsls, nmsls, nmdesa, nmkec')
        .eq('petugas_id', selectedPcl.email);

      if (!slsData) return;

      const slsMapped = slsData.map(sls => {
        const itemAnomali = dataTerfilter.filter(a => a.idsubsls === sls.idsubsls);
        const kunciUnikSet = new Set(itemAnomali.map(a => `${a.assignment_id}_${a.kode_anomali}`));
        
        let belumSelesaiUnik = 0;
        kunciUnikSet.forEach(kunci => {
          const barisTerkait = itemAnomali.filter(a => `${a.assignment_id}_${a.kode_anomali}` === kunci);
          if (barisTerkait.some(b => b.status_konfirmasi === 'Belum Tindak Lanjut')) {
            belumSelesaiUnik++;
          }
        });

        return {
          ...sls,
          totalAnomali: kunciUnikSet.size,
          belumSelesai: belumSelesaiUnik
        };
      });

      slsMapped.sort((a, b) => b.belumSelesai - a.belumSelesai);
      setDaftarSls(slsMapped);
    };

    hitungSls();
  }, [selectedPcl, selectedSnapshot, rawMonitoringData]);

  // --- LOAD DETAIL ANOMALI SLS DENGAN PILIHAN SNAPSHOT (LEVEL 2) ---
  const loadDetailAnomaliSls = (slsObj) => {
    setSelectedSls(slsObj);
    
    // Ambil data lokal untuk SLS terpilih
    const dataSub = rawMonitoringData.filter(item => item.idsubsls === slsObj.idsubsls);

    const grupRuta = {};
    dataSub.forEach(item => {
      if (!grupRuta[item.assignment_id]) {
        grupRuta[item.assignment_id] = {
          assignment_id: item.assignment_id,
          nama_keluarga_krt: '', 
          nama_unit_usaha: '',   
          fallback_nama: item.nama_subjek, 
          daftar_error_grup: {} 
        };
      }

      if (String(item.kode_anomali).startsWith('K')) {
        grupRuta[item.assignment_id].nama_keluarga_krt = item.nama_subjek;
      } else if (String(item.kode_anomali).startsWith('U')) {
        grupRuta[item.assignment_id].nama_unit_usaha = item.nama_subjek;
      }

      const compositeErrorKey = item.kode_anomali;

      if (!grupRuta[item.assignment_id].daftar_error_grup[compositeErrorKey]) {
        grupRuta[item.assignment_id].daftar_error_grup[compositeErrorKey] = {
          kode_anomali: item.kode_anomali,
          kategori: item.kategori_anomali,
          tipe_masalah: item.tipe_masalah || 'ANOMALI',
          status_konfirmasi: item.status_konfirmasi || 'Belum Tindak Lanjut',
          catatan_lapangan: item.catatan_lapangan || '',
          snapshots: [] 
        };
      }

      grupRuta[item.assignment_id].daftar_error_grup[compositeErrorKey].snapshots.push({
        anomali_id: item.anomali_id,
        tanggal_snapshot: item.tanggal_snapshot,
        status_konfirmasi: item.status_konfirmasi || 'Belum Tindak Lanjut'
      });

      if (item.status_konfirmasi === 'Belum Tindak Lanjut') {
        grupRuta[item.assignment_id].daftar_error_grup[compositeErrorKey].status_konfirmasi = 'Belum Tindak Lanjut';
      }
    });

    const finalRutaFlattened = Object.values(grupRuta).map(ruta => ({
      ...ruta,
      daftar_error: Object.values(ruta.daftar_error_grup).map(errGrup => ({
        ...errGrup,
        snapshots: errGrup.snapshots.sort((a, b) => String(a.tanggal_snapshot).localeCompare(String(b.tanggal_snapshot)))
      }))
    }));

    setDaftarAnomaliRuta(finalRutaFlattened);
  };

  const handleOpenActionModal = (subAnomali, namaSubjek, assignmentId) => {
    setEditingAnomali({ ...subAnomali, nama_subjek: namaSubjek, assignment_id: assignmentId });
    setStatusKonfirmasiForm(subAnomali.status_konfirmasi === 'Belum Tindak Lanjut' ? 'Sesuai Kondisi Lapangan' : subAnomali.status_konfirmasi);
    setCatatanLapanganForm(subAnomali.catatan_lapangan || '');
  };

  // --- SAVE TINDAK LANJUT DENGAN EFEK DOMINO OTOMATIS LINIMASA ---
  const handleSaveTindakLanjut = async () => {
    if (!catatanLapanganForm.trim()) {
      return alert('Catatan lapangan/konfirmasi wajib diisi!');
    }

    if (!editingAnomali?.snapshots?.length) {
      return alert('Data anomali tidak memiliki ID tindak lanjut yang valid. Silakan muat ulang halaman.');
    }

    setSubmitting(true);

    try {
      const waktuKonfirmasi = new Date().toISOString();

      console.log('=== SIMPAN KONFIRMASI PCL ===');
      console.log('Assignment:', editingAnomali.assignment_id);
      console.log('Kode:', editingAnomali.kode_anomali);
      console.log('Snapshot target:', editingAnomali.snapshots);

      // tindak_lanjut_anomali sudah dibuat saat anomali_data masuk.
      // Karena itu gunakan UPDATE, bukan UPSERT.
      // Ini menghindari jalur INSERT/RLS dan memastikan kita benar-benar
      // mengubah baris yang sudah ada.
      const hasilUpdate = await Promise.all(
        editingAnomali.snapshots.map(async (snap) => {
          if (!snap.anomali_id) {
            throw new Error('anomali_id tidak ditemukan pada data snapshot.');
          }

          const { data, error } = await supabaseData
            .from('tindak_lanjut_anomali')
            .update({
              status_konfirmasi: statusKonfirmasiForm,
              catatan_lapangan: catatanLapanganForm.trim(),
              dkonfirmasi_oleh_email: profilUser?.email,
              tanggal_konfirmasi: waktuKonfirmasi
            })
            .eq('anomali_id', snap.anomali_id)
            .select(
              'anomali_id, status_konfirmasi, catatan_lapangan, dkonfirmasi_oleh_email, tanggal_konfirmasi'
            )
            .single();

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              `Baris tindak lanjut untuk anomali_id ${snap.anomali_id} tidak berhasil diperbarui.`
            );
          }

          return data;
        })
      );

      console.log('✅ HASIL UPDATE KONFIRMASI:', hasilUpdate);

      // Update cache lokal setelah database benar-benar berhasil.
      setRawMonitoringData(prev =>
        prev.map(item => {
          const match = editingAnomali.snapshots.some(
            s => s.anomali_id === item.anomali_id
          );

          if (match) {
            return {
              ...item,
              status_konfirmasi: statusKonfirmasiForm,
              catatan_lapangan: catatanLapanganForm.trim(),
              dkonfirmasi_oleh_email: profilUser?.email,
              tanggal_konfirmasi: waktuKonfirmasi
            };
          }

          return item;
        })
      );

      setDaftarAnomaliRuta(prevRuta =>
        prevRuta.map(ruta => {
          if (ruta.assignment_id !== editingAnomali.assignment_id) {
            return ruta;
          }

          return {
            ...ruta,
            daftar_error: ruta.daftar_error.map(err => {
              if (err.kode_anomali !== editingAnomali.kode_anomali) {
                return err;
              }

              return {
                ...err,
                status_konfirmasi: statusKonfirmasiForm,
                catatan_lapangan: catatanLapanganForm.trim(),
                snapshots: err.snapshots.map(s => ({
                  ...s,
                  status_konfirmasi: statusKonfirmasiForm
                }))
              };
            })
          };
        })
      );

      alert('Konfirmasi lapangan berhasil disimpan.');
      setEditingAnomali(null);

    } catch (err) {
      console.error('❌ GAGAL SIMPAN KONFIRMASI PCL:', err);

      alert(
        'Gagal menyimpan konfirmasi lapangan: ' +
        (err?.message || err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTombolKembali = () => {
    if (selectedSls) { 
      setSelectedSls(null); 
      setDaftarAnomaliRuta([]); 
      setFilterTipeMasalah('SEMUA');
    }
    else if (selectedPcl && profilUser?.role === 'PML') { 
      setSelectedPcl(null); 
      setDaftarSls([]); 
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-orange-50/30 font-sans">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-sm font-bold text-amber-900/70 tracking-wide uppercase animate-pulse">Menyusun Workspace Lapangan...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-slate-700 font-sans antialiased selection:bg-amber-200">
      
      {/* GLOBAL NAVBAR */}
      <div className="bg-gradient-to-r from-amber-700 to-orange-800 text-white shadow-md sticky top-0 z-10 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="space-y-0.5">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-amber-50">SIMALI</h1>
            <p className="text-[11px] text-amber-200/80 font-medium font-mono truncate max-w-[280px]">
              {selectedPcl ? `Petugas PCL: ${selectedPcl.nama_petugas}` : `Dashboard Lapangan • ${profilUser?.role}`}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setShowPanduanModal(true)} 
              className="bg-amber-600/80 hover:bg-amber-600 text-amber-50 font-bold px-3 py-1.5 rounded-lg border border-amber-400/30 transition-all text-xs flex items-center gap-1.5 shadow-2xs"
            >
              📖 Kamus
            </button>
            {(selectedSls || (selectedPcl && profilUser?.role === 'PML')) && (
              <button onClick={handleTombolKembali} className="bg-white/10 hover:bg-white/20 text-amber-50 font-bold px-3.5 py-1.5 rounded-lg border border-white/10 transition-all text-xs flex items-center gap-1">← Kembali</button>
            )}
            <button onClick={logout} className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs shadow-xs transition-colors">Keluar</button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER LAYOUT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 space-y-6">

        {/* 🌟 BARIS FILTER SNAPSHOT GLOBAL PALING DEPAN */}
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Filter Tanggal Anomali</h3>
              <p className="text-[10px] text-stone-400 font-medium">Pilih periode anomali yang ingin di tampilkan.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-stone-100 p-1.5 rounded-xl border border-stone-200">
            <span className="text-xs font-bold text-slate-600 pl-2">Periode:</span>
            <select
              value={selectedSnapshot}
              onChange={(e) => setSelectedSnapshot(e.target.value)}
              className="bg-white font-bold border border-stone-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-amber-600 cursor-pointer shadow-3xs"
            >
              <option value="terakhir">🌟 Anomai Terakhir ({availableSnapshots[0] ? formatTanggalIndo(availableSnapshots[0]) : '-'})</option>
              <option value="semua">📚 Semua Anomali (Akumulasi)</option>
              <optgroup label="-- Riwayat Anomali --">
                {availableSnapshots.map(tgl => (
                  <option key={tgl} value={tgl}>
                    {formatTanggalIndo(tgl)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* LEVEL 0: AGREGAT PCL UNTUK PML */}
        {profilUser?.role === 'PML' && !selectedPcl && (
          <div className="space-y-4">


            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {daftarPclAgregat.map(pcl => (
                <div key={pcl.email} onClick={() => setSelectedPcl(pcl)} className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs hover:shadow-md hover:border-amber-400 active:bg-stone-50 cursor-pointer transition-all flex flex-col justify-between group">
                  <div className="space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-800 transition-colors">🧑 {pcl.nama_petugas}</h3>
                      <span className="bg-amber-50 text-amber-800 font-extrabold text-[10px] px-2 py-0.5 rounded border border-amber-100 shrink-0">{pcl.jumlahSls} SLS</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{pcl.email}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center pt-4 mt-3 border-t border-stone-100 text-[11px]">
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <span className="text-stone-400 text-[9px] font-bold block uppercase tracking-wide">Total Anomali</span>
                      <span className="font-extrabold text-slate-800">{pcl.totalBeban}</span>
                    </div>
                    <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="text-emerald-600 text-[9px] font-bold block uppercase tracking-wide">Sudah Konf</span>
                      <span className="font-extrabold text-emerald-700">{pcl.sudahSelesai}</span>
                    </div>
                    <div className={`p-2 rounded-lg border ${pcl.belumSelesai > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-stone-50 text-stone-400'}`}>
                      <span className="text-[9px] font-bold block uppercase tracking-wide">Belum Konf</span>
                      <span className="font-black">⚠️ {pcl.belumSelesai}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEVEL 1: DAFTAR SLS TUGAS */}
        {selectedPcl && !selectedSls && (
          <div className="space-y-4">
            <div className="bg-stone-900 text-stone-100 p-4 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-xs">
              <div>
                <span className="text-stone-400 text-[10px] block uppercase font-bold tracking-wide">Petugas Lapangan:</span>
                <p className="font-black text-amber-400 text-base">{selectedPcl.nama_petugas}</p>
              </div>
              <div className="bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-stone-300">
                Email: <span className="text-amber-300 font-bold font-mono">{selectedPcl.email}</span>
              </div>
            </div>

            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Daftar Wilayah SLS Tugas Pendataan</h2>
            
            {daftarSls.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border border-stone-200 text-slate-400 font-medium shadow-3xs">Tidak ada beban muatan anomali terpetakan di wilayah kerja SLS ini.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {daftarSls.map(sls => (
                  <div key={sls.idsubsls} onClick={() => loadDetailAnomaliSls(sls)} className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs hover:shadow-md hover:border-amber-500 cursor-pointer transition-all flex justify-between items-center group">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-800 transition-colors leading-snug">{sls.nmsls}</h3>
                      <p className="text-xs text-slate-500 font-medium">Desa {sls.nmdesa}, Kec. {sls.nmkec}</p>
                      <span className="text-[10px] font-mono text-stone-400 block pt-1">{sls.idsubsls}</span>
                    </div>
                    <div className="shrink-0 ml-4">
                      {sls.belumSelesai > 0 ? (
                        <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs font-extrabold px-3 py-1 rounded-full whitespace-nowrap">⚠️ {sls.belumSelesai} Antrean</span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold px-3 py-1 rounded-full whitespace-nowrap">✅ Selesai</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEVEL 2: DAFTAR DETAIL RUTA ANOMALI */}
        {selectedSls && (
          <div className="space-y-4">
            <div className="bg-amber-950 text-amber-50 p-4 rounded-xl shadow-xs border border-amber-900/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-amber-300/70 text-[10px] block uppercase font-bold tracking-wider">Nama SLS:</span>
                <h3 className="font-black text-sm sm:text-base text-amber-200">{selectedSls.nmsls}</h3>
                <p className="text-xs text-amber-100/70 font-medium mt-0.5">Desa {selectedSls.nmdesa} • Ditemukan {daftarAnomaliRuta.length} Anomali</p>
              </div>

              {/* FILTER TAB UNTUK PENELUSURAN MASALAH */}
              <div className="bg-amber-900/60 p-1 rounded-lg border border-amber-800/80 flex items-center gap-1 shrink-0 self-stretch sm:self-auto">
                <button
                  onClick={() => setFilterTipeMasalah('SEMUA')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterTipeMasalah === 'SEMUA' ? 'bg-amber-100 text-amber-950 shadow-2xs' : 'text-amber-200 hover:text-white'}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setFilterTipeMasalah('ANOMALI')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterTipeMasalah === 'ANOMALI' ? 'bg-amber-600 text-white shadow-2xs' : 'text-amber-200 hover:text-white'}`}
                >
                  ⚠️ Anomali
                </button>
                <button
                  onClick={() => setFilterTipeMasalah('MISSING_VALUE')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterTipeMasalah === 'MISSING_VALUE' ? 'bg-sky-600 text-white shadow-2xs' : 'text-amber-200 hover:text-white'}`}
                >
                  🔍 Missing Value
                </button>
              </div>
            </div>

            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Daftar Anomali</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {daftarAnomaliRuta.map(ruta => {
                const errorTerfilter = ruta.daftar_error.filter(err => {
                  const teksKeterangan = getInfoAnomali(err.kode_anomali, 'deskripsi');
                  const isMissingValue = (err.tipe_masalah === 'MISSING_VALUE') || 
                                         String(err.kode_anomali).startsWith('M') || 
                                         teksKeterangan.toLowerCase().includes('kosong') || 
                                         teksKeterangan.toLowerCase().includes('missing');
                  
                  const passTipe = filterTipeMasalah === 'SEMUA' 
                    ? true 
                    : filterTipeMasalah === 'MISSING_VALUE' ? isMissingValue : !isMissingValue;

                  let passSnapshot = true;
                  if (selectedSnapshot === 'terakhir' && availableSnapshots.length > 0) {
                    passSnapshot = err.snapshots.some(s => s.tanggal_snapshot === availableSnapshots[0]);
                  } else if (selectedSnapshot !== 'semua' && selectedSnapshot !== 'terakhir') {
                    passSnapshot = err.snapshots.some(s => s.tanggal_snapshot === selectedSnapshot);
                  }

                  return passTipe && passSnapshot;
                });

                if (errorTerfilter.length === 0) return null;

                const anomaliKeluarga = errorTerfilter.filter(err => String(err.kode_anomali).startsWith('K'));
                const anomaliUsaha = errorTerfilter.filter(err => String(err.kode_anomali).startsWith('U'));
                const modeBersarang = anomaliKeluarga.length > 0 && anomaliUsaha.length > 0;
                const teksHeaderUtama = ruta.nama_keluarga_krt || ruta.fallback_nama;

                return (
                  <div key={ruta.assignment_id} className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-4 bg-stone-50 border-b border-stone-100 flex justify-between items-start gap-3">
                      <div className="space-y-1 max-w-[70%]">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wide">Nama Subjek / Kepala RT</span>
                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">🧑 {teksHeaderUtama}</h4>
                        {ruta.nama_unit_usaha && (
                          <div className="pt-1">
                            <span className="text-[9px] font-bold text-amber-700/80 block uppercase tracking-wide">Nama Institusi/Usaha:</span>
                            <p className="text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80 inline-block mt-0.5">🏢 {ruta.nama_unit_usaha}</p>
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono block pt-1">ID: {ruta.assignment_id}</span>
                      </div>
                      <div className="shrink-0">
                        {modeBersarang ? <span className="bg-orange-100 text-orange-800 font-black text-[9px] px-2.5 py-0.5 rounded uppercase tracking-wider border border-orange-200/60 shadow-3xs">Keluarga & Usaha</span> : anomaliUsaha.length > 0 ? <span className="bg-amber-100 text-amber-800 font-black text-[9px] px-2.5 py-0.5 rounded uppercase tracking-wider border border-amber-200/60 shadow-3xs">Usaha</span> : <span className="bg-stone-100 text-stone-700 font-black text-[9px] px-2.5 py-0.5 rounded uppercase tracking-wider border border-stone-200/60 shadow-3xs">Keluarga</span>}
                      </div>
                    </div>

                    <div className="p-3 space-y-3 divide-y divide-stone-100">
                      {errorTerfilter.map((err, i) => {
                        const isBelumTuntas = err.status_konfirmasi === 'Belum Tindak Lanjut';
                        const isUsha = String(err.kode_anomali).startsWith('U');
                        const teksKeterangan = getInfoAnomali(err.kode_anomali, 'deskripsi');
                        
                        const isMissingValue = (err.tipe_masalah === 'MISSING_VALUE') ||
                                               String(err.kode_anomali).startsWith('M') || 
                                               teksKeterangan.toLowerCase().includes('kosong') || 
                                               teksKeterangan.toLowerCase().includes('missing');

                        const warnaBarisBg = isBelumTuntas 
                          ? (isMissingValue ? 'bg-sky-50/70 border-sky-300 ring-1 ring-sky-300/30' : 'bg-red-50/70 border-amber-200/70') 
                          : 'bg-emerald-50/40 border-emerald-200/50';

                        const snapshotDitampilkan = err.snapshots.filter(s => {
                          if (selectedSnapshot === 'terakhir' && availableSnapshots.length > 0) {
                            return s.tanggal_snapshot === availableSnapshots[0];
                          }
                          if (selectedSnapshot !== 'semua' && selectedSnapshot !== 'terakhir') {
                            return s.tanggal_snapshot === selectedSnapshot;
                          }
                          return true;
                        });

                        return (
                          <div key={err.kode_anomali} className={`pt-3 pb-2 px-2.5 rounded-xl border transition-all ${warnaBarisBg} ${i === 0 ? 'mt-0' : 'mt-2'} space-y-2.5`}>
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex items-start gap-2.5">
                                <span className={`font-black px-2 py-0.5 rounded-md text-[10px] shrink-0 mt-0.5 shadow-3xs text-white ${
                                  isMissingValue ? 'bg-sky-600 animate-pulse' : isUsha ? 'bg-amber-600' : 'bg-stone-700'
                                }`}>
                                  {isMissingValue ? `🔍 ${err.kode_anomali}` : err.kode_anomali}
                                </span>
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-900 block leading-snug text-xs sm:text-sm flex items-center gap-1.5">
                                    {teksKeterangan}
                                    {isMissingValue && isBelumTuntas && (
                                      <span className="bg-sky-200 text-sky-950 font-black text-[9px] px-1.5 py-0.2 rounded uppercase tracking-wider font-sans shadow-3xs">ISIAN KOSONG</span>
                                    )}
                                  </span>
                                  <span className="text-[11px] text-amber-900/80 bg-amber-50/60 font-medium block px-2 py-1 rounded-md border border-amber-100/70 mt-1 leading-normal">
                                    Pedoman Logika: {getInfoAnomali(err.kode_anomali, 'aturan_teknis')}
                                  </span>

                                  {/* PITA LINIMASA SNAPSHOT */}
                                  <div className="pt-2 flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider block mr-1">Tanggal Anomali:</span>
                                    {snapshotDitampilkan.map(snap => {
                                      const snapBelumSelesai = snap.status_konfirmasi === 'Belum Tindak Lanjut';
                                      return (
                                        <span 
                                          key={snap.anomali_id}
                                          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shadow-2xs ${
                                            snapBelumSelesai 
                                              ? (isMissingValue ? 'bg-sky-100 text-sky-800 border-sky-300' : 'bg-amber-100 text-amber-800 border-amber-300') 
                                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 line-through'
                                          }`}
                                        >
                                          📅 {formatTanggalIndo(snap.tanggal_snapshot)}
                                        </span>
                                      );
                                    })}
                                  </div>

                                </div>
                              </div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wide border shadow-3xs ${
                                isBelumTuntas 
                                  ? (isMissingValue ? 'bg-sky-100 text-sky-900 border-sky-300' : 'bg-amber-100 text-amber-800 border-amber-300/60') 
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300/60'
                              }`}>
                                {isBelumTuntas ? (isMissingValue ? 'Belum Diisi' : 'Belum Tindak Lanjut') : 'Selesai'}
                              </span>
                            </div>

                            {err.catatan_lapangan && (
                              <div className="p-2.5 bg-white/80 border border-stone-200 border-dashed rounded-lg text-xs text-slate-600 font-medium leading-relaxed">
                                <span className="font-bold text-amber-900 text-[9px] block mb-0.5 uppercase tracking-wider">Konfirmasi Terkini Petugas:</span>"{err.catatan_lapangan}"
                              </div>
                            )}

                            <div className="flex justify-end pt-0.5">
                              <button 
                                onClick={() => handleOpenActionModal(err, isUsha ? `${ruta.nama_unit_usaha || teksHeaderUtama} (Usaha)` : teksHeaderUtama, ruta.assignment_id)} 
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                                  isBelumTuntas 
                                    ? (isMissingValue ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white') 
                                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200'
                                }`}
                              >
                                {isBelumTuntas ? (isMissingValue ? '📝 Isi Data Kosong' : '✍️ Isi Konfirmasi') : '✏️ Perbaiki Konfirmasi'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* INPUT CONFIRMATION MODAL */}
      {editingAnomali && (
        <div className="fixed inset-0 bg-slate-900/60 z-30 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-xl space-y-4 border border-stone-200 animate-scale-up">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Lembar Justifikasi Data</span>
                <h4 className="text-sm font-bold text-slate-900 leading-tight">{editingAnomali.nama_subjek}</h4>
                <div className="text-[11px] text-slate-500 font-medium bg-stone-100 px-2.5 py-1 rounded-md inline-block mt-1">
                  Anomali {editingAnomali.kode_anomali}: <span className="font-bold text-slate-700">{getInfoAnomali(editingAnomali.kode_anomali, 'deskripsi')}</span>
                </div>
              </div>
              <button onClick={() => setEditingAnomali(null)} className="text-slate-400 hover:text-slate-600 font-black text-base p-2 transition-colors">✕</button>
            </div>

            <div className="space-y-3.5">
              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-[11px] leading-relaxed text-amber-950 font-medium">
                💡 <strong>Informasi Sinkronisasi Linimasa:</strong> Kelompok anomali ini terdeteksi sebanyak <span className="font-black underline">{editingAnomali.snapshots?.length || 1} kali</span> di server pusat. Mengisi konfirmasi di bawah akan otomatis melunasi antrean untuk semua tanggal snapshot terkait.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Status Verifikasi Lapangan</label>
                <select value={statusKonfirmasiForm} onChange={(e) => setStatusKonfirmasiForm(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all">
                  <option value="Sesuai Kondisi Lapangan">✅ Sesuai Kondisi Nyata Lapangan</option>
                  <option value="Perlu Perbaikan Data">✏️ Perlu Perbaikan Data di Aplikasi Fasih</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Alasan / Hasil Konfirmasi Lapangan <span className="text-orange-500">*</span></label>
                <textarea rows="4" value={catatanLapanganForm} onChange={(e) => setCatatanLapanganForm(e.target.value)} placeholder="Tulis alasan logis hasil kroscek lapangan yang dapat menerangkan penyebab anomali atau variabel kosong..." className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-medium text-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none h-24 transition-all resize-none leading-relaxed"></textarea>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-stone-100">
              <button type="button" onClick={() => setEditingAnomali(null)} className="w-1/3 border border-stone-200 rounded-xl py-2 text-xs font-bold text-slate-500 hover:bg-stone-50 transition-colors">Batal</button>
              <button type="button" disabled={submitting} onClick={handleSaveTindakLanjut} className="w-2/3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-2 text-xs font-bold disabled:opacity-50 shadow-xs transition-colors">{submitting ? 'Menyimpan...' : 'Simpan Konfirmasi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* KAMUS POPUP PANDUAN PETA LOGIKA ANOMALI */}
      {showPanduanModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-40 flex items-center justify-center p-4 animate-fade-in backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-stone-200 flex flex-col max-h-[85vh] animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-amber-800 to-orange-900 text-white rounded-t-2xl flex justify-between items-center shrink-0">
              <div className="space-y-0.5">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-amber-50">📢 Kamus Kode Anomali</h3>
                <p className="text-xs text-amber-200/80 font-medium">Sensus Ekonomi & Pendataan Karakteristik Keluarga</p>
              </div>
              <button onClick={() => setShowPanduanModal(false)} className="bg-white/10 hover:bg-white/20 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm leading-relaxed text-slate-700">
              <p className="text-stone-500 font-medium bg-amber-50 p-3 rounded-lg border border-amber-200/50">
                <strong>Perhatian Petugas:</strong> Definisikan hasil verifikasi Anda di lapangan berdasarkan aturan rules logika blok kuesioner sebelum melakukan pengisian konfirmasi.
              </p>

              {/* VARIABEL KOSONG (MISSING VALUE) */}
              <div className="space-y-3">
                <h4 className="text-sm font-extrabold text-sky-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-sky-100 pb-1.5">🔍 Variabel Kosong (Missing Value)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {masterAnomali.filter(a => String(a.kode).startsWith('M') || a.deskripsi.toLowerCase().includes('kosong')).map(item => (
                    <div key={item.kode} className="bg-sky-50/50 p-3 rounded-xl border border-sky-200 space-y-1">
                      <span className="font-bold text-sky-950 block">M[{item.kode}]. {item.deskripsi}</span>
                      <p className="text-[11px] text-sky-900/90 leading-normal">{item.aturan_teknis}</p>
                    </div>
                  ))}
                  {masterAnomali.filter(a => String(a.kode).startsWith('M') || a.deskripsi.toLowerCase().includes('kosong')).length === 0 && (
                    <div className="text-[11px] text-slate-400 font-medium py-2 col-span-2">Tidak ditemukan aturan isian kosong pada referensi master.</div>
                  )}
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-extrabold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-1.5">🏢 Anomali Usaha</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {masterAnomali.filter(a => String(a.kode).startsWith('U') && !a.deskripsi.toLowerCase().includes('kosong')).map(item => (
                    <div key={item.kode} className="bg-stone-50 p-3 rounded-xl border border-stone-200/60 space-y-1">
                      <span className="font-bold text-slate-900 block">{item.kode}. {item.deskripsi}</span>
                      <p className="text-[11px] text-slate-600">{item.aturan_teknis}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-extrabold text-stone-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-1.5">🧑 Anomali Keluarga</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {masterAnomali.filter(a => String(a.kode).startsWith('K') && !a.deskripsi.toLowerCase().includes('kosong')).map(item => (
                    <div key={item.kode} className="bg-stone-50 p-3 rounded-xl border border-stone-200/60 space-y-1">
                      <span className="font-bold text-slate-900 block">{item.kode}. {item.deskripsi}</span>
                      <p className="text-[11px] text-slate-600">{item.aturan_teknis}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-100 flex justify-end shrink-0 rounded-b-2xl">
              <button onClick={() => setShowPanduanModal(false)} className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-6 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all">Saya Mengerti, Buka Dashboard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}