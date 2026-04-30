const JadwalLatihan = require('../models/JadwalLatihan');

const URUTAN_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// 1. Tampilkan dashboard jadwal
exports.getDashboard = async (req, res) => {
    try {
        const jadwal = await JadwalLatihan.find()
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        // Kelompokkan per hari
        const grouped = {};
        URUTAN_HARI.forEach(h => { grouped[h] = []; });
        jadwal.forEach(j => {
            if (grouped[j.hari]) grouped[j.hari].push(j);
        });

        res.render('admin_jadwal_latihan', {
            pageTitle: 'Jadwal Latihan',
            jadwal,
            grouped,
            hariList: URUTAN_HARI,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Gagal memuat jadwal latihan.');
    }
};

// 2. Simpan jadwal baru
exports.saveJadwal = async (req, res) => {
    try {
        const { hari, waktu_mulai, waktu_selesai, materi, pelatih, tempat, keterangan } = req.body;
        await JadwalLatihan.create({
            hari, waktu_mulai, waktu_selesai, materi, pelatih, tempat,
            keterangan: keterangan || '',
            createdBy: req.session.userId
        });
        res.redirect('/admin/jadwal-latihan?success=Jadwal+berhasil+ditambahkan');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/jadwal-latihan?error=Gagal+menyimpan+jadwal');
    }
};

// 3. Hapus jadwal
exports.deleteJadwal = async (req, res) => {
    try {
        await JadwalLatihan.findByIdAndDelete(req.params.id);
        res.redirect('/admin/jadwal-latihan?success=Jadwal+berhasil+dihapus');
    } catch (e) {
        res.redirect('/admin/jadwal-latihan?error=Gagal+menghapus+jadwal');
    }
};

// 4. Halaman edit
exports.getEditPage = async (req, res) => {
    try {
        const jadwal = await JadwalLatihan.findById(req.params.id);
        if (!jadwal) return res.status(404).send('Tidak ditemukan.');
        res.render('admin_jadwal_latihan_edit', {
            jadwal,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName
        });
    } catch (e) {
        res.status(500).send('Gagal memuat data.');
    }
};

// 5. Get data JSON
exports.getJadwal = async (req, res) => {
    try {
        const jadwal = await JadwalLatihan.findById(req.params.id);
        if (!jadwal) return res.status(404).json({ error: 'Tidak ditemukan' });
        res.json(jadwal);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};

// 5. Update jadwal
exports.updateJadwal = async (req, res) => {
    try {
        const { hari, waktu_mulai, waktu_selesai, materi, pelatih, tempat, keterangan } = req.body;
        await JadwalLatihan.findByIdAndUpdate(req.params.id, {
            hari, waktu_mulai, waktu_selesai, materi, pelatih, tempat,
            keterangan: keterangan || ''
        });
        res.redirect('/admin/jadwal-latihan?success=Jadwal+berhasil+diperbarui');
    } catch (e) {
        res.redirect('/admin/jadwal-latihan?error=Gagal+memperbarui+jadwal');
    }
};
