// 1. Load Environment Variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const connectDB = require('./config/db');
const webRoutes = require('./routes/web');

const app = express();
// 1. Nginx + HTTPS + Secure Cookie
app.set('trust proxy', 1);

// 2. Hubungkan ke MongoDB
connectDB();

// 3. Setup View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 4. Middleware Dasar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Konfigurasi Session untuk Login
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 3600000, // Sesi aktif 1 jam
        secure: true,    // SEKARANG SUDAH AMAN DIUBAH KE TRUE
        httpOnly: true,  // Mencegah akses cookie via JavaScript (XSS)
        sameSite: 'lax'  // Melindungi dari serangan CSRF
    }
}));

// 6. Folder Statis (Penting untuk CSS & Gambar)
// Nginx akan mengakses /var/www/html/apps/public/ melalui alias
app.use(express.static(path.join(__dirname, 'public')));

// 7. Penggunaan Routes
app.use('/', webRoutes);

// 8. Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Error khusus Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send('Error: Ukuran file terlalu besar (Maksimal 2MB)!');
    }
    
    res.status(500).send('Terjadi kesalahan internal pada server.');
});

// 9. Jalankan Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
==============================================
🚀 SERVER STATUS: ONLINE
🌐 DOMAIN : apps.trendingbulk.top
📡 PORT   : ${PORT}
📁 PATH   : /var/www/html/apps
==============================================
    `);
});
