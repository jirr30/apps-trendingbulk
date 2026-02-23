const Template = require('../models/Template');
const Article = require('../models/Article');
const fs = require('fs');
const path = require('path');

/**
 * 1. TAMPILAN PUBLIK (HOME)
 */
exports.getPublicData = async (req, res) => {
    try {
        const data = await Template.find()
            .populate('author', 'username')
            .sort({ createdAt: -1 });
        res.render('public_home', {
            templates: data,
            page: 'templates',
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

        // Filter: Admin lihat semua, User lihat milik sendiri
        let filter = { author: userId };
        if (userRole === 'admin') {
            filter = {};
        }

        const [templates, articles] = await Promise.all([
            Template.find(filter).populate('author', 'username').sort({ createdAt: -1 }),
            Article.find(filter).populate('author', 'username').sort({ createdAt: -1 })
        ]);

        // Merender index.ejs sesuai struktur folder views Anda
        res.render('index', {
            templates: templates,
            articles: articles,
            userName: req.session.userName,
            role: userRole,
            userId: userId
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
        const { title, description } = req.body;
        if (!req.file) return res.status(400).send("Gambar wajib diunggah.");

        const newTemplate = new Template({
            title,
            description,
            imageUrl: `/uploads/${req.file.filename}`,
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
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin')) {
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
        
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin')) {
            return res.status(403).send("Update Ditolak!");
        }

        const { title, description } = req.body;
        const updateData = { title, description };

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
        
        if (!item || (item.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin')) {
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
