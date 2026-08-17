// src/pages/DashboardKantor.jsx
import React, { useState, useEffect } from 'react';
import { supabaseData } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

export default function DashboardKantor() {
  const { profile: profilUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const hitungPersen = (pembilang, penyebut) => {
    if (!penyebut || penyebut === 0) return "0.0%";
    return `${((pembilang / penyebut) * 100).toFixed(1)}%`;
  };

  const formatTanggalIndo = (stringTanggal) => {
    if (!stringTanggal || stringTanggal === '0000-00-00') return "-";
    const opsi = { day: '2-digit', month: 'long', year: 'numeric' };
    return new Date(stringTanggal).toLocaleDateString('id-ID', opsi);
  };

  // Data State
  const [masterAnomali, setMasterAnomali] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // CACHE STATE GLOBAL: Menyimpan data asli dari database agar tidak fetch berulang-ulang
  const [rawViewData, setRawViewData] = useState([]);

  // STATE FILTER SNAPSHOT
  const [availableSnapshots, setAvailableSnapshots] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState('terakhir');

  // UI Kontrol State
  const [expandedKec, setExpandedKec] = useState({});
  const [expandedSnap, setExpandedSnap] = useState({});
  const [modalDetailObj, setModalDetailObj] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [loadingModal, setLoadingModal] = useState(false);
  const [konfirmasiId, setKonfirmasiId] = useState(null);

  const [catatanPegawaiInput, setCatatanPegawaiInput] = useState('');
  const [editingCatatanId, setEditingCatatanId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [idSelesaiLokal, setIdSelesaiLokal] = useState([]);

  // STATE TAB MONITORING UTAMA KANTOR
  const [mainMasalahTab, setMainMasalahTab] = useState('ANOMALI');

  // State Baru untuk Alur Unggah Excel Cerdas
  const [rawExcelData, setRawExcelData] = useState(null);
  const [modalUploadReview, setModalUploadReview] = useState(false);
  const [pilihanTanggalSnapshot, setPilihanTanggalSnapshot] = useState(new Date().toISOString().split('T')[0]);
  const [uploadProgressStatus, setUploadProgressStatus] = useState(''); // 'membaca', 'review_rows', 'mengirim', 'selesai'
  const [hasilUploadRingkasan, setHasilUploadRingkasan] = useState(null);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [mappedRowItems, setMappedRowItems] = useState([]);

  // State untuk menyimpan peta (mapping) pilihan user
  const [columnMap, setColumnMap] = useState({
    assignment_id: '',
    nama_subjek: '',
    nama_anomali: '',
    kodedesa: '',
    sls: '',
    subsls: '',
    link_fasih: ''
  });
  const [subjekFilterTab, setSubjekFilterTab] = useState('siap_eksekusi');

  // KPI Rapor Ringkasan Global
  const [summaryMetrics, setSummaryMetrics] = useState({
    totalAnomali: 0, sudahPcl: 0, belumPcl: 0, sudahFasih: 0, belumFasih: 0
  });

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
      setMasterAnomali(data || []);
      console.log('=== MASTER ANOMALI BERHASIL DIMUAT ===');
      console.table(data || []);
    } catch (err) {
      console.error('Gagal memuat aturan master anomali:', err.message);
    }
  };

  const fetchDataMonitoringKantor = async () => {
    setLoading(true);

    try {
      const pageSize = 1000;
      let from = 0;
      let semuaDataView = [];

      while (true) {
        const { data, error } = await supabaseData
          .from('view_rekap_agregat_kantor')
          .select('*')
          .order('tanggal_snapshot', { ascending: false })
          .order('kdkec', { ascending: true })
          .order('idsubsls', { ascending: true })
          .order('pml_email', { ascending: true })
          .order('kode_anomali', { ascending: true })
          .order('tipe_masalah', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;

        const batch = data || [];

        console.log(
          `📦 FETCH VIEW: ${from} - ${from + pageSize - 1} = ${batch.length} row`
        );

        semuaDataView = [...semuaDataView, ...batch];

        if (batch.length < pageSize) break;
        from += pageSize;
      }

      console.log('✅ TOTAL ROW VIEW DITERIMA:', semuaDataView.length);

      const dbRows = semuaDataView;

      const daftarKecDariDB = [
        ...new Map(
          dbRows.map(item => [
            `${item.kdkec}_${item.nmkec}`,
            { kdkec: item.kdkec, nmkec: item.nmkec }
          ])
        ).values()
      ];

      console.log('✅ JUMLAH KEC DARI VIEW:', daftarKecDariDB.length);
      console.table(daftarKecDariDB);

      setRawViewData(dbRows);

      const daftarTanggal = [
        ...new Set(dbRows.map(item => item.tanggal_snapshot))
      ]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a));

      setAvailableSnapshots(daftarTanggal);

      filterDanProsesDataLokal(
        dbRows,
        mainMasalahTab,
        selectedSnapshot,
        daftarTanggal
      );

    } catch (err) {
      console.error('❌ GAGAL FETCH DATA MONITORING KANTOR:', err);

      alert(
        'Gagal mengambil data monitoring: ' +
        (err?.message || err)
      );
    } finally {
      setLoading(false);
    }
  };

  // FUNGSI OPTIMALISASI UTAMA: Memilah data langsung di RAM browser berdasarkan Tab & Snapshot
  const filterDanProsesDataLokal = (semuaData, tabAktif, snapshotDipilih, daftarTglSnap = availableSnapshots) => {
    // 1. Filter Tipe Masalah
    let dataTerfilter = semuaData.filter(item => 
      (item.tipe_masalah || 'ANOMALI') === tabAktif
    );

    // 2. Filter Berdasarkan Tanggal Snapshot Yang Dipilih
    if (snapshotDipilih === 'terakhir' && daftarTglSnap.length > 0) {
      const tglTerbaru = daftarTglSnap[0];
      dataTerfilter = dataTerfilter.filter(item => item.tanggal_snapshot === tglTerbaru);
    } else if (snapshotDipilih !== 'semua' && snapshotDipilih !== 'terakhir') {
      dataTerfilter = dataTerfilter.filter(item => item.tanggal_snapshot === snapshotDipilih);
    }

    hitungMetrikGlobal(dataTerfilter);
    prosesStrukturAgregat(dataTerfilter);
  };

  useEffect(() => {
    if (rawViewData.length > 0) {
      filterDanProsesDataLokal(rawViewData, mainMasalahTab, selectedSnapshot);
    }
  }, [mainMasalahTab, selectedSnapshot, rawViewData]);

  useEffect(() => {
    const siapkanDataAwal = async () => {
      await fetchMasterAnomali();
      await fetchDataMonitoringKantor();
    };
    siapkanDataAwal();
  }, []);

  const hitungMetrikGlobal = (data) => {
    let total = 0, sudahPcl = 0, sudahFasih = 0, belumFasih = 0;

    data.forEach(d => {
      total += Number(d.total_rows || 0);
      sudahPcl += Number(d.sudah_pcl || 0);
      sudahFasih += Number(d.sudah_fasih || 0);
      belumFasih += Number(d.belum_fasih || 0);
    });

    setSummaryMetrics({
      totalAnomali: total, 
      sudahPcl: sudahPcl, 
      belumPcl: total - sudahPcl, 
      sudahFasih: sudahFasih, 
      belumFasih: belumFasih
    });
  };

  const prosesStrukturAgregat = (data) => {
    const kecMap = {};

    data.forEach(item => {
      const kecKey = item.kdkec || '999';
      const namaKecamatannya = item.nmkec || 'TIDAK TERDEFINISI';
      const tglKey = item.tanggal_snapshot || '0000-00-00';
      const pmlKey = item.nama_pml || item.pml_email || 'TANPA PML';
      const pmlEmailKey = item.pml_email || 'no-email';
      const kodeKey = item.kode_anomali || 'ERR';

      if (!kecMap[kecKey]) {
        kecMap[kecKey] = { kodeKec: kecKey, namaKec: namaKecamatannya, snapshotRows: {} };
      }
      if (!kecMap[kecKey].snapshotRows[tglKey]) {
        kecMap[kecKey].snapshotRows[tglKey] = { tglSnapshot: tglKey, pmlRows: {} };
      }
      if (!kecMap[kecKey].snapshotRows[tglKey].pmlRows[pmlKey]) {
        kecMap[kecKey].snapshotRows[tglKey].pmlRows[pmlKey] = { namaPml: pmlKey, emailPml: pmlEmailKey, kodeRows: {} };
      }

      if (!kecMap[kecKey].snapshotRows[tglKey].pmlRows[pmlKey].kodeRows[kodeKey]) {
        kecMap[kecKey].snapshotRows[tglKey].pmlRows[pmlKey].kodeRows[kodeKey] = {
          kode: kodeKey,
          total: 0, sudahPcl: 0, belumPcl: 0, sudahFasih: 0, belumFasih: 0,
          kdkec: kecKey,
          tanggal_snapshot: tglKey,
          pml_email: pmlEmailKey,
          namaPml: pmlKey
        };
      }

      const targetKode = kecMap[kecKey].snapshotRows[tglKey].pmlRows[pmlKey].kodeRows[kodeKey];

      targetKode.total += Number(item.total_rows || 0);
      targetKode.sudahPcl += Number(item.sudah_pcl || 0);
      targetKode.belumPcl += Number(item.belum_pcl || 0);
      targetKode.sudahFasih += Number(item.sudah_fasih || 0);
      targetKode.belumFasih += Number(item.belum_fasih || 0);
    });

    const finalTree = Object.values(kecMap).map(k => ({
      ...k,
      snapshotList: Object.values(k.snapshotRows).map(s => ({
        ...s,
        pmlList: Object.values(s.pmlRows).map(p => ({
          ...p,
          kodeList: Object.values(p.kodeRows).sort((a, b) => a.kode.localeCompare(b.kode))
        })).sort((a, b) => a.namaPml.localeCompare(b.namaPml))
      })).sort((a, b) => b.tglSnapshot.localeCompare(a.tglSnapshot))
    }));

    finalTree.sort((a, b) => String(a.kodeKec).localeCompare(String(b.kodeKec), undefined, { numeric: true }));
    setTreeData(finalTree);
  };

  const handlePilihFileExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgressStatus('membaca');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawDataAwal = XLSX.utils.sheet_to_json(ws, {
          range: 3,
          defval: ''
        });

        // File BPS dapat memiliki satu baris nomor kolom: (1), (2), ... .
        // Itu bukan data responden, jadi dibuang otomatis.
        const rawData = rawDataAwal.filter((row) => {
          const nilaiTerisi = Object.values(row)
            .map((nilai) => String(nilai ?? '').trim())
            .filter(Boolean);

          const barisNomorKolom =
            nilaiTerisi.length > 0 &&
            nilaiTerisi.every((nilai) => /^\(\d+\)$/.test(nilai));

          return !barisNomorKolom;
        });

        if (rawData.length === 0) {
          alert('File Excel kosong!');
          setUploading(false);
          return;
        }

        const headersAsli = Object.keys(rawData[0]);
        setExcelHeaders(headersAsli);

        const normalisasiHeader = (nilai) =>
          String(nilai ?? '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '');

        const tebakKolom = (kemungkinan) => {
          const kandidat = kemungkinan.map(normalisasiHeader);
          const hasil = headersAsli.find((header) =>
            kandidat.includes(normalisasiHeader(header))
          );
          return hasil || '';
        };

        setColumnMap({
          assignment_id: tebakKolom(['assignmentid', 'assignment_id', 'id', 'idassignment']),
          nama_subjek: tebakKolom(['namausaha', 'namakrt', 'namasubjek', 'namakepalakeluarga', 'nama']),
          nama_anomali: tebakKolom([
            'namaanomali', 'deskripsianomali', 'anomali', 'keterangan', 'pesan',
            'indikatoranomali', 'namakasusanomali', 'kasusanomali',
            'uraiananomali', 'deskripsikasusanomali'
          ]),
          kodedesa: tebakKolom(['kodedesa', 'kddesa', 'iddesa', 'desa']),
          sls: tebakKolom(['kodesls', 'kdsls', 'idsls', 'sls']),
          subsls: tebakKolom(['subsls', 'kdsubsls', 'sub_sls']),
          link_fasih: tebakKolom(['linkfasih', 'link_fasih', 'urlfasih', 'tautan'])
        });

        setRawExcelData(rawData);
        setHasilUploadRingkasan(null);
        setModalUploadReview(true); 
      } catch (err) {
        alert('Gagal membaca file Excel: ' + err.message);
        setUploading(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleProsesReviewBarisData = () => {
    if (!columnMap.assignment_id || !columnMap.nama_subjek || !columnMap.nama_anomali) {
      alert('Mohon petakan kolom minimal untuk ID Assignment, Nama Subjek, dan Nama Anomali!');
      return;
    }

    const itemHasilOlahan = rawExcelData.map((row, index) => {
      const namaAnomaliRaw = row[columnMap.nama_anomali] || '';

      const normalisasiTeks = (nilai) =>
        String(nilai ?? '')
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/[^a-z0-9]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const teksNormal = normalisasiTeks(namaAnomaliRaw);

      const aturanCocok = masterAnomali.find((aturan) => {
        const deskripsiNormal = normalisasiTeks(aturan.deskripsi);

        if (deskripsiNormal && teksNormal.includes(deskripsiNormal)) {
          return true;
        }

        const daftarKataKunci = String(aturan.kata_kunci || '')
          .split(',')
          .map((kata) => normalisasiTeks(kata))
          .filter(Boolean);

        return daftarKataKunci.some((kataKunci) =>
          teksNormal.includes(kataKunci)
        );
      });

      const kodeAnomali = aturanCocok ? aturanCocok.kode : 'ERR';

      console.log('MATCH ANOMALI:', {
        teks_excel: namaAnomaliRaw,
        master_kode: aturanCocok?.kode || 'ERR',
        master_deskripsi: aturanCocok?.deskripsi || null,
        master_kata_kunci: aturanCocok?.kata_kunci || null
      });

      const desaRaw = columnMap.kodedesa ? String(row[columnMap.kodedesa] || '') : '';
      const slsRaw = columnMap.sls ? String(row[columnMap.sls] || '') : '';
      const subSlsRaw = columnMap.subsls ? String(row[columnMap.subsls] || '') : '00';

      const desa = desaRaw.trim().padStart(10, '0');
      const sls = slsRaw.trim().padStart(4, '0');
      const subSls = subSlsRaw.trim().padStart(2, '0');
      const generatedIdSubSls = `${desa}${sls}${subSls}`;

      return {
        id_lokal: index,
        idsubsls: generatedIdSubSls,
        assignment_id: String(row[columnMap.assignment_id] || `GEN-${Date.now()}-${index}`),
        nama_subjek: row[columnMap.nama_subjek] || 'Tanpa Nama',
        teks_anomali_asli: String(namaAnomaliRaw), 
        kode_anomali: kodeAnomali,
        link_fasih: columnMap.link_fasih ? (row[columnMap.link_fasih] || '') : ''
      };
    });

    console.log('✅ MODE IMPORT: 1 BARIS EXCEL = 1 RECORD ANOMALI');
    console.log('✅ TOTAL BARIS EXCEL VALID:', rawExcelData.length);
    console.log('✅ TOTAL ITEM REVIEW:', itemHasilOlahan.length);
    console.log(
      '⚠️ TOTAL ITEM ERR:',
      itemHasilOlahan.filter(item => item.kode_anomali === 'ERR').length
    );

    setMappedRowItems(itemHasilOlahan);
    setUploadProgressStatus('review_rows'); 
  };

  const handleUbahKodeBarisManual = (idLokal, kodeBaru) => {
    setMappedRowItems(prev => prev.map(item => 
      item.id_lokal === idLokal ? { ...item, kode_anomali: kodeBaru } : item
    ));
  };

  const handleEksekusiUploadKeDatabase = async () => {
    const adaYangMasihErr = mappedRowItems.some(item => item.kode_anomali === 'ERR');
    if (adaYangMasihErr) {
      alert('Masih ada baris data yang berkode ERR. Silakan tentukan manual terlebih dahulu melalui dropdown yang disediakan!');
      return;
    }

    setUploadProgressStatus('mengirim');

    try {
      const { data: historiLengkap } = await supabaseData
        .from('view_monitoring_anomali')
        .select('assignment_id, kode_anomali, nama_subjek, tanggal_snapshot, status_konfirmasi, catatan_lapangan, dkonfirmasi_oleh_email, tanggal_konfirmasi')
        .not('catatan_lapangan', 'is', null);

      const { data: dataMenggantung } = await supabaseData
        .from('view_monitoring_anomali')
        .select('assignment_id, kode_anomali, nama_subjek, pertama_muncul_pada')
        .not('status_fasih', 'eq', 'Sudah Tindak Lanjut FASIH');

      let jumlahSukses = 0;
      let jumlahGagal = 0;

      const petaCatatanRiwayat = {};
      const setKunciUnikImpor = new Set(); 

      const formattedDataRaw = mappedRowItems.map((item) => {
        try {
          const aturanCocok = masterAnomali.find(a => a.kode === item.kode_anomali);
          const kategori = aturanCocok ? aturanCocok.kategori : 'USAHA';

          const teksCari = item.teks_anomali_asli.toLowerCase();
          const tipeMasalahDitemukan = (teksCari.includes('kosong') || teksCari.includes('missing') || teksCari.includes('tidak ada')) 
            ? 'MISSING_VALUE' 
            : 'ANOMALI';

          const namaSubjekBersih = String(item.nama_subjek).trim();

          const temukanDataLama = dataMenggantung?.find(
            old => old.assignment_id === item.assignment_id && 
                   old.kode_anomali === item.kode_anomali &&
                   String(old.nama_subjek).trim().toLowerCase() === namaSubjekBersih.toLowerCase()
          );

          const jejakMasaLalu = historiLengkap?.find(
            old => String(old.assignment_id).trim().toLowerCase() === String(item.assignment_id).trim().toLowerCase() && 
                   String(old.kode_anomali).trim().toLowerCase() === String(item.kode_anomali).trim().toLowerCase() && 
                   String(old.nama_subjek).trim().toLowerCase() === namaSubjekBersih.toLowerCase() &&
                   old.tanggal_snapshot < pilihanTanggalSnapshot
          );

          const keyGabung = `${String(item.assignment_id).trim()}_${String(item.kode_anomali).trim()}_${namaSubjekBersih.toLowerCase()}`;

          if (jejakMasaLalu) {
            petaCatatanRiwayat[keyGabung] = jejakMasaLalu;
          }

          jumlahSukses++;
          return {
            idsubsls: item.idsubsls,
            assignment_id: item.assignment_id,
            nama_subjek: namaSubjekBersih,
            kode_anomali: item.kode_anomali,
            kategori_anomali: kategori,
            link_fasih: item.link_fasih,
            tanggal_snapshot: pilihanTanggalSnapshot,
            pertama_muncul_pada: temukanDataLama ? temukanDataLama.pertama_muncul_pada : pilihanTanggalSnapshot,
            tipe_masalah: tipeMasalahDitemukan 
          };
        } catch (errRow) {
          jumlahGagal++;
          return null;
        }
      }).filter(item => item !== null);

      const formattedData = formattedDataRaw.filter((item) => {
        const kunciUnikBaris = `${item.assignment_id}_${item.kode_anomali}_${item.nama_subjek.toLowerCase()}_${item.tanggal_snapshot}`;
        if (setKunciUnikImpor.has(kunciUnikBaris)) {
          return false; 
        }
        setKunciUnikImpor.add(kunciUnikBaris);
        return true;
      });

      if (formattedData.length > 0) {
        const { data: dataBaruDisisipkan, error } = await supabaseData
          .from('anomali_data')
          .upsert(formattedData, {
            onConflict: 'assignment_id, kode_anomali, nama_subjek, tanggal_snapshot',
            ignoreDuplicates: false 
          })
          .select('id, assignment_id, kode_anomali, nama_subjek');

        if (error) throw error;

        if (dataBaruDisisipkan && dataBaruDisisipkan.length > 0) {
          const payloadTindakLanjut = [];

          dataBaruDisisipkan.forEach((barisBaru) => {
            const keyCari = `${String(barisBaru.assignment_id).trim()}_${String(barisBaru.kode_anomali).trim()}_${String(barisBaru.nama_subjek).trim().toLowerCase()}`;
            const dataLamaDitemukan = petaCatatanRiwayat[keyCari];

            if (dataLamaDitemukan) {
              payloadTindakLanjut.push({
                anomali_id: barisBaru.id, 
                status_konfirmasi: dataLamaDitemukan.status_konfirmasi,
                catatan_lapangan: dataLamaDitemukan.catatan_lapangan,
                dkonfirmasi_oleh_email: dataLamaDitemukan.dkonfirmasi_oleh_email,
                tanggal_konfirmasi: dataLamaDitemukan.tanggal_konfirmasi,
                status_monitoring: 'Belum Diperiksa',
                catatan_pegawai: null,
                diperiksa_oleh_email: null,
                tanggal_periksa: null,
                status_fasih: 'Belum Tindak Lanjut FASIH',
                dieksekusi_oleh_email: null,
                waktu_eksekusi_fasih: null
              });
            } else {
              payloadTindakLanjut.push({
                anomali_id: barisBaru.id,
                status_konfirmasi: 'Belum Tindak Lanjut',
                catatan_lapangan: null,
                dkonfirmasi_oleh_email: null,
                tanggal_konfirmasi: null,
                status_monitoring: 'Belum Diperiksa',
                status_fasih: 'Belum Tindak Lanjut FASIH'
              });
            }
          });

          if (payloadTindakLanjut.length > 0) {
            const { error: errUpsertTindakLanjut } = await supabaseData
              .from('tindak_lanjut_anomali')
              .upsert(payloadTindakLanjut, { onConflict: 'anomali_id' });

            if (errUpsertTindakLanjut) throw errUpsertTindakLanjut;
          }
        }
      }

      setHasilUploadRingkasan({
        total: mappedRowItems.length,
        sukses: jumlahSukses,
        gagal: jumlahGagal
      });
      setUploadProgressStatus('selesai');
      fetchDataMonitoringKantor();

    } catch (err) {
      console.error("❌ PROSES IMPOR GAGAL TOTAL:", err);
      alert('Gagal mengimpor data anomali: ' + err.message);
      setModalUploadReview(false);
      setUploading(false);
    }
  };

  const handleBukaModalDetail = async (itemObj, namaKec) => {
    setSubjekFilterTab('siap_eksekusi');
    setLoadingModal(true);
    setIdSelesaiLokal([]);

    setModalDetailObj({ 
      ...itemObj, 
      namaKec: namaKec, 
      kodePemicu: itemObj.kode, 
      tglSnapshot: itemObj.tanggal_snapshot, 
      daftarSubjek: [] 
    });

    try {
      const { data: sampelTarget, error } = await supabaseData
        .from('view_monitoring_anomali')
        .select('anomali_id, assignment_id, nama_subjek, nmdesa, nmsls, nama_pcl, pcl_email, link_fasih, kode_anomali, status_konfirmasi, catatan_lapangan, status_fasih, catatan_pegawai')
        .eq('kdkec', itemObj.kdkec)
        .eq('pml_email', itemObj.pml_email)
        .eq('tanggal_snapshot', itemObj.tanggal_snapshot);

      if (error) throw error;

      const listAssignmentId = [...new Set(sampelTarget.map(s => s.assignment_id))];
      const grupBerdasarkanSubjek = listAssignmentId.map(assignId => {
        const semuaAnomaliSubjek = sampelTarget.filter(raw => raw.assignment_id === assignId);
        const profilUtama = semuaAnomaliSubjek[0];

        return {
          assignment_id: assignId,
          nama_subjek: profilUtama.nama_subjek,
          nmdesa: profilUtama.nmdesa,
          nmsls: profilUtama.nmsls,
          nama_pcl: profilUtama.nama_pcl || profilUtama.pcl_email,
          link_fasih: profilUtama.link_fasih,
          detailAnomali: semuaAnomaliSubjek.map(a => ({
            anomali_id: a.anomali_id,
            kode: a.kode_anomali,
            status_konfirmasi: a.status_konfirmasi,
            catatan_lapangan: a.catatan_lapangan,
            status_fasih: a.status_fasih,
            catatan_pegawai: a.catatan_pegawai,
          }))
        };
      });

      const subjekValid = grupBerdasarkanSubjek.filter(subjek => 
        subjek.detailAnomali.some(a => a.kode === itemObj.kode)
      );

      setModalDetailObj(prev => ({ ...prev, daftarSubjek: subjekValid }));
    } catch (err) {
      console.error("Gagal memuat detail sampel:", err.message);
      alert("Gagal memuat data detail subjek.");
      setModalDetailObj(null);
    } finally {
      setLoadingModal(false);
    }
  };

  const handleTutupModal = () => {
    setModalDetailObj(null);
    setIdSelesaiLokal([]);
  };

  const handleSimpanFasihTunggal = async (anomaliId) => {
    setUpdatingId(anomaliId);

    try {
      const targetSubjek = modalDetailObj.daftarSubjek.find(s => 
        s.detailAnomali.some(a => a.anomali_id === anomaliId)
      );
      const detailAnomaliTarget = targetSubjek?.detailAnomali.find(a => a.anomali_id === anomaliId);

      if (!targetSubjek || !detailAnomaliTarget) throw new Error("Data lokal tidak sinkron");

      const assignIdIdem = targetSubjek.assignment_id;
      const kodeAnomaliIdem = detailAnomaliTarget.kode;

      const { data: daftarKembar, error: errCari } = await supabaseData
        .from('view_monitoring_anomali')
        .select('anomali_id')
        .eq('assignment_id', assignIdIdem)
        .eq('kode_anomali', kodeAnomaliIdem);

      if (errCari) throw errCari;

      const listPayload = daftarKembar.map(item => ({
        anomali_id: item.anomali_id,
        status_fasih: 'Sudah Tindak Lanjut FASIH',
        dieksekusi_oleh_email: profilUser?.email,
        waktu_eksekusi_fasih: new Date().toISOString(),

        catatan_pegawai: catatanPegawaiInput.trim() || null,
        status_monitoring: 'Sudah Diperiksa',
        diperiksa_oleh_email: profilUser?.email,
        tanggal_periksa: new Date().toISOString()
      }));

      const { error: errUpsert } = await supabaseData
        .from('tindak_lanjut_anomali')
        .upsert(listPayload, { onConflict: 'anomali_id' });

      if (errUpsert) throw errUpsert;

      setIdSelesaiLokal(prev => [...prev, anomaliId]);

      setKonfirmasiId(null);
      setCatatanPegawaiInput('');

      setModalDetailObj(prev => {
        if (!prev) return null;
        return {
          ...prev,
          daftarSubjek: prev.daftarSubjek.map(subjek => {
            if (subjek.assignment_id === assignIdIdem) {
              return {
                ...subjek,
                detailAnomali: subjek.detailAnomali.map(anomali => {
                  if (anomali.kode === kodeAnomaliIdem) {
                    return { ...anomali, status_fasih: 'Sudah Tindak Lanjut FASIH' };
                  }
                  return anomali;
                })
              };
            }
            return subjek;
          })
        };
      });

      setRawViewData(prev => prev.map(row => {
        const kecocokan = daftarKembar.some(dk => dk.anomali_id === row.anomali_id || (row.assignment_id === assignIdIdem && row.kode_anomali === kodeAnomaliIdem));
        if (kecocokan) {
          return { ...row, status_fasih: 'Sudah Tindak Lanjut FASIH', status_konfirmasi: row.status_konfirmasi === 'Belum Tindak Lanjut' ? 'Sesuai Kondisi Lapangan' : row.status_konfirmasi };
        }
        return row;
      }));

    } catch (err) {
      alert('Gagal memperbarui status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveCatatan = async (anomaliId) => {
    try {
      const { error } = await supabaseData
        .from('tindak_lanjut_anomali')
        .update({ catatan_pegawai: editValue })
        .eq('anomali_id', anomaliId);

      if (error) throw error;

      setModalDetailObj(prev => ({
        ...prev,
        daftarSubjek: prev.daftarSubjek.map(s => ({
          ...s,
          detailAnomali: s.detailAnomali.map(a => 
            a.anomali_id === anomaliId ? { ...a, catatan_pegawai: editValue } : a
          )
        }))
      }));

      setEditingCatatanId(null);
      setEditValue('');
    } catch (err) {
      alert('Gagal menyimpan catatan: ' + err.message);
    }
  };

  const toggleExpandKec = (kecName) => {
    setExpandedKec(prev => ({ ...prev, [kecName]: !prev[kecName] }));
  };

  const toggleExpandSnap = (kecKey, snapDate) => {
    const compositeKey = `${kecKey}_${snapDate}`;
    setExpandedSnap(prev => ({ ...prev, [compositeKey]: !prev[compositeKey] }));
  };

  const semuaSubjekModal = modalDetailObj?.daftarSubjek || [];
  const jumlahSiapEksekusi = semuaSubjekModal.filter(subjek => 
    subjek.detailAnomali.some(a => a.status_fasih !== 'Sudah Tindak Lanjut FASIH' && a.status_konfirmasi !== 'Belum Tindak Lanjut' && a.catatan_lapangan)
  ).length;
  const jumlahSelesai = semuaSubjekModal.filter(subjek => subjek.detailAnomali.every(a => a.status_fasih === 'Sudah Tindak Lanjut FASIH')).length;
  const jumlahSemua = semuaSubjekModal.length;

  const subjekTersaring = semuaSubjekModal.filter(subjek => {
    const isSelesaiSemuaMurni = subjek.detailAnomali.every(a => a.status_fasih === 'Sudah Tindak Lanjut FASIH');
    const adaSiapEksekusiMurni = subjek.detailAnomali.some(a => a.status_fasih !== 'Sudah Tindak Lanjut FASIH' && a.status_konfirmasi !== 'Belum Tindak Lanjut' && a.catatan_lapangan);
    const adaYangBaruDisetujuiLokal = subjek.detailAnomali.some(a => idSelesaiLokal.includes(a.anomali_id));

    if (subjekFilterTab === 'siap_eksekusi') {
      return (adaSiapEksekusiMurni && !isSelesaiSemuaMurni) || adaYangBaruDisetujuiLokal;
    }
    if (subjekFilterTab === 'selesai') return isSelesaiSemuaMurni;
    return true;
  });

  const subjekSiapTampil = [...subjekTersaring].sort((a, b) => {
    const aSiapAtauBaruSelesai = a.detailAnomali.some(an => (an.catatan_lapangan && an.status_fasih !== 'Sudah Tindak Lanjut FASIH') || idSelesaiLokal.includes(an.anomali_id));
    const bSiapAtauBaruSelesai = b.detailAnomali.some(an => (an.catatan_lapangan && an.status_fasih !== 'Sudah Tindak Lanjut FASIH') || idSelesaiLokal.includes(an.anomali_id));

    if (aSiapAtauBaruSelesai && !bSiapAtauBaruSelesai) return -1;
    if (!aSiapAtauBaruSelesai && bSiapAtauBaruSelesai) return 1;
    return 0;
  });

  if (loading && masterAnomali.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-slate-500 font-sans text-xs font-bold">
        ⏳ Memuat Pengaturan Aturan & Data Agregat Kantor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-slate-700 font-sans antialiased">
      {/* NAVBAR */}
      <div className="bg-gradient-to-r from-amber-800 to-orange-900 text-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="space-y-0.5">
            <h1 className="text-base font-black tracking-tight text-amber-50">SIMALI</h1>
            <p className="text-xs text-amber-200/80 font-medium">Pegawai: {profilUser?.nama_pengguna || profilUser?.email}</p>
          </div>
          <button onClick={logout} className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs shadow-xs transition-colors">Keluar</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-24 space-y-6">

        {/* TAB UTAMA & FILTER SNAPSHOT */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="flex flex-col sm:flex-row bg-stone-100 p-2 rounded-2xl shadow-inner gap-2 border border-stone-200/60 flex-1">
            <button 
              type="button" 
              onClick={() => setMainMasalahTab('ANOMALI')}
              className={`flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
                mainMasalahTab === 'ANOMALI' 
                  ? 'bg-amber-800 text-white border-b-4 border-amber-950 shadow-md transform scale-[1.02]' 
                  : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-stone-50 border border-stone-200 shadow-2xs'
              }`}
            >
              <span className="text-sm">⚠️</span>
              <span>KONFIRMASI ANOMALI</span>
              {mainMasalahTab !== 'ANOMALI' && (
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping"></span>
              )}
            </button>

            <button 
              type="button" 
              onClick={() => setMainMasalahTab('MISSING_VALUE')}
              className={`flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-wider ${
                mainMasalahTab === 'MISSING_VALUE' 
                  ? 'bg-orange-700 text-white border-b-4 border-orange-900 shadow-md transform scale-[1.02]' 
                  : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-stone-50 border border-stone-200 shadow-2xs'
              }`}
            >
              <span className="text-sm">🔍</span>
              <span>KONFIRMASI MISSING VALUE</span>
              {mainMasalahTab !== 'MISSING_VALUE' && (
                <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping"></span>
              )}
            </button>
          </div>

          {/* DROPDOWN FILTER SNAPSHOT TERBARU / RIWAYAT */}
          <div className="bg-white p-2 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 pl-2">📅 Tanggal Anomali:</span>
            <select
              value={selectedSnapshot}
              onChange={(e) => setSelectedSnapshot(e.target.value)}
              className="bg-stone-100 font-bold border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-amber-600 cursor-pointer"
            >
              <option value="terakhir">🌟 Anomali Terakhir ({availableSnapshots[0] ? formatTanggalIndo(availableSnapshots[0]) : '-'})</option>
              <option value="semua">📚 Semua Anomali (Akumulasi)</option>
              <optgroup label="-- Riwayat Snapshot Anomali --">
                {availableSnapshots.map(tgl => (
                  <option key={tgl} value={tgl}>
                    {formatTanggalIndo(tgl)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* WIDGET KPI GLOBAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
            <span className="text-stone-400 text-[10px] font-bold block uppercase tracking-wider">Total Anomali</span>
            <span className="text-2xl font-black text-slate-800 mt-1 block font-mono">{summaryMetrics.totalAnomali}</span>
            <span className="text-[10px] text-stone-500 font-medium mt-1 block">Sesuai kategori aktif</span>
          </div>

          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/50 shadow-2xs">
            <span className="text-amber-800/80 text-[10px] font-bold block uppercase tracking-wider">Sudah Konfirmasi Petugas</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-amber-700 font-mono">{summaryMetrics.sudahPcl}</span>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-sm font-mono">
                {hitungPersen(summaryMetrics.sudahPcl, summaryMetrics.totalAnomali)}
              </span>
            </div>
            <span className="text-[10px] text-amber-900/60 font-medium mt-1 block">Konfirmasi dari petugas</span>
          </div>

          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200/50 shadow-2xs">
            <span className="text-emerald-800/80 text-[10px] font-bold block uppercase tracking-wider">Sudah Tindak Lanjut Fasih</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-emerald-700 font-mono">{summaryMetrics.sudahFasih}</span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-sm font-mono">
                {hitungPersen(summaryMetrics.sudahFasih, summaryMetrics.totalAnomali)}
              </span>
            </div>
            <span className="text-[10px] text-emerald-900/60 font-medium mt-1 block">Selesai tindak lanjut fasih</span>
          </div>

          <div className="bg-orange-50 border-2 border-orange-400/80 p-4 rounded-xl shadow-xs">
            <span className="text-orange-900 text-[10px] font-black block uppercase tracking-wider animate-pulse">Belum Tindak Lanjut Fasih</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-3xl font-black text-orange-700 font-mono">{summaryMetrics.belumFasih}</span>
              <span className="text-xs font-black text-orange-955 bg-orange-200 px-1.5 py-0.5 rounded-sm font-mono">
                {hitungPersen(summaryMetrics.belumFasih, summaryMetrics.totalAnomali)}
              </span>
            </div>
            <span className="text-[10px] text-orange-900/70 font-medium mt-1 block">Belum tindak lanjut Fasih</span>
          </div>
        </div>

        {/* TABEL AGREGAT UTAMA */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-2xs overflow-hidden">
          <div className="p-4 bg-stone-50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
             
                        <div className="bg-white p-2 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 pl-2">📅 Tanggal Anomali:</span>
            <select
              value={selectedSnapshot}
              onChange={(e) => setSelectedSnapshot(e.target.value)}
              className="bg-stone-100 font-bold border border-stone-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-amber-600 cursor-pointer"
            >
              <option value="terakhir">🌟 Anomali Terakhir ({availableSnapshots[0] ? formatTanggalIndo(availableSnapshots[0]) : '-'})</option>
              <option value="semua">📚 Semua Anomali (Akumulasi)</option>
              <optgroup label="-- Riwayat Snapshot Anomali --">
                {availableSnapshots.map(tgl => (
                  <option key={tgl} value={tgl}>
                    {formatTanggalIndo(tgl)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
            </h2>
            
            <div className="flex flex-wrap items-center gap-2">
              <label className={`cursor-pointer inline-flex items-center gap-1.5 bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-600 shadow-3xs transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <span>📁 Impor Excel</span>
                <input type="file" accept=".xlsx, .xls" onChange={handlePilihFileExcel} className="hidden" disabled={uploading} />
              </label>
              <button onClick={fetchDataMonitoringKantor} className="bg-white border text-xs text-amber-800 font-bold px-3 py-1.5 rounded-lg hover:bg-stone-50 shadow-3xs">🔄 Segarkan Progres</button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-stone-200 shadow-2xs bg-white">
            <table className="w-full text-left border-collapse text-xs sm:text-sm table-fixed min-w-[900px]">
              <thead>
                <tr className="sticky top-0 z-20 bg-stone-100 text-slate-650 font-black border-b border-stone-200 text-[10px] uppercase tracking-wider shadow-2xs">
                  <th className="p-3.5 pl-6 w-[40%]">Struktur Wilayah / Deskripsi Masalah</th>
                  <th className="p-3.5 text-center w-[8%]">Kode</th>
                  <th className="p-3.5 text-center w-[8%]">Total Anomali</th>
                  <th className="p-3.5 text-center w-[22%] bg-amber-50/20">Progres Konfirmasi Petugas</th>
                  <th className="p-3.5 text-center w-[22%] bg-emerald-50/20 border-l border-stone-200">Progres Konfirmasi Fasih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-150 select-none">
                {treeData.map(kec => {
                  const isKecOpen = !!expandedKec[kec.namaKec];
                  let kecTotal = 0, kecSudahPcl = 0, kecBelumPcl = 0, kecSudahF = 0, kecBelumF = 0;

                  kec.snapshotList.forEach(s => {
                    s.pmlList.forEach(p => {
                      p.kodeList.forEach(c => {
                        kecTotal += c.total; 
                        kecSudahPcl += c.sudahPcl; 
                        kecBelumPcl += c.belumPcl;
                        kecSudahF += c.sudahFasih; 
                        kecBelumF += c.belumFasih;
                      });
                    });
                  });

                  const persenPcl = kecTotal > 0 ? (kecSudahPcl / kecTotal) * 100 : 0;
                  const persenFasih = kecTotal > 0 ? (kecSudahF / kecTotal) * 100 : 0;

                  const warnaTermal = (persen) => {
                    if (persen < 50) return 'from-rose-500 to-red-600';
                    if (persen < 80) return 'from-amber-400 to-yellow-500';
                    return 'from-emerald-400 to-green-600';
                  };

                  return (
                    <React.Fragment key={kec.kodeKec}>
                      {/* 🗺️ LEVEL 1: BARIS KECAMATAN */}
                      <tr 
                        onClick={() => toggleExpandKec(kec.namaKec)} 
                        className={`hover:bg-amber-50/40 text-slate-900 font-extrabold cursor-pointer transition-colors border-b border-stone-200 ${
                          isKecOpen ? 'bg-amber-50/20 border-l-[4px] border-l-amber-700' : 'bg-white border-l-[4px] border-l-stone-300'
                        }`}
                      >
                        <td className="p-3.5 pl-3 flex items-center gap-2">
                          <span className={`text-[9px] font-mono w-4 text-center ${isKecOpen ? 'text-amber-800' : 'text-stone-400'}`}>
                            {isKecOpen ? '▼' : '▶'}
                          </span>
                          <span className="tracking-tight text-xs uppercase font-black">
                            🗺️ [{kec.kodeKec}] KEC. {kec.namaKec}
                          </span>
                        </td>
                        <td className="p-3.5 text-center text-stone-300 font-mono text-xs">-</td>
                        <td className="p-3.5 text-center font-mono font-black text-slate-800">{kecTotal}</td>
                        
                        {/* KANTONG PROGRES PCL */}
                        <td className="p-3 bg-amber-50/5">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-stone-100 h-2.5 rounded-full overflow-hidden p-[1px] shadow-xs">
                              <div className={`h-full rounded-full bg-gradient-to-r ${warnaTermal(persenPcl)}`} style={{ width: `${persenPcl}%` }}></div>
                            </div>
                            <span className="font-mono text-[11px] w-12 text-right text-amber-950 font-bold">{persenPcl.toFixed(0)}%</span>
                          </div>
                        </td>
                        
                        {/* KANTONG PROGRES FASIH */}
                        <td className="p-3 bg-emerald-50/5 border-l border-stone-200/80">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-stone-100 h-2.5 rounded-full overflow-hidden p-[1px] shadow-xs">
                              <div className={`h-full rounded-full bg-gradient-to-r ${warnaTermal(persenFasih)}`} style={{ width: `${persenFasih}%` }}></div>
                            </div>
                            <span className="font-mono text-[11px] w-12 text-right text-emerald-955 font-bold">{persenFasih.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>

                      {/* 📅 LEVEL 2: SNAPSHOT */}
                      {isKecOpen && kec.snapshotList.map(snap => {
                        const snapKey = `${kec.kodeKec}_${snap.tglSnapshot}`;
                        const isSnapOpen = !!expandedSnap[snapKey];

                        let snapTotal = 0, snapSudahPcl = 0, snapSudahF = 0;
                        snap.pmlList.forEach(p => {
                          p.kodeList.forEach(c => {
                            snapTotal += c.total; 
                            snapSudahPcl += c.sudahPcl; 
                            snapSudahF += c.sudahFasih;
                          });
                        });

                        return (
                          <React.Fragment key={snap.tglSnapshot}>
                            <tr 
                              onClick={() => toggleExpandSnap(kec.kodeKec, snap.tglSnapshot)} 
                              className="bg-stone-100/60 hover:bg-stone-100 text-slate-700 border-b border-stone-200/60 text-xs cursor-pointer transition-colors"
                            >
                              <td className="p-2.5 pl-10 border-l-[3px] border-l-stone-400/80 font-semibold flex items-center gap-1.5">
                                <span className="text-stone-400 text-[8px] w-3 text-center">{isSnapOpen ? '▼' : '▶'}</span>
                                <span className="text-stone-600">📅 Snapshot: {formatTanggalIndo(snap.tglSnapshot)}</span>
                              </td>
                              <td className="p-2.5 text-center text-stone-300">-</td>
                              <td className="p-2.5 text-center font-mono text-stone-600">{snapTotal}</td>
                              <td className="p-2.5 text-center font-mono text-amber-700 font-bold bg-amber-50/5">Sudah Konf Petugas: {snapSudahPcl}</td>
                              <td className="p-2.5 text-center font-mono text-emerald-700 font-bold bg-emerald-50/5 border-l border-stone-200/40">Sudah Konf Fasih: {snapSudahF}</td>
                            </tr>

                            {/* 👔 LEVEL 3: PML / PENGAWAS */}
                            {isSnapOpen && snap.pmlList.map(pml => (
                              <React.Fragment key={pml.namaPml}>
                                <tr className="bg-white/80 text-slate-600 border-b border-stone-100 text-xs font-medium">
                                  <td className="p-2 pl-16 border-l-[3px] border-l-stone-300/60 flex items-center gap-2">
                                    <span className="text-slate-400">👔</span>
                                    <span>PML: <strong className="text-slate-800 font-bold">{pml.namaPml}</strong></span>
                                  </td>
                                  <td colSpan="4" className="p-2 text-stone-400 font-mono text-[10px] italic pl-4">{pml.emailPml}</td>
                                </tr>

                                {/* ⚠️ LEVEL 4: ANOMALI DATA */}
                                {pml.kodeList.map(item => {
                                  const adaAntreanFasih = item.belumFasih > 0;
                                  return (
                                    <tr
                                      key={item.kode}
                                      onClick={() => handleBukaModalDetail(item, kec.namaKec)}
                                      className={`text-xs border-b border-stone-100 transition-colors cursor-pointer ${
                                        adaAntreanFasih 
                                          ? 'bg-orange-50/40 hover:bg-orange-50 border-l-[3px] border-l-orange-500 font-medium' 
                                          : 'hover:bg-stone-50/60 text-slate-500'
                                      }`}
                                    >
                                      <td className="p-2.5 pl-24 font-normal truncate flex items-center gap-2">
                                        {adaAntreanFasih && (
                                          <span className="bg-orange-600 text-white font-black text-[7px] px-1 rounded-xs tracking-wider uppercase shrink-0">BUTUH VERIFIKASI</span>
                                        )}
                                        <span className={adaAntreanFasih ? 'font-semibold text-slate-900' : ''}>
                                          {getInfoAnomali(item.kode, 'deskripsi')}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-center">
                                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${adaAntreanFasih ? 'bg-orange-100 text-orange-900' : 'bg-stone-100 text-stone-600'}`}>{item.kode}</span>
                                      </td>
                                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">{item.total}</td>
                                      
                                      {/* TARGET KOLOM DATA SEBARAN PCL */}
                                      <td className="p-2.5 font-mono text-center text-slate-600 bg-amber-50/5">
                                        <span className="text-amber-700 font-semibold">{item.sudahPcl}</span>
                                        <span className="text-stone-300 mx-1">/</span>
                                        {item.belumPcl > 0 ? (
                                          <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.5 rounded-sm tracking-wide">
                                            Belum: {item.belumPcl}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-stone-400 font-normal italic">
                                            Selesai
                                          </span>
                                        )}
                                      </td>
                                      
                                      {/* TARGET KOLOM DATA SEBARAN FASIH */}
                                      <td className={`p-2.5 font-mono text-center bg-emerald-50/5 border-l border-stone-200/40 ${adaAntreanFasih ? 'bg-orange-50/20' : ''}`}>
                                        <span className="text-emerald-700 font-semibold">{item.sudahFasih}</span>
                                        <span className="text-stone-300 mx-1">/</span>
                                        <span className={`text-[10px] ${adaAntreanFasih ? 'text-orange-600 font-bold bg-orange-100/50 px-1 rounded' : 'text-stone-400'}`}>
                                          {adaAntreanFasih ? `⚠️ Antrean: ${item.belumFasih}` : '0'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL PROSES & REVIEW IMPOR EXCEL CERDAS */}
      {modalUploadReview && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className={`bg-white w-full rounded-2xl border border-stone-200 p-6 shadow-2xl space-y-5 animate-scale-up transition-all ${uploadProgressStatus === 'review_rows' ? 'max-w-4xl' : 'max-w-md'}`}>
            
            <div className="flex items-center gap-2.5 text-amber-800 border-b pb-3">
              <span className="text-xl">📊</span>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                {uploadProgressStatus === 'review_rows' ? '🛠️ Validasi Dropdown Override Per Baris' : 'Manajer Snapshot Excel'}
              </h3>
            </div>

            {uploadProgressStatus === 'membaca' && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="bg-stone-50 border p-3.5 rounded-xl space-y-1 shadow-inner">
                  <span className="text-[10px] text-stone-400 block uppercase font-bold tracking-wider">File Terbaca:</span>
                  <p className="text-xs text-slate-700 font-medium">Total: <strong className="text-amber-800 font-mono text-sm font-black">{rawExcelData?.length || 0}</strong> baris data.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 block uppercase tracking-wide">📅 Tanggal Snapshot Data:</label>
                  <input 
                    type="date" 
                    value={pilihanTanggalSnapshot} 
                    onChange={(e) => setPilihanTanggalSnapshot(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-800 focus:outline-amber-600"
                  />
                </div>

                <div className="border-t pt-2">
                  <span className="text-[10px] font-black text-amber-800 block uppercase tracking-wider mb-2">🔄 Pemetaan Kolom Berkas (Column Mapper):</span>
                  <p className="text-[11px] text-stone-500 mb-3">Sesuaikan kolom sistem (kiri) dengan nama kolom yang ada di dalam Excel Anda (kanan).</p>
                  
                  <div className="space-y-3">
                    {[
                      { label: '🆔 ID Assignment / Dokumen *', field: 'assignment_id' },
                      { label: '🧑 Nama Pengusaha / Kepala RT *', field: 'nama_subjek' },
                      { label: '⚠️ Nama / Deskripsi Anomali *', field: 'nama_anomali' },
                      { label: '📍 Kode Desa (10 Digit)', field: 'kodedesa' },
                      { label: '🗺️ Kode SLS (4 Digit)', field: 'sls' },
                      { label: '🌿 Kode Sub-SLS (2 Digit)', field: 'subsls' },
                      { label: '🔗 Tautan Dokumen FASIH', field: 'link_fasih' },
                    ].map((item) => (
                      <div key={item.field} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-stone-50 p-2 rounded-lg border border-stone-200">
                        <label className="text-xs font-semibold text-slate-700 w-full sm:w-[45%]">{item.label}</label>
                        <select
                          value={columnMap[item.field]}
                          onChange={(e) => setColumnMap(prev => ({ ...prev, [item.field]: e.target.value }))}
                          className="w-full sm:w-[53%] bg-white border rounded p-1.5 text-xs text-slate-800 font-medium focus:ring-1 focus:ring-amber-600 outline-none"
                        >
                          <option value="">-- Lewati / Tidak Ada --</option>
                          {excelHeaders.map(headerName => (
                            <option key={headerName} value={headerName}>{headerName}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t text-xs font-bold sticky bottom-0 bg-white py-2">
                  <button 
                    type="button" 
                    onClick={() => { setModalUploadReview(false); setUploading(false); }} 
                    className="bg-stone-100 hover:bg-stone-200 text-slate-700 px-4 py-2 rounded-xl border"
                  >
                    Batal
                  </button>
                  <button 
                    type="button" 
                    onClick={handleProsesReviewBarisData} 
                    className="bg-amber-700 hover:bg-amber-600 text-white px-5 py-2 rounded-xl shadow-md shadow-amber-900/20"
                  >
                    Lanjut Tinjau Baris ➡️
                  </button>
                </div>
              </div>
            )}

            {uploadProgressStatus === 'review_rows' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 font-medium">
                  💡 <strong>Informasi:</strong> Di bawah ini adalah daftar baris berkas Excel Anda. Sistem menandai anomali yang tidak lolos aturan otomatis dengan kode <span className="bg-red-200 text-red-900 font-bold px-1 rounded">ERR</span>. Anda diwajibkan memilih manual melalui dropdown sebelum sinkronisasi dijalankan.
                </div>

                <div className="overflow-x-auto border rounded-xl max-h-[50vh] bg-stone-50 shadow-inner">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-200 text-slate-700 font-bold border-b sticky top-0 z-10">
                        <th className="p-2.5 w-[5%] text-center">No</th>
                        <th className="p-2.5 w-[25%]">Nama Responden / Subjek</th>
                        <th className="p-2.5 w-[40%] bg-amber-100/30">
                          Teks Kolom Excel Asli (<span className="underline italic">{columnMap.nama_anomali}</span>)
                        </th>
                        <th className="p-2.5 w-[30%]">Aturan / Kode Dipetakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 bg-white">
                      {mappedRowItems.map((item, idx) => {
                        const isErr = item.kode_anomali === 'ERR';
                        return (
                          <tr key={item.id_lokal} className={`hover:bg-stone-50/70 transition-colors ${isErr ? 'bg-red-50/40' : ''}`}>
                            <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-900">
                              {item.nama_subjek}
                              <span className="block text-[10px] font-mono text-stone-400 font-medium">ID: {item.assignment_id}</span>
                            </td>
                            <td className="p-2.5 italic text-slate-700 font-medium bg-amber-50/10 leading-relaxed">
                              "{item.teks_anomali_asli}"
                            </td>
                            <td className="p-2.5">
                              <select
                                value={item.kode_anomali}
                                onChange={(e) => handleUbahKodeBarisManual(item.id_lokal, e.target.value)}
                                className={`w-full p-2 border rounded-md text-xs font-medium focus:ring-1 outline-none transition-all ${isErr ? 'bg-red-100 border-red-300 text-red-900 font-black animate-pulse focus:ring-red-500' : 'bg-white border-stone-300 text-slate-800 focus:ring-amber-600'}`}
                              >
                                <option value="ERR" disabled>❌ -- KODE TIDAK TERDETEKSI (ERR) --</option>
                                {masterAnomali.map((rules) => (
                                  <option key={rules.kode} value={rules.kode}>
                                    [{rules.kode}] {rules.deskripsi}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center pt-3 border-t text-xs font-bold bg-white">
                  <button 
                    type="button" 
                    onClick={() => setUploadProgressStatus('membaca')} 
                    className="bg-stone-100 hover:bg-stone-200 text-slate-700 px-4 py-2 rounded-xl border"
                  >
                    ⬅️ Kembali Ke Column Map
                  </button>
                  <button 
                    type="button" 
                    onClick={handleEksekusiUploadKeDatabase} 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl shadow-md shadow-emerald-900/20 flex items-center gap-1.5"
                  >
                    🚀 Eksekusi & Simpan Ke Database
                  </button>
                </div>
              </div>
            )}

            {uploadProgressStatus === 'mengirim' && (
              <div className="py-8 flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-amber-700/20 border-t-amber-700 rounded-full animate-spin"></div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-black text-slate-800 tracking-wide animate-pulse">Menghubungkan ke Database...</p>
                  <p className="text-[10px] text-stone-400 font-medium">Memproses pencocokan data historis untuk mendeteksi anomali berulang.</p>
                </div>
              </div>
            )}

            {uploadProgressStatus === 'selesai' && hasilUploadRingkasan && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl shadow-3xs">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block tracking-wide">Sukses Terproses</span>
                    <span className="text-2xl font-black text-emerald-700 font-mono block mt-1">{hasilUploadRingkasan.sukses}</span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl shadow-3xs">
                    <span className="text-[10px] text-rose-800 font-bold uppercase block tracking-wide">Gagal / Format Error</span>
                    <span className="text-2xl font-black text-rose-700 font-mono block mt-1">{hasilUploadRingkasan.gagal}</span>
                  </div>
                </div>

                <blockquote className="bg-stone-50 border-l-4 border-amber-600 p-3 rounded text-[11px] leading-relaxed font-medium text-slate-600">
                  Sinkronisasi snapshot tanggal <span className="font-bold text-slate-900 font-mono">{formatTanggalIndo(pilihanTanggalSnapshot)}</span> selesai. Grafik rekap anomali wilayah telah dimutakhirkan.
                </blockquote>

                <div className="flex justify-end pt-2 border-t text-xs font-bold">
                  <button 
                    type="button" 
                    onClick={() => { setModalUploadReview(false); setUploading(false); }} 
                    className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-xl shadow-sm"
                  >
                    Selesai & Tutup Jendela
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL DETAIL SUBJEK & SINKRONISASI FASIH */}
      {modalDetailObj && (
        <div className="fixed inset-0 bg-slate-950/60 z-30 flex items-center justify-center p-6 animate-fade-in backdrop-blur-xs">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] border border-stone-200 animate-scale-up">
            
            <div className="p-5 bg-gradient-to-r from-stone-900 to-stone-800 text-stone-100 rounded-t-2xl flex justify-between items-center shadow-xs">
              <div className="space-y-1 w-[90%]">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Detail Status Tindak Lanjut</span>
                <h3 className="text-base font-extrabold text-white">Kecamatan {modalDetailObj.namaKec} • PML: {modalDetailObj.namaPml}</h3>
                <div className="text-xs text-stone-300 space-y-1">
                  <p>Kategori: <span className="bg-amber-500/20 text-amber-300 font-mono font-bold px-1.5 py-0.2 rounded border border-amber-500/30">[{modalDetailObj.kode}] {getInfoAnomali(modalDetailObj.kode, 'deskripsi')}</span></p>
                  <div className="bg-stone-950 text-stone-400 p-2.5 rounded border border-stone-700/60 font-sans mt-1.5 shadow-inner">
                    <strong className="text-stone-300 text-[10px] block uppercase tracking-wider mb-0.5 font-bold">Keterangan / Validasi Teknis:</strong>
                    <span className="text-xs leading-relaxed text-stone-300">{getInfoAnomali(modalDetailObj.kode, 'aturan_teknis')}</span>
                  </div>
                </div>
              </div>
              <button onClick={handleTutupModal} className="bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white font-black text-sm p-2 rounded-full w-9 h-9 flex items-center justify-center transition-all">✕</button>
            </div>

            <div className="flex border-b border-stone-200 bg-stone-100 p-2 gap-2 sticky top-0 z-10">
              <button type="button" onClick={() => setSubjekFilterTab('siap_eksekusi')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${subjekFilterTab === 'siap_eksekusi' ? 'bg-orange-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-stone-50 border border-stone-200'}`}>
                ⚡ Siap Eksekusi FASIH <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subjekFilterTab === 'siap_eksekusi' ? 'bg-orange-800 text-orange-100' : 'bg-stone-200 text-slate-600'}`}>{jumlahSiapEksekusi}</span>
              </button>
              <button type="button" onClick={() => setSubjekFilterTab('semua')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${subjekFilterTab === 'semua' ? 'bg-slate-800 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-stone-50 border border-stone-200'}`}>
                📂 Semua Data <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subjekFilterTab === 'semua' ? 'bg-slate-950 text-slate-200' : 'bg-stone-200 text-slate-600'}`}>{jumlahSemua}</span>
              </button>
              <button type="button" onClick={() => setSubjekFilterTab('selesai')} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${subjekFilterTab === 'selesai' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-stone-50 border border-stone-200'}`}>
                ✔ Selesai FASIH <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${subjekFilterTab === 'selesai' ? 'bg-emerald-800 text-emerald-100' : 'bg-stone-200 text-slate-600'}`}>{jumlahSelesai}</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-stone-50/50 space-y-4 flex-1">
              {loadingModal ? (
                <div className="text-center py-16 text-xs font-bold text-stone-500 animate-pulse">
                  ⏳ Menarik data sampel detail subjek dari database (Meminimalkan Egress)...
                </div>
              ) : subjekSiapTampil.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-stone-300">
                  <p className="text-stone-400 font-bold text-sm">
                    {subjekFilterTab === 'siap_eksekusi' ? '🎉 Luar biasa! Tidak ada antrean data yang siap dieksekusi di sini.' : 'Tidak ada data sampel yang sesuai dengan kriteria filter.'}
                  </p>
                </div>
              ) : (
                subjekSiapTampil.map(subjek => (
                  <div key={subjek.assignment_id} className="bg-white rounded-xl border border-stone-200 shadow-3xs overflow-hidden">
                    <div className="bg-gradient-to-r from-stone-700 to-stone-500 border-b border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="bg-white/10 text-stone-100 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-white/15 backdrop-blur-xs shadow-3xs">
                            🧑
                          </span>
                          <h4 className="font-black text-white text-sm sm:text-base tracking-tight drop-shadow-xs">
                            {subjek.nama_subjek}
                          </h4>
                          <span className="bg-stone-900/40 px-2 py-0.5 rounded font-mono font-bold text-amber-300 text-[11px] border border-stone-900/20">
                            ID: {subjek.assignment_id}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-200/90 font-medium">
                          <div className="flex items-center gap-3 flex-wrap opacity-95">
                            <p className="flex items-center gap-1">Desa: <span className="text-white font-extrabold">{subjek.nmdesa}</span></p>
                            <p className="text-stone-400/80 hidden sm:inline">•</p>
                            <p className="flex items-center gap-1">SLS: <span className="text-white font-extrabold">{subjek.nmsls}</span></p>
                            <p className="text-stone-400/80 hidden sm:inline">•</p>
                            <p className="flex items-center gap-1">PCL: <span className="text-white font-extrabold">{subjek.nama_pcl}</span></p>
                          </div>
                        </div>
                      </div>
                      {subjek.link_fasih && (
                        <a href={subjek.link_fasih.replace('/assignment-detail/', '/assignment/fd68e454-ba45-4b85-8205-f3bf777ded24/') + '/edit'} target="_blank" rel="noreferrer" className="bg-stone-800 hover:bg-stone-900 text-white font-bold text-center px-3 py-1.5 rounded-lg text-xs shadow-3xs transition-colors shrink-0">Buka Dokumen FASIH ↗</a>
                      )}
                    </div>

                    <div className="divide-y divide-stone-100">
                      {subjek.detailAnomali.map(anomali => {
                        const isSelesaiFasih = anomali.status_fasih === 'Sudah Tindak Lanjut FASIH';
                        const belumAdaKeteranganLapangan = !anomali.catatan_lapangan || anomali.status_konfirmasi === 'Belum Tindak Lanjut';
                        const IsSiapEksekusi = !isSelesaiFasih;
                        const isPemicuUtama = anomali.kode === modalDetailObj.kodePemicu;

                        const handleCopyTeks = (id, teks) => {
                          if (!teks) return;
                          navigator.clipboard.writeText(teks);
                          setCopiedId(id);
                          setTimeout(() => setCopiedId(null), 2000);
                        };

                        return (
                          <div 
                            key={anomali.anomali_id} 
                            className={`p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 transition-colors ${
                              isPemicuUtama 
                                ? 'bg-amber-50/70 border-l-4 border-l-amber-600 shadow-xs ring-1 ring-amber-500/20' 
                                : IsSiapEksekusi 
                                  ? 'bg-orange-50/30 border-l-4 border-l-orange-400' 
                                  : isSelesaiFasih 
                                    ? 'bg-emerald-50/10 opacity-60' 
                                    : 'bg-white'
                            }`}
                          >
                            <div className="flex-1 space-y-3">
                              {/* Baris Tag & Header Informasi Anomali */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-mono font-black px-2 py-0.5 rounded ${isSelesaiFasih ? 'bg-emerald-100 text-emerald-800 line-through' : 'bg-red-100 text-red-900'}`}>{anomali.kode}</span>
                                <span className="text-xs font-bold text-slate-700">{getInfoAnomali(anomali.kode, 'deskripsi')}</span>
                                
                                {isPemicuUtama ? (
                                  <span className="text-[9px] font-black bg-amber-700 text-white px-1.5 py-0.5 rounded shadow-3xs">TERPILIH</span>
                                ) : (
                                  <span className="text-[9px] font-black bg-stone-500 text-white px-1.5 py-0.5 rounded shadow-3xs">LAINNYA</span>
                                )}
                                
                                {anomali.status_konfirmasi === 'Sesuai Kondisi Lapangan' && <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200 shadow-3xs">🟢 Sesuai Lapangan</span>}
                                {anomali.status_konfirmasi === 'Perlu Perbaikan Data' && <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md border border-rose-200 shadow-3xs">🔴 Perlu Perbaikan</span>}
                                {IsSiapEksekusi && <span className="text-[9px] font-extrabold bg-amber-600 text-white px-1.5 py-0.5 rounded animate-pulse">SIAP VERIFIKASI</span>}
                              </div>

                              {/* 🗺️ AREA KANTOR & LAPANGAN BERTUMPUK */}
                              <div className="grid grid-cols-1 gap-2.5">
                                
                                {/* A. CATATAN LAPANGAN (Petugas Lapangan) */}
                                {anomali.catatan_lapangan ? (
                                  <div className="p-2.5 bg-white border border-stone-200 rounded-lg text-xs text-slate-600 leading-relaxed shadow-3xs space-y-2">
                                    <div className="flex justify-between items-center border-b border-stone-100 pb-1">
                                      <span className="font-bold text-amber-900 text-[10px] block uppercase tracking-wide">Alasan Lapangan ({anomali.kode}):</span>
                                      <button 
                                        type="button" 
                                        onClick={() => handleCopyTeks(anomali.anomali_id, anomali.catatan_lapangan)} 
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all active:scale-95 ${copiedId === anomali.anomali_id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border-stone-300'}`}
                                      >
                                        {copiedId === anomali.anomali_id ? '📋 Tersalin!' : '📄 Salin Catatan'}
                                      </button>
                                    </div>
                                    <div className="italic text-slate-700 font-medium">"{anomali.catatan_lapangan}"</div>
                                  </div>
                                ) : (
                                  <div className="p-2 bg-stone-50 rounded-lg border border-dashed border-stone-200 text-center">
                                    <p className="text-[11px] text-stone-400 font-semibold italic">⏳ Petugas lapangan belum memberikan alasan tindak lanjut.</p>
                                  </div>
                                )}

                                {/* B. CATATAN KANTOR (Evaluasi & Koreksi Pegawai - Inline Edit) */}
                                <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900 shadow-3xs space-y-1">
                                  <div className="flex justify-between items-center border-b border-sky-100 pb-1">
                                    <span className="font-bold text-sky-900 text-[10px] block uppercase tracking-wide">
                                      🏢 Penyesuaian Keterangan:
                                    </span>
                                    {editingCatatanId !== anomali.anomali_id ? (
                                      <button 
                                        type="button"
                                        onClick={() => { 
                                          setEditingCatatanId(anomali.anomali_id); 
                                          setEditValue(anomali.catatan_pegawai || ''); 
                                        }}
                                        className="text-[9px] font-extrabold text-sky-700 hover:text-sky-950 underline transition-colors"
                                      >
                                        {anomali.catatan_pegawai ? '✏️ Edit Catatan' : '➕ Tambah Catatan'}
                                      </button>
                                    ) : (
                                      <div className="flex gap-2 text-[9px] font-bold">
                                        <button type="button" onClick={() => setEditingCatatanId(null)} className="text-red-600 hover:underline">Batal</button>
                                        <button type="button" onClick={() => handleSaveCatatan(anomali.anomali_id)} className="text-emerald-700 hover:underline">Simpan</button>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {editingCatatanId === anomali.anomali_id ? (
                                    <textarea
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      placeholder="Tulis koreksi atau keterangan internal berkas di sini..."
                                      className="w-full p-2 rounded-md border border-sky-300 bg-white text-slate-800 text-xs focus:outline-sky-600 leading-normal mt-1 shadow-inner font-sans"
                                      rows="2"
                                    />
                                  ) : (
                                    <div className={`leading-relaxed font-sans mt-0.5 ${anomali.catatan_pegawai ? 'text-sky-950 font-medium' : 'text-sky-400/80 italic font-normal'}`}>
                                      {anomali.catatan_pegawai ? `"${anomali.catatan_pegawai}"` : 'Belum ada keterangan penyesuaian...'}
                                    </div>
                                  )}
                                </div>

                              </div>
                            </div>

                            <div className="shrink-0 flex items-center md:items-end flex-row md:flex-col justify-between md:justify-start gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelesaiFasih ? 'bg-emerald-100 text-emerald-800' : IsSiapEksekusi ? 'bg-amber-100 text-amber-900 font-extrabold' : 'bg-stone-100 text-stone-500'}`}>{isSelesaiFasih ? '✔ Selesai' : IsSiapEksekusi ? '⏳ Menunggu Anda' : '💤 Belum diisi'}</span>
                              {IsSiapEksekusi && (
                                <button 
                                  type="button" 
                                  disabled={updatingId === anomali.anomali_id} 
                                  onClick={() => setKonfirmasiId(anomali.anomali_id)} 
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs shadow-md transition-all active:scale-95"
                                >
                                  {updatingId === anomali.anomali_id ? 'Proses...' : '✔ Sudah FASIH'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-stone-100 border-t border-stone-200 rounded-b-2xl flex justify-end">
              <button onClick={handleTutupModal} className="bg-white border border-stone-300 hover:bg-stone-50 text-slate-700 font-bold px-5 py-2 rounded-xl text-xs shadow-3xs transition-colors">Tutup Jendela</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI PERSETUJUAN & INPUT CATATAN PEGAWAI KANTOR */}
      {konfirmasiId && (
        <div className="fixed inset-0 bg-slate-950/70 z-40 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-xl border border-stone-200 p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center gap-2.5 text-orange-600">
              <span className="text-xl">📝</span>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Verifikasi & Penyesuaian Keterangan</h4>
            </div>
            
            <div className="space-y-3 text-xs leading-relaxed text-slate-650 font-medium">
              <p>Apakah Anda sudah memeriksa aplikasi pusat FASIH dan setuju menandai data ini sebagai <strong className="text-emerald-700 font-bold">"Sudah Tindak Lanjut FASIH"</strong>?</p>
              
              {/* KOLOM INPUT CATATAN EVALUASI PEGAWAI */}
              <div className="space-y-1 bg-stone-50 p-3 rounded-lg border border-stone-200">
                <label className="text-[10px] font-black text-slate-600 block uppercase tracking-wide">
                  🖋️ Penyesuaian Keterangan / Catatan Pegawai (Opsional):
                </label>
                <textarea
                  rows="3"
                  value={catatanPegawaiInput}
                  onChange={(e) => setCatatanPegawaiInput(e.target.value)}
                  placeholder="Contoh: Dokumen sudah diperbaiki di FASIH, jumlah muatan disesuaikan dari 10 menjadi 2 sesuai blok IV..."
                  className="w-full bg-white border border-stone-300 rounded-md p-2 text-xs text-slate-800 focus:outline-amber-600 font-sans leading-normal placeholder-stone-400"
                />
                <span className="text-[9px] text-stone-400 font-normal block">
                  *Tulis catatan di sini jika konfirmasi petugas lapangan kurang sesuai/butuh koreksi tambahan.
                </span>
              </div>

              <blockquote className="bg-orange-50 border-l-2 border-orange-400 p-2 rounded text-[11px] font-semibold text-orange-950 italic">
                Penting: Pastikan isian entri data pada sistem FASIH benar-benar telah diselaraskan sebelum disubmit.
              </blockquote>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setKonfirmasiId(null);
                  setCatatanPegawaiInput('');
                }}
                className="bg-stone-100 hover:bg-stone-200 text-slate-700 px-4 py-2 rounded-lg transition-colors border"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSimpanFasihTunggal(konfirmasiId)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1"
              >
                🚀 Simpan & Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}