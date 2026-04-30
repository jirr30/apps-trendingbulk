const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const upload = require('../config/multer');
const templateController = require('../controllers/templateController');
const articleController = require('../controllers/articleController');
const authController = require('../controllers/authController');
const superAdminController = require('../controllers/superAdminController');
const jadwalController = require('../controllers/jadwalController');
const materiController = require('../controllers/materiController');
const materiTeaterController = require('../controllers/materiTeaterController');
const beritaController = require('../controllers/beritaController');
const SocialMedia = require('../models/SocialMedia');
const Gallery = require('../models/Gallery');
const Sejarah = require('../models/Sejarah');
const Pencapaian = require('../models/Pencapaian');
const Sekretariat = require('../models/Sekretariat');
const SiteSetting = require('../models/SiteSetting');
const uploadGallery = require('../config/multerGallery');
const uploadLogo = require('../config/multerLogo');
const paymentController = require('../controllers/paymentController');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');

function faststartVideo(filePath) {
    return new Promise((resolve) => {
        const tmp = filePath + '_tmp.mp4';
        execFile('ffmpeg', ['-i', filePath, '-c', 'copy', '-movflags', 'faststart', tmp], (err) => {
            if (err) return resolve(); // jika gagal, biarkan file asli
            fs.rename(tmp, filePath, () => resolve());
        });
    });
}

// Generate thumbnail dari video (frame detik ke-1)
function generateVideoThumbnail(videoPath) {
    return new Promise((resolve) => {
        const dir = path.dirname(videoPath);
        const baseName = path.basename(videoPath, path.extname(videoPath));
        const thumbPath = path.join(dir, baseName + '_thumb.webp');
        execFile('ffmpeg', ['-i', videoPath, '-ss', '00:00:01', '-vframes', '1', '-vf', 'scale=640:-1', thumbPath], (err) => {
            if (err) return resolve(null);
            resolve(thumbPath);
        });
    });
}

// Kompresi foto: resize max 1920px, konversi ke WebP ~80% quality
async function compressPhoto(filePath) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const outPath = path.join(dir, baseName + '.webp');
    await sharp(filePath)
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outPath);
    fs.unlink(filePath, () => {}); // hapus file asli
    return outPath;
}

// Middlewares
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const memberAuth = require('../middleware/memberAuth');

// Rate Limiter: maks 10 percobaan login/register per 15 menit per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Terlalu banyak percobaan, coba lagi setelah 15 menit.',
    standardHeaders: true,
    legacyHeaders: false
});

// ==========================================
// 1. ROUTE PUBLIK (Akses Bebas)
// ==========================================
router.get('/', templateController.getPublicData);
router.get('/profile', templateController.getProfilePage);
router.get('/detail/:id', templateController.getDetailData);
router.get('/articles', articleController.getPublicArticles);
router.get('/article/:id', articleController.getArticleDetail);
router.get('/materi-teater/:id', materiTeaterController.getPublicDetail);

router.get('/galeri', async (req, res) => {
    try {
        const [fotos, videos] = await Promise.all([
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }),
            Gallery.find({ type: 'video' }).sort({ createdAt: -1 })
        ]);
        const heroPhotos = fotos.slice(0, 10);

        // Grouping foto berdasarkan deskripsi yang sama
        // Foto tanpa deskripsi (atau deskripsi unik) tetap tampil sendiri
        const groupMap = new Map();
        const fotoGroups = [];
        fotos.forEach(foto => {
            const key = foto.description ? foto.description.trim() : '';
            if (key) {
                if (!groupMap.has(key)) {
                    const group = { key, description: key, photos: [], createdAt: foto.createdAt };
                    groupMap.set(key, group);
                    fotoGroups.push(group);
                }
                groupMap.get(key).photos.push(foto);
            } else {
                fotoGroups.push({ key: null, description: '', photos: [foto], createdAt: foto.createdAt });
            }
        });

        res.render('public_galeri', {
            fotoGroups, videos, heroPhotos,
            userId: req.session?.userId,
            sessionRole: req.session?.role,
            sessionUserName: req.session?.userName
        });
    } catch (e) {
        res.status(500).send('Gagal memuat galeri.');
    }
});

