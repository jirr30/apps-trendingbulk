const User        = require('../models/User');
const SiteSetting = require('../models/SiteSetting');
const bcrypt      = require('bcryptjs');
const speakeasy   = require('speakeasy');
const qrcode      = require('qrcode');
const { body, validationResult } = require('express-validator');
const { logAction } = require('../middleware/auditLog');

const APP_NAME = 'Teater Saphalta';

// ── Validation rules ─────────────────────────────────────────────────────────

exports.registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 }).withMessage('Username harus 3-30 karakter.')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username hanya boleh huruf, angka, dan underscore.'),
    body('email')
        .trim()
        .isEmail().withMessage('Format email tidak valid.')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
        .matches(/[A-Z]/).withMessage('Password harus mengandung minimal 1 huruf kapital.')
        .matches(/[0-9]/).withMessage('Password harus mengandung minimal 1 angka.')
];

exports.loginValidation = [
    body('identifier').trim().notEmpty().withMessage('Username/Email wajib diisi.'),
    body('password').notEmpty().withMessage('Password wajib diisi.')
];

// ── GET /register ─────────────────────────────────────────────────────────────

exports.getRegister = (req, res) => {
    if (req.session.userId) {
        if (req.session.role === 'superadmin') return res.redirect('/super-admin');
        if (req.session.role === 'admin')      return res.redirect('/dashboard');
        return res.redirect('/');
    }
    res.render('register');
};

// ── POST /register ────────────────────────────────────────────────────────────

exports.postRegister = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', errors.array()[0].msg);
            return res.redirect('/register');
        }

        const username = req.body.username.trim();
        const email    = req.body.email.trim().toLowerCase();
        const { password } = req.body;

        const setting = await SiteSetting.findOne();
        if (setting && setting.registrationOpen === false) {
            req.flash('error', 'Pendaftaran sedang ditutup. Hubungi administrator.');
            return res.redirect('/register');
        }
        if (setting && setting.maxUsers > 0) {
            const count = await User.countDocuments();
            if (count >= setting.maxUsers) {
                req.flash('error', `Batas maksimal pengguna (${setting.maxUsers}) telah tercapai.`);
                return res.redirect('/register');
            }
        }

        // Generic error — prevents user enumeration
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            req.flash('error', 'Pendaftaran gagal. Silakan coba dengan data lain.');
            return res.redirect('/register');
        }

        const newUser = new User({ username, email, password });
        await newUser.save();

        await logAction(req, 'register', 'user', newUser._id, { username });

        req.flash('success', 'Registrasi berhasil! Silakan login.');
        res.redirect('/login');
    } catch (err) {
        console.error('[Register]', err);
        req.flash('error', 'Terjadi kesalahan saat pendaftaran. Coba lagi.');
        res.redirect('/register');
    }
};

// ── POST /login ───────────────────────────────────────────────────────────────

