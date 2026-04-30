const Berita = require('../models/Berita');
const Gallery = require('../models/Gallery');
const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

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
        '*': ['style']
    }
};

// Halaman publik /berita — view only
exports.getPublicBerita = async (req, res) => {
    try {
        const LIMIT = 9;
        const currentPage = Math.max(1, parseInt(req.query.page) || 1);
        const skip = (currentPage - 1) * LIMIT;

        const [totalBerita, beritaList, heroPhotos] = await Promise.all([
            Berita.countDocuments(),
            Berita.find().populate('author', 'username').sort({ createdAt: -1 }).skip(skip).limit(LIMIT),
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(10)
        ]);

        const totalPages = Math.ceil(totalBerita / LIMIT);

        res.render('public_berita', {
            beritaList,
            heroPhotos,
            page: 'berita',
            currentPage,
            totalPages,
            totalBerita,
            userId: req.session?.userId || null
        });
    } catch (error) {
        console.error('Public Berita Error:', error);
        res.status(500).send('Gagal memuat halaman berita.');
    }
};

// Detail publik /berita/:slug — supports slug (canonical) and _id (backward-compat, 301 redirect)
exports.getPublicBeritaDetail = async (req, res) => {
    try {
        const param = req.params.slug;
        const isObjectId = /^[a-f\d]{24}$/i.test(param);
        let berita;

        if (isObjectId) {
            berita = await Berita.findById(param).populate('author', 'username');
            // If it has a slug, 301 redirect to canonical slug URL
            if (berita && berita.slug) {
                return res.redirect(301, `/berita/${berita.slug}`);
            }
        } else {
            berita = await Berita.findOne({ slug: param }).populate('author', 'username');
        }

        if (!berita) return res.status(404).send('Berita tidak ditemukan.');

        // Lazy-migrate: if found by _id but has no slug, generate one now
        if (isObjectId && !berita.slug) {
            berita.slug = await generateUniqueSlug(berita.title);
            await berita.save();
        }

        res.render('public_berita_detail', {
            berita,
            item: berita,
            page: 'berita',
            userId: req.session?.userId || null
        });
    } catch (error) {
        console.error('Detail Berita Error:', error);
        res.status(500).send('Gagal memuat berita.');
    }
};

// Dashboard kelola /admin/berita — dengan aksi
exports.getKelolaBerita = async (req, res) => {
    try {
        const userId   = req.session.userId;
        const userRole = req.session.role;

        let filter = { author: userId };
        if (userRole === 'admin' || userRole === 'superadmin') filter = {};

        const beritaList = await Berita.find(filter)
            .populate('author', 'username')
            .sort({ createdAt: -1 });

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const stats = {
            total        : beritaList.length,
            thisMonth    : beritaList.filter(b => b.createdAt >= startOfMonth).length,
            withThumbnail: beritaList.filter(b => b.thumbnail).length,
            withVideo    : beritaList.filter(b => b.videoUrl).length
        };

        res.render('admin_berita', {
            beritaList,
            stats,
            userName: req.session.userName,
            role: userRole,
            userId
        });
    } catch (error) {
        console.error('Kelola Berita Error:', error);
        res.status(500).send('Gagal memuat halaman kelola berita.');
    }
};

// Form tambah berita
exports.getAddBerita = (req, res) => {
    res.render('admin_berita_add', {
        sessionRole: req.session.role,
        sessionUserName: req.session.userName
    });
};

// Helper: generate base slug from title
function generateSlug(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

// Helper: generate unique slug (appends -2, -3 … if taken)
async function generateUniqueSlug(title, excludeId = null) {
    const base = generateSlug(title);
    let slug = base;
    let n = 2;
    while (true) {
        const query = { slug };
        if (excludeId) query._id = { $ne: excludeId };
        const exists = await Berita.findOne(query).select('_id').lean();
        if (!exists) break;
        slug = `${base}-${n++}`;
    }
    return slug;
}

// Simpan berita baru
exports.saveBerita = async (req, res) => {
    try {
        const { title, content, slug, metaTitle, metaDescription, metaKeywords, category, tags } = req.body;
        const cleanContent = sanitizeHtml(content, sanitizeOptions);
        const finalSlug = slug ? slug.trim() : await generateUniqueSlug(title);

        await Berita.create({
            title,
            content: cleanContent,
            thumbnail: req.file ? `/uploads/${req.file.filename}` : '',
            author: req.session.userId,
            slug:            finalSlug,
            metaTitle:       metaTitle || '',
            metaDescription: metaDescription || '',
            metaKeywords:    metaKeywords || '',
            category:        category || '',
            tags:            tags || ''
        });

        res.redirect('/admin/berita');
    } catch (error) {
        console.error('Save Berita Error:', error);
        res.status(500).send('Gagal menyimpan berita.');
    }
};

// Form edit berita
exports.getEditBerita = async (req, res) => {
    try {
        const berita = await Berita.findById(req.params.id);
        if (!berita) return res.status(404).send('Berita tidak ditemukan.');

        if (berita.author.toString() !== req.session.userId.toString() &&
            req.session.role !== 'admin' && req.session.role !== 'superadmin') {
            return res.status(403).send('Akses ditolak.');
        }

        res.render('admin_berita_edit', {
            item: berita,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName
        });
    } catch (error) {
        res.status(500).send('Gagal memuat form edit.');
    }
};

// Update berita
exports.updateBerita = async (req, res) => {
    try {
        const berita = await Berita.findById(req.params.id);
        if (!berita || (berita.author.toString() !== req.session.userId.toString() &&
            req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send('Update ditolak.');
        }

        const { title, content, slug, metaTitle, metaDescription, metaKeywords, category, tags } = req.body;
        const finalSlug = slug ? slug.trim() : await generateUniqueSlug(title, req.params.id);
        const updateData = {
            title,
            content: sanitizeHtml(content, sanitizeOptions),
            slug:            finalSlug,
            metaTitle:       metaTitle || '',
            metaDescription: metaDescription || '',
            metaKeywords:    metaKeywords || '',
            category:        category || '',
            tags:            tags || ''
        };

        if (req.file) {
            if (berita.thumbnail) {
                const oldPath = path.join(__dirname, '../public', berita.thumbnail);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) {}
                }
            }
            updateData.thumbnail = `/uploads/${req.file.filename}`;
        }

        await Berita.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/admin/berita');
    } catch (error) {
        console.error('Update Berita Error:', error);
        res.status(500).send('Gagal mengupdate berita.');
    }
};

// Hapus berita
exports.deleteBerita = async (req, res) => {
    try {
        const berita = await Berita.findById(req.params.id);
        if (!berita || (berita.author.toString() !== req.session.userId.toString() &&
            req.session.role !== 'admin' && req.session.role !== 'superadmin')) {
            return res.status(403).send('Hapus ditolak.');
        }

        if (berita.thumbnail) {
            const imgPath = path.join(__dirname, '../public', berita.thumbnail);
            if (fs.existsSync(imgPath)) {
                try { fs.unlinkSync(imgPath); } catch (e) {}
            }
        }

        await Berita.findByIdAndDelete(req.params.id);
        res.redirect('/admin/berita');
    } catch (error) {
        res.status(500).send('Gagal menghapus berita.');
    }
};