router.get('/sekretariat', async (req, res) => {
    try {
        const [heroPhotos, sekretariat] = await Promise.all([
            Gallery.find({ type: 'foto' }).sort({ createdAt: -1 }).limit(10),
            Sekretariat.findOne()
        ]);
        res.render('public_sekretariat', {
            heroPhotos,
            sekretariat,
            page: 'sekretariat',
            userId: req.session?.userId
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman sekretariat.');
    }
});

// ==========================================
// 2. FITUR KHUSUS EDITOR (Upload Image)
// ==========================================
/** * FIX PASTE IMAGE:
 * Letakkan di atas agar tidak dianggap sebagai ID.
 * Jika masih gagal paste, hapus 'auth' sementara untuk bypass session leak MemoryStore.
 */
router.post('/upload-image', memberAuth, upload.single('upload'), articleController.uploadImage);

// ==========================================
// 3. ROUTE AUTENTIKASI
// ==========================================
router.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        if (req.session.role === 'superadmin') return res.redirect('/super-admin');
        if (req.session.role === 'admin') return res.redirect('/dashboard');
        return res.redirect('/');
    }
    res.render('login');
});
router.post('/login', authLimiter, authController.loginValidation, authController.postLogin);
router.get('/login/2fa',  authController.getTwoFactorVerify);
router.post('/login/2fa', authLimiter, authController.postTwoFactorVerify);
router.get('/register', authController.getRegister);
router.post('/register', authLimiter, authController.registerValidation, authController.postRegister);
router.get('/logout', authController.logout);

// Security settings (self-service: change password, manage 2FA)
router.get('/admin/security',                  auth, authController.getSecurityPage);
router.post('/admin/security/2fa/setup',       auth, authController.setup2FA);
router.post('/admin/security/2fa/enable',      auth, authController.enable2FA);
router.post('/admin/security/2fa/disable',     auth, authController.disable2FA);
router.post('/admin/security/password',        auth, authController.changePassword);

// ==========================================
// 4. ROUTE SUPER ADMIN
// ==========================================
router.get('/super-admin', auth, staffAuth, superAdminController.getGlobalDashboard);
router.post('/super-admin/settings/registration', auth, staffAuth, superAdminController.updateRegistrationSettings);
router.post('/super-admin/user/role/:id', auth, staffAuth, superAdminController.updateUserRole);
router.post('/super-admin/user/delete/:id', auth, staffAuth, superAdminController.deleteUser);

// ==========================================
// 5. ROUTE USER DASHBOARD (Personal Management)
// ==========================================
router.get('/dashboard', auth, memberAuth, templateController.getAllData);

// --- PRIVACY POLICY & TERMS ---
router.get('/privacy-policy', (req, res) => {
    res.render('privacy_policy');
});
router.get('/terms-of-service', (req, res) => {
    res.render('terms_of_service');
});

// --- BERITA (terpisah dari naskah/artikel) ---
router.get('/berita', beritaController.getPublicBerita);
router.get('/berita/:slug', beritaController.getPublicBeritaDetail);
router.get('/admin/berita', auth, memberAuth, beritaController.getKelolaBerita);
router.get('/admin/berita/add', auth, memberAuth, beritaController.getAddBerita);
router.post('/admin/berita/save', auth, memberAuth, upload.single('thumbnail'), beritaController.saveBerita);
router.get('/admin/berita/edit/:id', auth, memberAuth, beritaController.getEditBerita);
router.post('/admin/berita/update/:id', auth, memberAuth, upload.single('thumbnail'), beritaController.updateBerita);
router.post('/admin/berita/delete/:id', auth, memberAuth, beritaController.deleteBerita);

// --- ARTIKEL MANAGEMENT ---
router.get('/admin/article/add', auth, memberAuth, (req, res) => res.render('admin_article_add'));
router.post('/admin/article/save', auth, memberAuth, upload.single('thumbnail'), articleController.saveArticle);
router.get('/admin/article/edit/:id', auth, memberAuth, articleController.getEditArticle);

// Tambahkan rute update dan delete dengan metode POST agar sinkron dengan form EJS
router.post('/admin/article/update/:id', auth, memberAuth, upload.single('thumbnail'), articleController.updateArticle);
router.post('/admin/article/delete/:id', auth, memberAuth, articleController.deleteArticle);