exports.postLogin = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', errors.array()[0].msg);
            return res.redirect('/login');
        }

        const identifier   = req.body.identifier.trim();
        const { password } = req.body;
        const genericError = 'Username/Email atau Password salah.';

        const user = await User.findOne({
            $or: [
                { email:    identifier.toLowerCase() },
                { username: identifier }
            ]
        });

        // ── User not found ────────────────────────────────────
        if (!user) {
            await logAction(req, 'login_failed', null, null, { identifier, reason: 'user_not_found' });
            req.flash('error', genericError);
            return res.redirect('/login');
        }

        // ── Account locked ────────────────────────────────────
        if (user.isLocked) {
            const minsLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
            await logAction(req, 'login_failed', 'user', user._id, {
                username: user.username, reason: 'account_locked'
            });
            req.flash('error',
                `Akun dikunci karena terlalu banyak percobaan gagal. Coba lagi dalam ${minsLeft} menit.`
            );
            return res.redirect('/login');
        }

        // ── Password check ────────────────────────────────────
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await user.incLoginAttempts();
            await logAction(req, 'login_failed', 'user', user._id, {
                username: user.username, reason: 'wrong_password'
            });
            const remaining = Math.max(0, 5 - (user.loginAttempts + 1));
            const msg = remaining > 0
                ? `${genericError} Sisa percobaan: ${remaining}.`
                : 'Akun dikunci selama 30 menit karena terlalu banyak percobaan gagal.';
            req.flash('error', msg);
            return res.redirect('/login');
        }

        // ── Credentials valid — reset lockout counter ─────────
        await user.resetLoginAttempts();

        const redirectTo = (req.body.redirect_to || '').trim();
        const safeRedirect = (redirectTo.startsWith('/') && !redirectTo.startsWith('//'))
            ? redirectTo
            : null;

        // ── Session Fixation Protection: regenerate session ID ─
        req.session.regenerate(async (err) => {
            if (err) {
                console.error('[Login] regenerate error:', err);
                req.flash('error', 'Gagal membuat sesi. Coba lagi.');
                return res.redirect('/login');
            }

            // ── 2FA gate (admin / superadmin only) ───────────
            if (user.twoFactorEnabled && ['admin', 'superadmin'].includes(user.role)) {
                req.session.twoFactorPending = {
                    userId:           user._id.toString(),
                    userName:         user.username,
                    role:             user.role,
                    redirectTo:       safeRedirect,
                    loginAt:          Date.now(),
                    passwordChangedAt: user.passwordChangedAt?.getTime() || 0
                };
                await logAction(req, 'login_2fa_pending', 'user', user._id, { username: user.username });
                return req.session.save((saveErr) => {
                    if (saveErr) console.error('[Login] session save error:', saveErr);
                    res.redirect('/login/2fa');
                });
            }

            // ── Complete login ────────────────────────────────
            req.session.userId    = user._id;
            req.session.userName  = user.username;
            req.session.role      = user.role;
            req.session.loginAt   = Date.now();
            req.session.userPasswordChangedAt = user.passwordChangedAt?.getTime() || 0;

            await logAction(req, 'login_success', 'user', user._id, { username: user.username });

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[Login] session save error:', saveErr);
                    req.flash('error', 'Gagal menyimpan sesi. Coba lagi.');
                    return res.redirect('/login');
                }
                if (safeRedirect)           return res.redirect(safeRedirect);
                if (user.role === 'superadmin') return res.redirect('/super-admin');
                return res.redirect('/dashboard');
            });
        });
    } catch (err) {
        console.error('[Login]', err);
        req.flash('error', 'Terjadi kesalahan pada server. Coba lagi.');
        res.redirect('/login');
    }
};

// ── GET /login/2fa ────────────────────────────────────────────────────────────

exports.getTwoFactorVerify = (req, res) => {
    if (!req.session.twoFactorPending) return res.redirect('/login');
    res.render('login_2fa', {
        error:   req.flash('error')[0] || null,
        success: req.flash('success')[0] || null
    });
};

// ── POST /login/2fa ───────────────────────────────────────────────────────────

