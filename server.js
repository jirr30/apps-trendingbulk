// 1. Load Environment Variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const helmet = require('helmet');
const flash = require('connect-flash');
const connectDB = require('./config/db');
const webRoutes = require('./routes/web');
const SocialMedia = require('./models/SocialMedia');
const SiteSetting = require('./models/SiteSetting');
const { csrfInit, csrfProtect } = require('./middleware/csrf');

const app = express();
// Nginx + HTTPS + Secure Cookie
app.set('trust proxy', 1);

// Hubungkan ke MongoDB
connectDB();

// Security Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", "'unsafe-inline'",
                "cdn.ckeditor.com",
                "cdn.tailwindcss.com",
                // Google Analytics 4
                "https://www.googletagmanager.com",
                "https://www.google-analytics.com",
                // Google AdSense
                "https://pagead2.googlesyndication.com",
                "https://securepubads.g.doubleclick.net",
                "https://ep1.adtrafficquality.google",
                "https://ep2.adtrafficquality.google",
                "https://adservice.google.com",
                // Midtrans Snap
                "https://app.midtrans.com",
                "https://app.sandbox.midtrans.com",
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            frameSrc: [
                "'self'",
                "https://www.youtube.com",
                "https://www.youtube-nocookie.com",
                "https://player.vimeo.com",
                "https://www.google.com",
                "https://maps.google.com",
                "https://maps.googleapis.com",
                // AdSense iframe
                "https://googleads.g.doubleclick.net",
                "https://tpc.googlesyndication.com",
                // Midtrans Snap popup
                "https://app.midtrans.com",
                "https://app.sandbox.midtrans.com",
            ],
            connectSrc: [
                "'self'",
                // GA4 data collection
                "https://www.google-analytics.com",
                "https://analytics.google.com",
                "https://stats.g.doubleclick.lt",
                "https://region1.google-analytics.com",
                // Midtrans API
                "https://app.midtrans.com",
                "https://app.sandbox.midtrans.com",
                "https://api.midtrans.com",
                "https://api.sandbox.midtrans.com",
            ],
            fontSrc: ["'self'", "https:", "data:"],
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Setup View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware Dasar
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Konfigurasi Session dengan MongoDB Store (Production-safe)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        ttl: 28800,         // Session expired setelah 8 jam
        autoRemove: 'native'
    }),
    cookie: {
        maxAge: 28800000,   // Sesi aktif 8 jam
        secure: true,       // HTTPS only
        httpOnly: true,     // Mencegah akses cookie via JavaScript (XSS)
        sameSite: 'strict'  // Proteksi CSRF lebih ketat
    }
}));

// Folder Statis — harus sebelum middleware DB agar file statis tidak memicu query MongoDB
app.use(express.static(path.join(__dirname, 'public')));

// Flash Messages (pengganti inline <script>alert)
app.use(flash());
app.use((req, res, next) => {
    res.locals.flash_error = req.flash('error');
    res.locals.flash_success = req.flash('success');
    res.locals.sessionRole = req.session.role || null;
    res.locals.sessionUserId = req.session.userId || null;
    res.locals.sessionUserName = req.session.userName || null;
    next();
});

// CSRF Protection — generate token for all sessions, validate on POST
app.use(csrfInit);
app.use(csrfProtect);

// In-memory cache untuk settings (TTL 60 detik)
let _smCache = null, _smCachedAt = 0;
let _ssCache = null, _ssCachedAt = 0;
const SETTINGS_TTL = 60 * 1000;

// Load social media settings ke semua views
app.use(async (req, res, next) => {
    try {
        const now = Date.now();
        if (!_smCache || (now - _smCachedAt) > SETTINGS_TTL) {
            let sm = await SocialMedia.findOne();
            if (!sm) sm = await SocialMedia.create({});
            _smCache = sm;
            _smCachedAt = now;
        }
        res.locals.socialMedia = _smCache;
    } catch (e) {
        res.locals.socialMedia = {};
    }
    next();
});

// Load site settings (logo, dll) ke semua views
app.use(async (req, res, next) => {
    try {
        const now = Date.now();
        if (!_ssCache || (now - _ssCachedAt) > SETTINGS_TTL) {
            let ss = await SiteSetting.findOne();
            if (!ss) ss = await SiteSetting.create({});
            _ssCache = ss;
            _ssCachedAt = now;
        }
        res.locals.siteSetting = _ssCache;
    } catch (e) {
        res.locals.siteSetting = {};
    }
    next();
});

// Routes
app.use('/', webRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send('Error: Ukuran file terlalu besar (Maksimal 5MB)!');
    }

    res.status(500).send('Terjadi kesalahan internal pada server.');
});

// Jalankan Server
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