// --- TEMPLATE MANAGEMENT ---
router.get('/upload', auth, staffAuth, (req, res) => res.render('upload'));
router.post('/upload', auth, staffAuth, upload.single('image'), templateController.uploadData);
router.get('/admin/template/edit/:id', auth, staffAuth, templateController.getEditTemplate);
router.post('/admin/template/update/:id', auth, staffAuth, upload.single('image'), templateController.updateTemplate);
router.post('/delete/:id', auth, staffAuth, templateController.deleteData);

// --- GALERI MANAGEMENT ---
router.get('/admin/galeri', auth, memberAuth, async (req, res) => {
    try {
        const galleries = await Gallery.find().sort({ createdAt: -1 });
        res.render('admin_galeri', {
            galleries,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success,
            error: req.query.error
        });
    } catch (e) {
        res.status(500).send('Gagal memuat galeri.');
    }
});

router.post('/admin/galeri/upload', auth, memberAuth, uploadGallery.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.redirect('/admin/galeri?error=File+tidak+ditemukan');
        const { title, description, type } = req.body;

        let fileUrl = '/uploads/gallery/' + req.file.filename;
        let thumbnail = '';

        if (type === 'video') {
            await faststartVideo(req.file.path);
            const thumbPath = await generateVideoThumbnail(req.file.path);
            if (thumbPath) thumbnail = '/uploads/gallery/' + path.basename(thumbPath);
        } else {
            // Kompresi foto ke WebP
            const outPath = await compressPhoto(req.file.path);
            fileUrl = '/uploads/gallery/' + path.basename(outPath);
        }

        await Gallery.create({
            title,
            description,
            type,
            fileUrl,
            thumbnail,
            uploadedBy: req.session.userId
        });
        res.redirect('/admin/galeri?success=Media+berhasil+diupload');
    } catch (e) {
        res.redirect('/admin/galeri?error=Gagal+mengupload+media');
    }
});

router.post('/admin/galeri/upload-multiple', auth, memberAuth, uploadGallery.array('files', 30), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada file yang diterima.' });
        }
        const description = req.body.description || '';
        const docs = await Promise.all(req.files.map(async (file) => {
            const outPath = await compressPhoto(file.path);
            return {
                title: file.originalname.replace(/\.[^/.]+$/, ''),
                description,
                type: 'foto',
                fileUrl: '/uploads/gallery/' + path.basename(outPath),
                uploadedBy: req.session.userId
            };
        }));
        await Gallery.insertMany(docs);
        res.json({ success: true, count: docs.length });
    } catch (e) {
        console.error('Upload multiple error:', e);
        res.status(500).json({ success: false, message: 'Gagal mengupload foto.' });
    }
});

router.post('/admin/galeri/youtube', auth, memberAuth, async (req, res) => {
    try {
        const { title, description, youtubeUrl } = req.body;
        const match = (youtubeUrl || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/ \s]+)/);
        if (!match) return res.redirect('/admin/galeri?error=URL+YouTube+tidak+valid');
        const videoId = match[1];
        await Gallery.create({
            title: (title || '').trim() || 'YouTube Video',
            description: (description || '').trim(),
            type: 'video',
            source: 'youtube',
            fileUrl: 'https://www.youtube.com/embed/' + videoId,
            thumbnail: 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg',
            uploadedBy: req.session.userId
        });
        res.redirect('/admin/galeri?success=Video+YouTube+berhasil+ditambahkan');
    } catch (e) {
        res.redirect('/admin/galeri?error=Gagal+menambahkan+video+YouTube');
    }
});

router.post('/admin/galeri/delete/:id', auth, memberAuth, async (req, res) => {
    try {
        const item = await Gallery.findById(req.params.id);
        if (item) {
            const filePath = 'public' + item.fileUrl;
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await item.deleteOne();
        }
        res.redirect('/admin/galeri?success=Media+berhasil+dihapus');
    } catch (e) {
        res.redirect('/admin/galeri?error=Gagal+menghapus+media');
    }
});

