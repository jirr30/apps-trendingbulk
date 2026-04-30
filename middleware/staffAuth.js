// middleware/staffAuth.js
// Hanya role admin dan superadmin yang bisa akses
module.exports = (req, res, next) => {
    if (req.session && req.session.role && ['admin', 'superadmin'].includes(req.session.role)) {
        return next();
    }
    res.status(403).send("Akses Ditolak: Halaman ini hanya untuk Admin.");
};
