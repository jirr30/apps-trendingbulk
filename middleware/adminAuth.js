module.exports = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role === 'superadmin') {
        return next();
    }
    res.status(403).send("Akses Ditolak: Anda bukan Super Admin!");
};