// --- JADWAL LATIHAN ---
router.get('/admin/jadwal-latihan', auth, memberAuth, jadwalController.getDashboard);
router.get('/admin/jadwal-latihan/add', auth, memberAuth, (req, res) => res.render('admin_jadwal_latihan_add', { sessionRole: req.session.role, sessionUserName: req.session.userName }));
router.post('/admin/jadwal-latihan/save', auth, memberAuth, jadwalController.saveJadwal);
router.get('/admin/jadwal-latihan/:id/json', auth, memberAuth, jadwalController.getJadwal);
router.get('/admin/jadwal-latihan/:id/edit', auth, memberAuth, jadwalController.getEditPage);
router.post('/admin/jadwal-latihan/update/:id', auth, memberAuth, jadwalController.updateJadwal);
router.post('/admin/jadwal-latihan/delete/:id', auth, memberAuth, jadwalController.deleteJadwal);

// --- MATERI LATIHAN ---
router.get('/admin/materi-latihan', auth, memberAuth, materiController.getDashboard);
router.get('/admin/materi-latihan/add', auth, memberAuth, (req, res) => res.render('admin_materi_latihan_add', { sessionRole: req.session.role, sessionUserName: req.session.userName }));
router.post('/admin/materi-latihan/save', auth, memberAuth, materiController.saveMateri);
router.get('/admin/materi-latihan/:id/edit', auth, memberAuth, async (req, res) => {
    const MateriLatihan = require('../models/MateriLatihan');
    const materi = await MateriLatihan.findById(req.params.id);
    if (!materi) return res.status(404).send('Tidak ditemukan.');
    res.render('admin_materi_latihan_edit', { materi, sessionRole: req.session.role, sessionUserName: req.session.userName });
});
router.post('/admin/materi-latihan/update/:id', auth, memberAuth, materiController.updateMateri);
router.post('/admin/materi-latihan/delete/:id', auth, memberAuth, materiController.deleteMateri);

// --- MATERI TEATER ---
router.get('/admin/materi-teater', auth, memberAuth, materiTeaterController.getDashboard);
router.get('/admin/materi-teater/add', auth, memberAuth, (req, res) => res.render('admin_materi_teater_add', { sessionRole: req.session.role, sessionUserName: req.session.userName }));
router.post('/admin/materi-teater/save', auth, memberAuth, upload.single('thumbnail'), materiTeaterController.save);
router.get('/admin/materi-teater/:id/edit', auth, memberAuth, materiTeaterController.getEdit);
router.post('/admin/materi-teater/update/:id', auth, memberAuth, upload.single('thumbnail'), materiTeaterController.update);
router.post('/admin/materi-teater/delete/:id', auth, memberAuth, materiTeaterController.delete);

