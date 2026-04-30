const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'public/uploads/gallery/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedImage = /jpeg|jpg|png|gif|webp/;
    const allowedVideo = /mp4|webm|ogg|mov|avi/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const mime = file.mimetype;

    if (allowedImage.test(ext) || allowedVideo.test(ext) || mime.startsWith('image/') || mime.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Format tidak didukung. Gunakan jpg/png/webp untuk foto atau mp4/webm untuk video.'));
    }
};

const uploadGallery = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB untuk video
});

module.exports = uploadGallery;
