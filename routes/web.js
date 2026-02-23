const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const templateController = require('../controllers/templateController');
const articleController = require('../controllers/articleController');
const authController = require('../controllers/authController');
const superAdminController = require('../controllers/superAdminController');

// Middlewares
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// ==========================================
// 1. ROUTE PUBLIK (Akses Bebas)
// ==========================================
router.get('/', templateController.getPublicData);
router.get('/detail/:id', templateController.getDetailData);
router.get('/articles', articleController.getPublicArticles);
router.get('/article/:id', articleController.getArticleDetail);

// ==========================================
// 2. FITUR KHUSUS EDITOR (Upload Image)
// ==========================================
/** * FIX PASTE IMAGE:
 * Letakkan di atas agar tidak dianggap sebagai ID.
 * Jika masih gagal paste, hapus 'auth' sementara untuk bypass session leak MemoryStore.
 */
router.post('/upload-image', auth, upload.single('upload'), articleController.uploadImage);

// ==========================================
// 3. ROUTE AUTENTIKASI
// ==========================================
router.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        return req.session.role === 'admin' ? res.redirect('/super-admin') : res.redirect('/dashboard');
    }
    res.render('login');
});
router.post('/login', authController.postLogin);
router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);
router.get('/logout', authController.logout);

// ==========================================
// 4. ROUTE SUPER ADMIN
// ==========================================
router.get('/super-admin', auth, adminAuth, superAdminController.getGlobalDashboard);

// ==========================================
// 5. ROUTE USER DASHBOARD (Personal Management)
// ==========================================
router.get('/dashboard', auth, templateController.getAllData);

// --- ARTIKEL MANAGEMENT ---
router.get('/admin/article/add', auth, (req, res) => res.render('admin_article_add'));
router.post('/admin/article/save', auth, upload.single('thumbnail'), articleController.saveArticle);
router.get('/admin/article/edit/:id', auth, articleController.getEditArticle);

// Tambahkan rute update dan delete dengan metode POST agar sinkron dengan form EJS
router.post('/admin/article/update/:id', auth, upload.single('thumbnail'), articleController.updateArticle);
router.post('/admin/article/delete/:id', auth, articleController.deleteArticle);

// --- TEMPLATE MANAGEMENT ---
router.get('/upload', auth, (req, res) => res.render('upload'));
router.post('/upload', auth, upload.single('image'), templateController.uploadData);
router.get('/admin/template/edit/:id', auth, templateController.getEditTemplate);
router.post('/admin/template/update/:id', auth, upload.single('image'), templateController.updateTemplate);
router.post('/delete/:id', auth, templateController.deleteData);

module.exports = router;