// --- SEJARAH MANAGEMENT ---
router.get('/admin/sejarah', auth, staffAuth, async (req, res) => {
    try {
        const sejarah = await Sejarah.findOne();
        res.render('admin_sejarah', {
            sejarah,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman sejarah.');
    }
});

router.post('/admin/sejarah/save', auth, staffAuth, async (req, res) => {
    try {
        const { konten, tahunBerdiri } = req.body;
        let sejarah = await Sejarah.findOne();
        if (!sejarah) sejarah = new Sejarah();
        sejarah.konten = konten || '';
        sejarah.tahunBerdiri = tahunBerdiri || '';
        sejarah.updatedBy = req.session.userId;
        await sejarah.save();
        res.redirect('/admin/sejarah?success=1');
    } catch (e) {
        res.status(500).send('Gagal menyimpan sejarah.');
    }
});

// --- PENCAPAIAN MANAGEMENT ---
router.get('/admin/pencapaian', auth, memberAuth, async (req, res) => {
    try {
        const pencapaianList = await Pencapaian.find().sort({ tahun: -1, createdAt: -1 });
        res.render('admin_pencapaian', {
            pencapaianList,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman pencapaian.');
    }
});

router.post('/admin/pencapaian/save', auth, memberAuth, async (req, res) => {
    try {
        const { namaEvent, kategori, karya, tahun } = req.body;
        if (!namaEvent || !tahun) return res.redirect('/admin/pencapaian?error=Nama+event+dan+tahun+wajib+diisi');
        await Pencapaian.create({
            namaEvent: namaEvent.trim(),
            kategori: (kategori || '').trim(),
            karya: (karya || '').trim(),
            tahun: parseInt(tahun),
            createdBy: req.session.userId
        });
        res.redirect('/admin/pencapaian?success=1');
    } catch (e) {
        res.status(500).send('Gagal menyimpan pencapaian.');
    }
});

router.post('/admin/pencapaian/delete/:id', auth, memberAuth, async (req, res) => {
    try {
        await Pencapaian.findByIdAndDelete(req.params.id);
        res.redirect('/admin/pencapaian?success=1');
    } catch (e) {
        res.status(500).send('Gagal menghapus pencapaian.');
    }
});

// --- SEKRETARIAT MANAGEMENT ---
router.get('/admin/sekretariat/kontak', auth, staffAuth, async (req, res) => {
    try {
        const sekretariat = await Sekretariat.findOne();
        res.render('admin_sekretariat_kontak', {
            sekretariat,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman kontak.');
    }
});

router.post('/admin/sekretariat/kontak/save', auth, staffAuth, async (req, res) => {
    try {
        const { alamat, email, telepon, mapEmbedUrl } = req.body;
        let sek = await Sekretariat.findOne();
        if (!sek) sek = new Sekretariat();
        sek.alamat      = alamat      || '';
        sek.email       = email       || '';
        sek.telepon     = telepon     || '';
        sek.mapEmbedUrl = mapEmbedUrl || '';
        sek.updatedBy   = req.session.userId;
        await sek.save();
        res.redirect('/admin/sekretariat/kontak?success=1');
    } catch (e) {
        res.status(500).send('Gagal menyimpan kontak.');
    }
});

router.get('/admin/sekretariat/visi-misi', auth, staffAuth, async (req, res) => {
    try {
        const sekretariat = await Sekretariat.findOne();
        res.render('admin_sekretariat_visi', {
            sekretariat,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman visi misi.');
    }
});

router.post('/admin/sekretariat/visi-misi/save', auth, staffAuth, async (req, res) => {
    try {
        const { visiMisi } = req.body;
        let sek = await Sekretariat.findOne();
        if (!sek) sek = new Sekretariat();
        sek.visiMisi  = visiMisi || '';
        sek.updatedBy = req.session.userId;
        await sek.save();
        res.redirect('/admin/sekretariat/visi-misi?success=1');
    } catch (e) {
        res.status(500).send('Gagal menyimpan visi misi.');
    }
});

router.get('/admin/sekretariat/struktur', auth, staffAuth, async (req, res) => {
    try {
        const sekretariat = await Sekretariat.findOne();
        res.render('admin_sekretariat_struktur', {
            sekretariat,
            sessionRole: req.session.role,
            sessionUserName: req.session.userName,
            success: req.query.success
        });
    } catch (e) {
        res.status(500).send('Gagal memuat halaman struktur organisasi.');
    }
});

router.post('/admin/sekretariat/struktur/save', auth, staffAuth, upload.any(), async (req, res) => {
    try {
        const jabatanArr      = [].concat(req.body.jabatan      || []);
        const namaArr         = [].concat(req.body.nama         || []);
        const divisiArr       = [].concat(req.body.divisi       || []);
        const periodeArr      = [].concat(req.body.periode      || []);
        const deskripsiArr    = [].concat(req.body.deskripsi    || []);
        const fotoExistingArr = [].concat(req.body.fotoExisting || []);

        // Build a map: fieldname "foto_0", "foto_1", ... → uploaded file
        const fotoFileMap = {};
        (req.files || []).forEach(f => {
            const m = f.fieldname.match(/^foto_(\d+)$/);
            if (m) fotoFileMap[parseInt(m[1])] = f;
        });

        const struktur = jabatanArr.map((jab, i) => {
            let foto = fotoExistingArr[i] || '';
            if (fotoFileMap[i]) {
                foto = `/uploads/${fotoFileMap[i].filename}`;
            }
            return {
                jabatan:   jab || '',
                nama:      namaArr[i]      || '',
                divisi:    divisiArr[i]    || '',
                periode:   periodeArr[i]   || '',
                deskripsi: deskripsiArr[i] || '',
                foto
            };
        }).filter(item => item.jabatan || item.nama);

        let sek = await Sekretariat.findOne();
        if (!sek) sek = new Sekretariat();
        sek.strukturOrganisasi = struktur;
        sek.updatedBy = req.session.userId;
        await sek.save();
        res.redirect('/admin/sekretariat/struktur?success=1');
    } catch (e) {
        res.status(500).send('Gagal menyimpan struktur organisasi.');
    }
});

// --- SOCIAL MEDIA MANAGEMENT ---
router.post('/admin/social-media/update', auth, staffAuth, async (req, res) => {
    try {
        const { instagram, twitter, facebook, youtube, tiktok, whatsapp } = req.body;
        let sm = await SocialMedia.findOne();
        if (!sm) sm = new SocialMedia();
        sm.instagram = instagram || '';
        sm.twitter   = twitter   || '';
        sm.facebook  = facebook  || '';
        sm.youtube   = youtube   || '';
        sm.tiktok    = tiktok    || '';
        sm.whatsapp  = whatsapp  || '';
        await sm.save();
        res.redirect('/dashboard');
    } catch (e) {
        res.status(500).send('Gagal menyimpan social media.');
    }
});

// --- SITE SETTINGS (LOGO) ---
router.post('/admin/site-settings/logo', auth, staffAuth, uploadLogo.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.redirect('/dashboard?error=File+tidak+ditemukan');
        let ss = await SiteSetting.findOne();
        if (!ss) ss = new SiteSetting();
        // Hapus logo lama jika ada
        if (ss.logoUrl) {
            const oldPath = 'public' + ss.logoUrl;
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch(e) {}
            }
        }
        ss.logoUrl = '/uploads/logo/' + req.file.filename;
        ss.updatedBy = req.session.userId;
        await ss.save();
        res.redirect('/dashboard?success=Logo+berhasil+diperbarui');
    } catch (e) {
        console.error('Logo upload error:', e);
        res.redirect('/dashboard?error=Gagal+mengupload+logo');
    }
});

router.post('/admin/site-settings/logo/delete', auth, staffAuth, async (req, res) => {
    try {
        const ss = await SiteSetting.findOne();
        if (ss && ss.logoUrl) {
            const oldPath = 'public' + ss.logoUrl;
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch(e) {}
            }
            ss.logoUrl = '';
            await ss.save();
        }
        res.redirect('/dashboard?success=Logo+berhasil+dihapus');
    } catch (e) {
        res.redirect('/dashboard?error=Gagal+menghapus+logo');
    }
});

// --- SEO SETTINGS ---
const Berita  = require('../models/Berita');
const Article = require('../models/Article');

// Sitemap in-memory cache (TTL 10 menit)
let _sitemapCache = null, _sitemapCachedAt = 0;
const SITEMAP_TTL = 10 * 60 * 1000;

router.get('/admin/seo-settings', auth, staffAuth, async (req, res) => {
    try {
        let ss = await SiteSetting.findOne();
        if (!ss) ss = await SiteSetting.create({});
        res.render('admin_seo_settings', { ss, query: req.query });
    } catch (e) {
        res.status(500).send('Gagal memuat SEO settings.');
    }
});

router.post('/admin/seo-settings', auth, staffAuth, async (req, res) => {
    try {
        const { siteTitle, siteDescription, siteKeywords, gaTrackingId, searchConsoleVerification, adsenseAccountVerification, adsensePublisherId, adsenseAutoCode } = req.body;
        let ss = await SiteSetting.findOne();
        if (!ss) ss = new SiteSetting();
        ss.siteTitle                    = (siteTitle || '').trim();
        ss.siteDescription              = (siteDescription || '').trim();
        ss.siteKeywords                 = (siteKeywords || '').trim();
        ss.gaTrackingId                 = (gaTrackingId || '').trim();
        ss.searchConsoleVerification    = (searchConsoleVerification || '').trim();
        ss.adsenseAccountVerification   = (adsenseAccountVerification || '').trim();
        ss.adsensePublisherId           = (adsensePublisherId || '').trim();
        ss.adsenseAutoCode              = (adsenseAutoCode || '').trim();
        ss.updatedBy = req.session.userId;
        await ss.save();
        res.redirect('/admin/seo-settings?success=1');
    } catch (e) {
        console.error('SEO settings error:', e);
        res.redirect('/admin/seo-settings?error=1');
    }
});

// --- SITEMAP.XML ---
router.get('/sitemap.xml', async (req, res) => {
    try {
        const now = Date.now();
        if (_sitemapCache && (now - _sitemapCachedAt) < SITEMAP_TTL) {
            res.header('Content-Type', 'application/xml');
            return res.send(_sitemapCache);
        }

        const base = process.env.APPS_URL || 'https://teatersaphalta.com';
        const Template     = require('../models/Template');
        const MateriTeater = require('../models/MateriTeater');

        const [beritaList, articleList, templateList, materiTeaterList] = await Promise.all([
            Berita.find({}, '_id slug createdAt updatedAt').sort({ createdAt: -1 }),
            Article.find({}, '_id createdAt updatedAt').sort({ createdAt: -1 }),
            Template.find({}, '_id createdAt updatedAt').sort({ createdAt: -1 }),
            MateriTeater.find({}, '_id createdAt updatedAt').sort({ createdAt: -1 })
        ]);

        const staticPages = ['', '/profile', '/berita', '/articles', '/galeri', '/sekretariat'];

        let urls = staticPages.map(p => `
  <url>
    <loc>${base}${p}</loc>
    <changefreq>weekly</changefreq>
    <priority>${p === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('');

        beritaList.forEach(b => {
            urls += `
  <url>
    <loc>${base}/berita/${b.slug || b._id}</loc>
    <lastmod>${(b.updatedAt || b.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        });

        articleList.forEach(a => {
            urls += `
  <url>
    <loc>${base}/article/${a._id}</loc>
    <lastmod>${(a.updatedAt || a.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        });

        templateList.forEach(t => {
            urls += `
  <url>
    <loc>${base}/detail/${t._id}</loc>
    <lastmod>${(t.updatedAt || t.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        });

        materiTeaterList.forEach(m => {
            urls += `
  <url>
    <loc>${base}/materi-teater/${m._id}</loc>
    <lastmod>${(m.updatedAt || m.createdAt).toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

        _sitemapCache = xml;
        _sitemapCachedAt = Date.now();

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e) {
        res.status(500).send('Gagal generate sitemap.');
    }
});

// =============================================
// PAYMENT ROUTES
// Semua transaksi diproses oleh payments.trendingbulk.top (payment server)
// apps hanya sebagai CLIENT yang memanggil payment server API
// =============================================

// Callback dari Midtrans (redirect setelah bayar)
router.get('/payment/finish',  paymentController.callbackPage);
router.get('/payment/error',   paymentController.callbackPage);
router.get('/payment/pending', paymentController.callbackPage);

// Webhook callback dari payments server (auto-sync status)
router.post('/api/payment-callback', express.json(), paymentController.handleCallback);

// Sync detail invoice dari payments.trendingbulk.top (upsert data lengkap)
router.post('/api/payment-sync', express.json(), paymentController.handleSync);


// Halaman tagihan publik — user bisa lihat tagihan & bayar
router.get('/tagihan/:orderId/print', paymentController.tagihanPrint);
router.get('/tagihan/:orderId', paymentController.tagihanPage);

// Admin payment management
router.get('/admin/payments',             auth, memberAuth, paymentController.index);
router.get('/admin/payments/export/csv',  auth, memberAuth, paymentController.exportCsv);
router.get('/admin/payments/create',      auth, memberAuth, paymentController.createForm);
router.post('/admin/payments/create',     auth, memberAuth, paymentController.store);
router.get('/admin/payments/:id',         auth, memberAuth, paymentController.detail);
router.post('/admin/payments/:id/check-status', auth, memberAuth, paymentController.checkStatus);
router.post('/admin/payments/:id/delete',       auth, adminAuth, paymentController.destroy);

// --- ROBOTS.TXT ---
router.get('/robots.txt', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.send(`User-agent: *
Allow: /

Sitemap: ${process.env.APPS_URL || 'https://teatersaphalta.com'}/sitemap.xml
`);
});

module.exports = router;
