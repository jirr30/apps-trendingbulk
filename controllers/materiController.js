const MateriLatihan = require('../models/MateriLatihan');

const KATEGORI_LIST = ['Teknik', 'Fisik', 'Taktik', 'Mental', 'Sparring', 'Lainnya'];

exports.getDashboard = async (req, res) => {
    try {
        const materi = await MateriLatihan.find()
            .populate('createdBy', 'username')
            .sort({ kategori: 1, nama: 1 });

        const grouped = {};
        KATEGORI_LIST.forEach(k => { grouped[k] = []; });
        materi.forEach(m => { if (grouped[m.kategori]) grouped[m.kategori].push(m); });

        res.render('admin_materi_latihan', {
            pageTitle: 'Materi Latihan',
            materi,
            grouped,
            kategoriList: KATEGORI_LIST,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Gagal memuat materi latihan.');
    }
};

exports.saveMateri = async (req, res) => {
    try {
        const { nama, kategori, deskripsi, durasi } = req.body;
        await MateriLatihan.create({
            nama, kategori,
            deskripsi: deskripsi || '',
            durasi: durasi ? parseInt(durasi) : null,
            createdBy: req.session.userId
        });
        res.redirect('/admin/materi-latihan?success=Materi+berhasil+ditambahkan');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/materi-latihan?error=Gagal+menyimpan+materi');
    }
};

exports.deleteMateri = async (req, res) => {
    try {
        await MateriLatihan.findByIdAndDelete(req.params.id);
        res.redirect('/admin/materi-latihan?success=Materi+berhasil+dihapus');
    } catch (e) {
        res.redirect('/admin/materi-latihan?error=Gagal+menghapus+materi');
    }
};

exports.getMateriJson = async (req, res) => {
    try {
        const materi = await MateriLatihan.findById(req.params.id);
        if (!materi) return res.status(404).json({ error: 'Tidak ditemukan' });
        res.json(materi);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.updateMateri = async (req, res) => {
    try {
        const { nama, kategori, deskripsi, durasi } = req.body;
        await MateriLatihan.findByIdAndUpdate(req.params.id, {
            nama, kategori,
            deskripsi: deskripsi || '',
            durasi: durasi ? parseInt(durasi) : null
        });
        res.redirect('/admin/materi-latihan?success=Materi+berhasil+diperbarui');
    } catch (e) {
        res.redirect('/admin/materi-latihan?error=Gagal+memperbarui+materi');
    }
};
