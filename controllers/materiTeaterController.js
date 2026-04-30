const MateriTeater = require('../models/MateriTeater');
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
    },
    allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'player.vimeo.com']
};

const normalizeYoutube = (url) => {
    if (!url) return '';
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(\&v=)|(\/shorts\/))([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[9].length === 11) {
        return `https://www.youtube.com/embed/${match[9]}`;
    }
    return url;
};

// 1. Dashboard list
exports.getDashboard = async (req, res) => {
    try {
        const items = await MateriTeater.find()
            .populate('author', 'username')
            .sort({ createdAt: -1 });
        res.render('admin_materi_teater', {
            pageTitle: 'Materi Teater',
            items,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Gagal memuat materi teater.');
    }
};

// 2. Simpan
exports.save = async (req, res) => {
    try {
        const { title, content, videoUrl } = req.body;
        await MateriTeater.create({
            title,
            content: sanitizeHtml(content, sanitizeOptions),
            thumbnail: req.file ? `/uploads/${req.file.filename}` : '',
            videoUrl: normalizeYoutube(videoUrl),
            author: req.session.userId
        });
        res.redirect('/admin/materi-teater?success=Materi+berhasil+disimpan');
    } catch (e) {
        console.error(e);
        res.status(500).send('Gagal menyimpan materi teater.');
    }
};

// 3. Get edit page
exports.getEdit = async (req, res) => {
    try {
        const item = await MateriTeater.findById(req.params.id);
        if (!item) return res.status(404).send('Tidak ditemukan.');
        res.render('admin_materi_teater_edit', {
            item,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName
        });
    } catch (e) {
        res.status(500).send('Gagal memuat data.');
    }
};

// 4. Update
exports.update = async (req, res) => {
    try {
        const item = await MateriTeater.findById(req.params.id);
        if (!item) return res.status(404).send('Tidak ditemukan.');

        const { title, content, videoUrl } = req.body;
        const updateData = {
            title,
            content: sanitizeHtml(content, sanitizeOptions),
            videoUrl: normalizeYoutube(videoUrl)
        };

        if (req.file) {
            if (item.thumbnail) {
                const oldPath = path.join(__dirname, '../public', item.thumbnail);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) {}
                }
            }
            updateData.thumbnail = `/uploads/${req.file.filename}`;
        }

        await MateriTeater.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/admin/materi-teater?success=Materi+berhasil+diperbarui');
    } catch (e) {
        console.error(e);
        res.status(500).send('Gagal mengupdate materi teater.');
    }
};

// 5. Public detail
exports.getPublicDetail = async (req, res) => {
    try {
        const item = await MateriTeater.findById(req.params.id).populate('author', 'username');
        if (!item) return res.status(404).send('Tidak ditemukan.');
        res.render('public_materi_teater_detail', { item, userId: req.session.userId || null });
    } catch (e) {
        res.status(500).send('Kesalahan server.');
    }
};

// 6. Hapus
exports.delete = async (req, res) => {
    try {
        const item = await MateriTeater.findById(req.params.id);
        if (item && item.thumbnail) {
            const imgPath = path.join(__dirname, '../public', item.thumbnail);
            if (fs.existsSync(imgPath)) {
                try { fs.unlinkSync(imgPath); } catch (e) {}
            }
        }
        await MateriTeater.findByIdAndDelete(req.params.id);
        res.redirect('/admin/materi-teater?success=Materi+berhasil+dihapus');
    } catch (e) {
        res.status(500).send('Gagal menghapus materi teater.');
    }
};