exports.postTwoFactorVerify = async (req, res) => {
    const pending = req.session.twoFactorPending;
    if (!pending) return res.redirect('/login');

    try {
        const token = (req.body.token || '').replace(/\s/g, '');
        if (!token) {
            req.flash('error', 'Kode verifikasi wajib diisi.');
            return res.redirect('/login/2fa');
        }

        const user = await User
            .findById(pending.userId)
            .select('+twoFactorSecret');

        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            req.session.destroy(() => {});
            req.flash('error', 'Sesi tidak valid. Silakan login ulang.');
            return res.redirect('/login');
        }

        const valid = speakeasy.totp.verify({
            secret:   user.twoFactorSecret,
            encoding: 'base32',
            token,
            window:   1 // allows ±30 seconds clock drift
        });

        if (!valid) {
            await logAction(req, '2fa_verify_failed', 'user', user._id, { username: user.username });
            req.flash('error', 'Kode verifikasi salah atau sudah kedaluwarsa. Coba lagi.');
            return res.redirect('/login/2fa');
        }

        // ── 2FA passed — complete login ───────────────────────
        const { userId, userName, role, redirectTo, loginAt, passwordChangedAt: pwChangedAt } = pending;

        req.session.regenerate(async (regenErr) => {
            if (regenErr) {
                req.flash('error', 'Gagal membuat sesi. Coba lagi.');
                return res.redirect('/login');
            }

            req.session.userId    = userId;
            req.session.userName  = userName;
            req.session.role      = role;
            req.session.loginAt   = loginAt;
            req.session.userPasswordChangedAt = pwChangedAt;

            await logAction(req, 'login_success', 'user', userId, { username: userName, method: '2fa' });

            req.session.save((saveErr) => {
                if (saveErr) {
                    req.flash('error', 'Gagal menyimpan sesi.');
                    return res.redirect('/login');
                }
                if (redirectTo)          return res.redirect(redirectTo);
                if (role === 'superadmin') return res.redirect('/super-admin');
                return res.redirect('/dashboard');
            });
        });
    } catch (err) {
        console.error('[2FA Verify]', err);
        req.flash('error', 'Terjadi kesalahan. Coba lagi.');
        res.redirect('/login/2fa');
    }
};

// ── GET /logout ───────────────────────────────────────────────────────────────

exports.logout = (req, res) => {
    const userId   = req.session?.userId;
    const userName = req.session?.userName;
    logAction(req, 'logout', 'user', userId, { username: userName }).catch(() => {});

    req.session.destroy((err) => {
        if (err) console.error('[Logout]', err);
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
};

// ── GET /admin/security ───────────────────────────────────────────────────────

exports.getSecurityPage = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select('-password -twoFactorSecret');
        if (!user) return res.redirect('/login');

        const passwordChangedMsg = req.query.msg === 'password_changed'
            ? 'Password diubah dari perangkat lain. Silakan login ulang.'
            : null;

        res.render('admin_security', {
            pageTitle:        'Keamanan Akun',
            userName:         req.session.userName,
            isSuperAdmin:     req.session.role === 'superadmin',
            user,
            twoFactorEnabled: user.twoFactorEnabled,
            setupPending:     !!req.session.twoFactorSetup,
            qrCodeUrl:        req.session.twoFactorSetup?.qrCodeUrl || null,
            success:          req.flash('success')[0] || null,
            error:            req.flash('error')[0]   || passwordChangedMsg || null
        });
    } catch (err) {
        console.error('[SecurityPage]', err);
        res.redirect('/dashboard');
    }
};

// ── POST /admin/security/2fa/setup ───────────────────────────────────────────
// Generates a new TOTP secret + QR code (stored in session, not DB until confirmed)

exports.setup2FA = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        if (user.twoFactorEnabled) {
            req.flash('error', '2FA sudah aktif. Nonaktifkan dulu sebelum mengatur ulang.');
            return res.redirect('/admin/security');
        }

        const secret = speakeasy.generateSecret({
            name:   `${APP_NAME} (${user.username})`,
            length: 20
        });

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        // Store pending secret in session — only saved to DB after user confirms with valid token
        req.session.twoFactorSetup = { secret: secret.base32, qrCodeUrl };
        await req.session.save();

        res.redirect('/admin/security');
    } catch (err) {
        console.error('[2FA Setup]', err);
        req.flash('error', 'Gagal membuat konfigurasi 2FA. Coba lagi.');
        res.redirect('/admin/security');
    }
};

// ── POST /admin/security/2fa/enable ──────────────────────────────────────────
// Confirms TOTP token and permanently saves secret to DB

