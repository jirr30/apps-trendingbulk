const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. AUTO-CREATE FOLDER (NOC Standard)
// Memastikan folder penyimpanan tersedia agar tidak error saat runtime
const uploadDir = 'public/uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Format: fieldname-timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 2. SECURITY FILTER
// Mencegah file berbahaya (executable/scripts) masuk ke server
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Format file ditolak! Hanya diperbolehkan: jpg, png, webp, gif.'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
        // Saya naikkan ke 5MB agar CKEditor lebih leluasa untuk gambar High-Res
        fileSize: 5 * 1024 * 1024 
    }
});

// Export instance multer
module.exports = upload;
