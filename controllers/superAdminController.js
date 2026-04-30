const User        = require('../models/User');
const Article     = require('../models/Article');
const Berita      = require('../models/Berita');
const Transaction = require('../models/Transaction');
const Gallery     = require('../models/Gallery');
const SiteSetting = require('../models/SiteSetting');
const { logAction } = require('../middleware/auditLog');

exports.getGlobalDashboard = async (req, res) => {
    try {
        const [
            users,
            totalArticles,
            totalBerita,
            totalGallery,
            recentTransactions,
            txSuccess,
            txPending,
            siteSetting
        ] = await Promise.all([
            User.find().select('-password').sort({ createdAt: -1 }),
            Article.countDocuments(),
            Berita.countDocuments(),
            Gallery.countDocuments(),
            Transaction.find().sort({ createdAt: -1 }).limit(10),
            Transaction.find({ status: 'success' }),
            Transaction.countDocuments({ status: 'pending' }),
            SiteSetting.findOne()
        ]);

        const totalRevenue = txSuccess.reduce((sum, t) => sum + (t.amount || 0), 0);

        const stats = {
            users:      users.length,
            admins:     users.filter(u => u.role === 'admin' || u.role === 'superadmin').length,
            articles:   totalArticles,
            berita:     totalBerita,
            gallery:    totalGallery,
            txPending,
            txSuccess:  txSuccess.length,
            revenue:    totalRevenue
        };

        const isSuperAdmin = req.session.role === 'superadmin';

        // Admin hanya melihat user non-superadmin
        const visibleUsers = isSuperAdmin
            ? users
            : users.filter(u => u.role !== 'superadmin');

        const regSetting = {
            registrationOpen: siteSetting ? siteSetting.registrationOpen !== false : true,
            maxUsers: siteSetting ? (siteSetting.maxUsers || 0) : 0
        };

        res.render('super_admin_dashboard', {
            users: visibleUsers,
            stats,
            recentTransactions,
            regSetting,
            isSuperAdmin,
            currentUserId: req.session.userId,
            sessionUserName: req.session.username,
            sessionRole: req.session.role,
            query: req.query,
            page: 'superadmin'
        });
    } catch (error) {
        console.error('SuperAdmin Dashboard Error:', error);
        res.status(500).send('Error loading dashboard.');
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const isSuperAdmin = req.session.role === 'superadmin';

        if (id === req.session.userId.toString()) {
            return res.status(403).send('Tidak bisa mengubah role akun sendiri.');
        }

        // Admin tidak boleh set role superadmin
        const validRoles = isSuperAdmin ? ['user', 'operator', 'admin', 'superadmin'] : ['user', 'operator', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(403).send('Akses ditolak: tidak bisa menetapkan role ini.');
        }

        // Admin tidak boleh mengubah akun superadmin
        const target = await User.findById(id);
        if (!target) return res.status(404).send('User tidak ditemukan.');
        if (!isSuperAdmin && target.role === 'superadmin') {
            return res.status(403).send('Akses ditolak.');
        }

        const oldRole = target.role;
        await User.findByIdAndUpdate(id, { role });
        await logAction(req, 'user_role_change', 'user', id, {
            username: target.username, oldRole, newRole: role
        });
        res.redirect('/super-admin');
    } catch (error) {
        console.error('Update Role Error:', error);
        res.status(500).send('Gagal mengubah role.');
    }
};

exports.updateRegistrationSettings = async (req, res) => {
    try {
        const registrationOpen = req.body.registrationOpen === 'true';
        const maxUsers = parseInt(req.body.maxUsers, 10);
        const validMax = (!isNaN(maxUsers) && maxUsers >= 0) ? maxUsers : 0;

        await SiteSetting.findOneAndUpdate(
            {},
            { registrationOpen, maxUsers: validMax, updatedBy: req.session.userId },
            { upsert: true, new: true }
        );

        await logAction(req, 'registration_settings_changed', 'setting', null, {
            registrationOpen, maxUsers: validMax
        });
        res.redirect('/super-admin?success=Pengaturan+registrasi+disimpan');
    } catch (error) {
        console.error('Update Registration Settings Error:', error);
        res.redirect('/super-admin?error=Gagal+menyimpan+pengaturan');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.session.userId.toString()) {
            return res.status(403).send('Tidak bisa menghapus akun sendiri.');
        }

        const isSuperAdmin = req.session.role === 'superadmin';
        const user = await User.findById(id);
        if (!user) return res.status(404).send('User tidak ditemukan.');
        if (user.role === 'superadmin') return res.status(403).send('Tidak bisa menghapus superadmin.');
        // Admin hanya boleh hapus role 'user', tidak boleh hapus sesama admin
        if (!isSuperAdmin && user.role === 'admin') {
            return res.status(403).send('Akses ditolak: admin tidak bisa menghapus admin lain.');
        }

        await logAction(req, 'user_delete', 'user', id, {
            username: user.username, role: user.role
        });
        await User.findByIdAndDelete(id);
        res.redirect('/super-admin');
    } catch (error) {
        console.error('Delete User Error:', error);
        res.status(500).send('Gagal menghapus user.');
    }
};