exports.enable2FA = async (req, res) => {
    const setup = req.session.twoFactorSetup;
    if (!setup) {
        req.flash('error', 'Setup 2FA tidak ditemukan. Mulai ulang proses setup.');
        return res.redirect('/admin/security');
    }

    try {
        const token = (req.body.token || '').replace(/\s/g, '');
        if (!token) {
            req.flash('error', 'Kode verifikasi wajib diisi.');
            return res.redirect('/admin/security');
        }

        const valid = speakeasy.totp.verify({
            secret:   setup.secret,
            encoding: 'base32',
            token,
            window:   1
        });

        if (!valid) {
            req.flash('error', 'Kode verifikasi salah. Pastikan waktu perangkat Anda sinkron dan coba lagi.');
            return res.redirect('/admin/security');
        }

        await User.findByIdAndUpdate(req.session.userId, {
            twoFactorSecret:  setup.secret,
            twoFactorEnabled: true
        });

        delete req.session.twoFactorSetup;
        await req.session.save();

        await logAction(req, '2fa_enabled', 'user', req.session.userId, { username: req.session.userName });

        req.flash('success', '2FA berhasil diaktifkan. Akun Anda kini dilindungi verifikasi dua langkah.');
        res.redirect('/admin/security');
    } catch (err) {
        console.error('[2FA Enable]', err);
        req.flash('error', 'Gagal mengaktifkan 2FA. Coba lagi.');
        res.redirect('/admin/security');
    }
};

// ── POST /admin/security/2fa/disable ─────────────────────────────────────────

exports.disable2FA = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            req.flash('error', 'Password wajib diisi untuk menonaktifkan 2FA.');
            return res.redirect('/admin/security');
        }

        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.flash('error', 'Password salah.');
            return res.redirect('/admin/security');
        }

        await User.findByIdAndUpdate(req.session.userId, {
            twoFactorSecret:  null,
            twoFactorEnabled: false
        });

        await logAction(req, '2fa_disabled', 'user', req.session.userId, { username: req.session.userName });

        req.flash('success', '2FA berhasil dinonaktifkan.');
        res.redirect('/admin/security');
    } catch (err) {
        console.error('[2FA Disable]', err);
        req.flash('error', 'Gagal menonaktifkan 2FA. Coba lagi.');
        res.redirect('/admin/security');
    }
};

// ── POST /admin/security/password ────────────────────────────────────────────

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate inputs
        const errs = [];
        if (!currentPassword)                               errs.push('Password lama wajib diisi.');
        if (!newPassword)                                   errs.push('Password baru wajib diisi.');
        if (newPassword && newPassword.length < 8)         errs.push('Password baru minimal 8 karakter.');
        if (newPassword && !/[A-Z]/.test(newPassword))     errs.push('Password baru harus mengandung minimal 1 huruf kapital.');
        if (newPassword && !/[0-9]/.test(newPassword))     errs.push('Password baru harus mengandung minimal 1 angka.');
        if (newPassword !== confirmPassword)                errs.push('Konfirmasi password tidak cocok.');

        if (errs.length) {
            req.flash('error', errs[0]);
            return res.redirect('/admin/security');
        }

        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash('error', 'Password lama salah.');
            return res.redirect('/admin/security');
        }

        // Update password (pre-save hook handles hashing + sets passwordChangedAt)
        user.password = newPassword;
        await user.save();

        // Keep current session valid after its own password change
        req.session.loginAt                 = Date.now();
        req.session.userPasswordChangedAt   = user.passwordChangedAt?.getTime() || Date.now();
        req.session.lastPasswordCheck       = Date.now();
        await req.session.save();

        await logAction(req, 'password_changed', 'user', req.session.userId, { username: req.session.userName });

        req.flash('success', 'Password berhasil diubah. Sesi login lain akan otomatis berakhir.');
        res.redirect('/admin/security');
    } catch (err) {
        console.error('[ChangePassword]', err);
        req.flash('error', 'Gagal mengubah password. Coba lagi.');
        res.redirect('/admin/security');
    }
};
