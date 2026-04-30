const User = require('../models/User');

// Check for password changes at most once every 5 minutes per session
const PASS_CHECK_INTERVAL = 5 * 60 * 1000;

module.exports = async (req, res, next) => {
    if (!req.session?.userId) {
        return res.redirect('/login');
    }

    try {
        const now       = Date.now();
        const lastCheck = req.session.lastPasswordCheck || 0;

        if (now - lastCheck > PASS_CHECK_INTERVAL) {
            const user = await User
                .findById(req.session.userId)
                .select('passwordChangedAt')
                .lean();

            if (!user) {
                // Account was deleted — invalidate session
                return req.session.destroy(() => res.redirect('/login'));
            }

            const loginAt = req.session.loginAt || 0;

            if (user.passwordChangedAt && user.passwordChangedAt.getTime() > loginAt) {
                // Password changed after this session was created → force re-login
                return req.session.destroy(() =>
                    res.redirect('/login?msg=password_changed')
                );
            }

            req.session.lastPasswordCheck = now;
        }
    } catch (err) {
        // Don't block the request on a transient DB error
        console.error('[auth] Password-check error:', err.message);
    }

    next();
};
