const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * 1. TAMPILAN REGISTER
 */
exports.getRegister = (req, res) => {
    // Jika sudah login, tidak perlu register lagi, arahkan sesuai role
    if (req.session.userId) {
        return req.session.role === 'admin' ? res.redirect('/super-admin') : res.redirect('/dashboard');
    }
    res.render('register');
};

/**
 * 2. PROSES REGISTRASI
 */
exports.postRegister = async (req, res) => {
    try {
        const username = req.body.username ? req.body.username.trim() : '';
        const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
        const { password } = req.body;

        if (!username || !email || !password) {
            return res.send("<script>alert('Semua field wajib diisi!'); window.location='/register';</script>");
        }

        // Cek duplikasi
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.send("<script>alert('Username atau Email sudah terdaftar!'); window.location='/register';</script>");
        }

        const newUser = new User({ username, email, password });
        await newUser.save();
        
        res.send("<script>alert('Registrasi Berhasil! Silakan Login.'); window.location='/login';</script>");
    } catch (error) {
        console.error("Error Register:", error);
        res.status(500).send("Terjadi kesalahan saat pendaftaran: " + error.message);
    }
};

/**
 * 3. PROSES LOGIN (Username atau Email)
 * Dilengkapi dengan Auto-Redirect Role Admin
 */
exports.postLogin = async (req, res) => {
    try {
        const identifier = req.body.identifier ? req.body.identifier.trim() : '';
        const { password } = req.body;

        if (!identifier || !password) {
            return res.send("<script>alert('Input dan Password wajib diisi!'); window.location='/login';</script>");
        }

        // Cari user: Username (case-sensitive) atau Email (lowercase)
        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { username: identifier }
            ]
        });

        if (user) {
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (isMatch) {
                // Set session data penting
                req.session.userId = user._id;
                req.session.userName = user.username;
                req.session.role = user.role; // Menyimpan role (admin/user)

                // Simpan session secara manual untuk memastikan persistensi sebelum redirect
                return req.session.save((err) => {
                    if (err) {
                        console.error("Session Save Error:", err);
                        return res.status(500).send("Gagal membuat sesi login.");
                    }

                    // --- LOGIKA AUTO-REDIRECT ---
                    if (user.role === 'admin') {
                        console.log(`[AUTH] Admin ${user.username} logged in. Redirecting to Super Admin Dashboard.`);
                        return res.redirect('/super-admin');
                    } else {
                        console.log(`[AUTH] User ${user.username} logged in. Redirecting to Personal Dashboard.`);
                        return res.redirect('/dashboard');
                    }
                });
            }
        }
        
        // Gagal login
        res.send("<script>alert('Username/Email atau Password Salah!'); window.location='/login';</script>");
    } catch (error) {
        console.error("Error Login:", error);
        res.status(500).send("Terjadi kesalahan pada server saat login.");
    }
};

/**
 * 4. PROSES LOGOUT
 */
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/login');
    });
};
