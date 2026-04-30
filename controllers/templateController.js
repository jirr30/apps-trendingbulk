const Template = require('../models/Template');
const Article = require('../models/Article');
const Gallery = require('../models/Gallery');
const Sejarah = require('../models/Sejarah');
const Pencapaian = require('../models/Pencapaian');
const Berita = require('../models/Berita');
const fs = require('fs');
const path = require('path');

/**
 * 0. HALAMAN PROFILE (semua templates)
 */
exports.getProfilePage = async (req, res) => {
    try {
        const [templates, heroPhotos, sejarah, pencapaianList] = await Promise.all([
            Template.find().populate('author', 'username').sort({ createdAt: -1 }),
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(10),
            Sejarah.findOne(),
            Pencapaian.find().sort({ tahun: -1, createdAt: -1 })
        ]);
        res.render('public_home', {
            templates,
            heroPhotos,
            sejarah,
            pencapaianList,
            page: 'templates',
            userId: req.session.userId
        });
    } catch (error) {
        console.error("Error pada Profile Page:", error);
        res.status(500).send("Terjadi kesalahan pada server.");
    }
};

/**
 * 1. TAMPILAN PUBLIK (HOME / DASHBOARD)
 */
exports.getPublicData = async (req, res) => {
    try {
        const [templates, articles, heroPhotos, sejarah, pencapaianList, beritaList, galeriList] = await Promise.all([
            Template.find().populate('author', 'username').sort({ createdAt: -1 }).limit(4),
            Article.find().populate('author', 'username').sort({ createdAt: -1 }).limit(4),
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(10),
            Sejarah.findOne(),
            Pencapaian.find().sort({ tahun: -1, createdAt: -1 }).limit(3),
            Berita.find().populate('author', 'username').sort({ createdAt: -1 }).limit(3),
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(8)
        ]);
        res.render('public_dashboard', {
            templates,
            articles,
            heroPhotos,
            sejarah,
            pencapaianList,
            beritaList,
            galeriList,
            page: 'home',
            userId: req.session.userId
        });
    } catch (error) {
        console.error("Error pada Public View:", error);
        res.status(500).send("Terjadi kesalahan pada server.");
    }
};

/**
 * 2. DASHBOARD ADMIN
 * FIX: Mengarahkan ke 'index' untuk menghindari error "Failed to lookup view dashboard"
 */
exports.getAllData = async (req, res) => {
    try {
        const userId = req.session.userId;
        const userRole = req.session.role;

        if (!userId) return res.redirect('/login');

        // Filter: Admin & Superadmin lihat semua, User lihat milik sendiri
        let filter = { author: userId };
        if (userRole === 'admin' || userRole === 'superadmin') {
            filter = {};
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // 6 bulan ke belakang untuk chart
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [templates, articles, beritaAll, galeriCount, beritaTotal,
               recentArticlesChart, recentBeritaChart] = await Promise.all([
            Template.find(filter).populate('author', 'username').sort({ createdAt: -1 }),
            Article.find(filter).populate('author', 'username').sort({ createdAt: -1 }),
            Berita.find({}).sort({ createdAt: -1 }).limit(5),
            Gallery.countDocuments(),
            Berita.countDocuments(),
            Article.find({ ...filter, createdAt: { $gte: sixMonthsAgo } }).select('createdAt'),
            Berita.find({ createdAt: { $gte: sixMonthsAgo } }).select('createdAt')
        ]);

        // Build chart data 6 bulan
        const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear(), m = d.getMonth();
            chartData.push({
                label: BULAN[m],
                articles: recentArticlesChart.filter(a => a.createdAt.getFullYear() === y && a.createdAt.getMonth() === m).length,
                berita: recentBeritaChart.filter(b => b.createdAt.getFullYear() === y && b.createdAt.getMonth() === m).length
            });
        }

        const stats = {
            templates: templates.length,
            articles: articles.length,
            berita: beritaTotal,
            galeri: galeriCount,
            totalKonten: templates.length + articles.length + beritaTotal,
            articlesThisMonth: articles.filter(a => a.createdAt >= startOfMonth).length,
            beritaThisMonth: recentBeritaChart.filter(b => b.createdAt >= startOfMonth).length,
        };

        res.render('index', {
            templates,
            articles,
            recentBerita: beritaAll,
            stats,
            chartData,
            userName: req.session.userName,
            role: userRole,
            userId: userId,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error("Error pada Dashboard View:", error);
        res.status(500).send("Internal Server Error: Gagal memuat dashboard.");
    }
};

/**
 * 3. PROSES UPLOAD DATA (TEMPLATE)
 */
exports.uploadData = async (req, res) => {
    try {
        const { title, description, labelKarya, labelProduksi } = req.body;
        if (!req.file) return res.status(400).send("Gambar wajib diunggah.");

        const newTemplate = new Template({
            title,
            description,
            imageUrl: `/uploads/${req.file.filename}`,
            labelKarya: labelKarya || '',
            labelProduksi: labelProduksi || '',
            author: req.session.userId
        });

        await newTemplate.save();
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).send("Gagal mengunggah data.");
    }
};

/**
 * 4. TAMPILAN EDIT TEMPLATE
 */
exports.getEditTemplate = async (req, res) => {
    try {
        const item = await Template.findById(req.params.id);
        
        // Proteksi: Cek kepemilikan atau role admin
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send("Akses Ditolak: Anda tidak memiliki izin.");
        }

        res.render('admin_template_edit', { item });
    } catch (error) {
        res.status(500).send("Gagal memuat form edit.");
    }
};

/**
 * 5. PROSES UPDATE TEMPLATE
 */
exports.updateTemplate = async (req, res) => {
    try {
        const item = await Template.findById(req.params.id);
        
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send("Update Ditolak!");
        }

        const { title, description, labelKarya, labelProduksi, metaTitle, metaDescription, metaKeywords, slug } = req.body;
        const updateData = {
            title, description,
            labelKarya:      labelKarya      || '',
            labelProduksi:   labelProduksi   || '',
            metaTitle:       (metaTitle       || '').trim(),
            metaDescription: (metaDescription || '').trim(),
            metaKeywords:    (metaKeywords    || '').trim(),
            slug:            (slug            || '').trim() || title.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').substring(0,80)
        };

        if (req.file) {
            // Hapus file lama jika ada upload baru
            if (item.imageUrl) {
                const oldPath = path.join(__dirname, '../public', item.imageUrl);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) { console.error("Gagal hapus file lama:", e); }
                }
            }
            updateData.imageUrl = `/uploads/${req.file.filename}`;
        }

        await Template.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send("Gagal memperbarui data.");
    }
};

/**
 * 6. PROSES HAPUS DATA
 */
exports.deleteData = async (req, res) => {
    try {
        const item = await Template.findById(req.params.id);
        
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send("Hapus Ditolak!");
        }

        // Hapus aset fisik dari storage
        if (item.imageUrl) {
            const imagePath = path.join(__dirname, '../public', item.imageUrl);
            if (fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) { console.error("Gagal hapus file:", e); }
            }
        }

        await Template.findByIdAndDelete(req.params.id);
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).send("Gagal menghapus data.");
    }
};

/**
 * 7. TAMPILAN DETAIL TEMPLATE (PUBLIK)
 */
exports.getDetailData = async (req, res) => {
    try {
        const item = await Template.findById(req.params.id).populate('author', 'username');
        if (!item) return res.status(404).send("Data tidak ditemukan.");
        
        res.render('public_detail', {
            item,
            page: 'templates',
            userId: req.session.userId
        });
    } catch (error) {
        res.status(500).send("Terjadi kesalahan saat memuat detail.");
    }
};
