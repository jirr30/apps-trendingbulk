// middleware/memberAuth.js
// Role operator, admin, dan superadmin bisa akses (konten harian)
// Role user hanya bisa akses halaman publik
module.exports = (req, res, next) => {
    if (req.session && req.session.role && ['operator', 'admin', 'superadmin'].includes(req.session.role)) {
        return next();
    }
    if (req.session && req.session.userId) {
        return res.status(403).send('Akses Ditolak: Halaman ini memerlukan minimal role operator.');
    }
    res.redirect('/login');
};
