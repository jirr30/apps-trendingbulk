const Article = require('../models/Article');
const JadwalLatihan = require('../models/JadwalLatihan');
const MateriLatihan = require('../models/MateriLatihan');
const MateriTeater = require('../models/MateriTeater');
const Gallery = require('../models/Gallery');
const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

// Konfigurasi Sanitize HTML agar mendukung elemen CKEditor & Video
const sanitizeOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img', 'iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote',
        'h1', 'h2', 'h3', 'span', 'figure', 'figcaption', 'strong', 'em', 'u', 'br', 'hr'
    ]),
    allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        'img': ['src', 'alt', 'width', 'height', 'style', 'class'],
        'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'class', 'style'],
        'table': ['class', 'style', 'cellspacing', 'cellpadding'],
        'td': ['style', 'class', 'colspan', 'rowspan'],
        'th': ['style', 'class', 'colspan', 'rowspan'],
        'span': ['style', 'class'],
        'p': ['style', 'class'],
        'div': ['style', 'class'],
        '*': ['style'] // Izinkan inline style untuk alignment dan warna teks dari CKEditor
    },
    // PERBAIKAN: Hostname harus murni domain tanpa protocol (http/https)
    allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'player.vimeo.com']
};

/**
 * Helper: Normalisasi URL YouTube ke format Embed
 * Mengubah URL watch?v= menjadi /embed/
 */
/**
 * Helper: Normalisasi URL YouTube (Mendukung Video Biasa & Shorts)
 */
const normalizeYoutube = (url) => {
    if (!url) return '';

    // Regex sakti untuk menangkap ID Video dari format:
    // - watch?v=ID
    // - youtube.com/shorts/ID
    // - youtu.be/ID
    // - youtube.com/embed/ID
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(\&v=)|(\/shorts\/))([^#\&\?]*).*/;
    const match = url.match(regExp);

    // ID YouTube selalu 11 karakter
    if (match && match[9].length === 11) {
        const videoId = match[9];
        return `https://www.youtube.com/embed/${videoId}`;
    }

    return url;
};



// 1. Simpan Artikel
function generateSlugArticle(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 80);
}

exports.saveArticle = async (req, res) => {
    try {
        const { title, content, videoUrl, karya, slug, metaTitle, metaDescription, metaKeywords, category, tags } = req.body;
        const cleanContent = sanitizeHtml(content, sanitizeOptions);

        const newArticle = new Article({
            title,
            content: cleanContent,
            thumbnail: req.file ? `/uploads/${req.file.filename}` : '',
            videoUrl: normalizeYoutube(videoUrl),
            karya: karya || '',
            author: req.session.userId,
            slug: (slug || '').trim() || generateSlugArticle(title),
            metaTitle:       (metaTitle || '').trim(),
            metaDescription: (metaDescription || '').trim(),
            metaKeywords:    (metaKeywords || '').trim(),
            category:        (category || '').trim(),
            tags:            (tags || '').trim()
        });

        await newArticle.save();
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).send("Gagal menyimpan artikel.");
    }
};

// 2. List Publik (Dengan Fitur Search + Pagination)
exports.getPublicArticles = async (req, res) => {
    try {
        const searchQuery = req.query.q || '';
        const LIMIT = 9;
        const currentPage = Math.max(1, parseInt(req.query.page) || 1);
        const skip = (currentPage - 1) * LIMIT;

        let query = {};
        if (searchQuery) {
            query = {
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { content: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }

        const URUTAN_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

        const [totalArticles, articles, jadwalList, materiLatihan, materiTeater, heroPhotos] = await Promise.all([
            Article.countDocuments(query),
            Article.find(query).populate('author', 'username').sort({ createdAt: -1 }).skip(skip).limit(LIMIT),
            JadwalLatihan.find().sort({ hari: 1 }),
            MateriLatihan.find().sort({ kategori: 1, nama: 1 }),
            MateriTeater.find().sort({ createdAt: -1 }),
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(10)
        ]);

        const totalPages = Math.ceil(totalArticles / LIMIT);

        const jadwalGrouped = {};
        URUTAN_HARI.forEach(h => { jadwalGrouped[h] = []; });
        jadwalList.forEach(j => { if (jadwalGrouped[j.hari]) jadwalGrouped[j.hari].push(j); });

        res.render('public_articles', {
            articles,
            heroPhotos,
            page: 'articles',
            userId: req.session.userId || null,
            searchQuery,
            jadwalGrouped,
            hariList: URUTAN_HARI,
            materiLatihan,
            materiTeater,
            currentPage,
            totalPages,
            totalArticles
        });
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).send("Gagal memuat artikel.");
    }
};

// 3. Detail Publik
exports.getArticleDetail = async (req, res) => {
    try {
        const article = await Article.findById(req.params.id).populate('author', 'username');
        if (!article) return res.status(404).send("Artikel tidak ditemukan.");

        res.render('public_article_detail', {
            item: article,
            page: 'articles',
            userId: req.session.userId || null
        });
    } catch (error) {
        res.status(500).send("Kesalahan server.");
    }
};

// 4. Edit View
exports.getEditArticle = async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) return res.status(404).send("Data tidak ditemukan.");

        // Proteksi: Hanya owner atau admin yang bisa edit
        if (article.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin') {
            return res.status(403).send("Akses Ditolak: Anda tidak memiliki izin mengedit artikel ini.");
        }

        res.render('admin_article_edit', { item: article });
    } catch (error) {
        res.status(500).send("Gagal memuat data.");
    }
};

// 5. Update Artikel
exports.updateArticle = async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article || (article.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send("Update Ditolak!");
        }

        const { title, content, videoUrl, karya, slug, metaTitle, metaDescription, metaKeywords, category, tags } = req.body;
        const updateData = {
            title,
            content: sanitizeHtml(content, sanitizeOptions),
            videoUrl: normalizeYoutube(videoUrl),
            karya: karya || '',
            slug: (slug || '').trim() || generateSlugArticle(title),
            metaTitle:       (metaTitle || '').trim(),
            metaDescription: (metaDescription || '').trim(),
            metaKeywords:    (metaKeywords || '').trim(),
            category:        (category || '').trim(),
            tags:            (tags || '').trim()
        };

        if (req.file) {
            // Hapus file thumbnail lama jika ada penggantian
            if (article.thumbnail) {
                const oldPath = path.join(__dirname, '../public', article.thumbnail);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch(e) { console.error("Gagal hapus file lama:", e); }
                }
            }
            updateData.thumbnail = `/uploads/${req.file.filename}`;
        }

        await Article.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send("Gagal mengupdate artikel.");
    }
};

// 6. Hapus Artikel
exports.deleteArticle = async (req, res) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article || (article.author.toString() !== req.session.userId.toString() && req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send("Hapus Ditolak!");
        }

        // Hapus file fisik thumbnail
        if (article.thumbnail) {
            const imgPath = path.join(__dirname, '../public', article.thumbnail);
            if (fs.existsSync(imgPath)) {
                try { fs.unlinkSync(imgPath); } catch(e) { console.error("Gagal hapus gambar:", e); }
            }
        }

        await Article.findByIdAndDelete(req.params.id);
        res.redirect('/dashboard');
    } catch (error) {
        res.status(500).send("Gagal menghapus artikel.");
    }
};

// 7. Upload Image CKEditor Handler
exports.uploadImage = (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            uploaded: false,
            error: { message: 'Gagal mengunggah file.' }
        });
    }

    // Kembalikan format JSON yang diminta CKEditor
    return res.status(200).json({
        uploaded: true,
        url: `/uploads/${req.file.filename}`
    });
};
