const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const templateController = require('../controllers/templateController');
const auth = require('../middleware/auth'); // Import middleware proteksi

// ==========================================
// ROUTES PUBLIK (Bisa diakses tanpa login)
// ==========================================

// Tampilan Halaman Login
router.get('/login', (req, res) => {
    // Jika sudah login, langsung lempar ke dashboard
    if (req.session.isLoggedIn) return res.redirect('/');
    res.render('login');
});

// Proses Verifikasi Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Validasi berdasarkan data di file .env
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        // Anda bisa mengembangkan ini dengan flash message nanti
        res.send("<script>alert('Username atau Password Salah!'); window.location='/login';</script>");
    }
});

// Proses Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ==========================================
// ROUTES TERPROTEKSI (Wajib Login)
// ==========================================

// Dashboard Utama: Menampilkan semua data
router.get('/', auth, templateController.getAllData);

// Form Upload Data
router.get('/upload', auth, (req, res) => {
    res.render('upload');
});

// Proses Upload (Gunakan Multer + Controller)
router.post('/upload', auth, upload.single('image'), templateController.uploadData);

// Proses Hapus Data & File Fisik
router.post('/delete/:id', auth, templateController.deleteData);

module.exports = router;
