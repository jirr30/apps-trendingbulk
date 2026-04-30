const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME          = 30 * 60 * 1000; // 30 minutes in ms

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: {
        type:    String,
        enum:    ['user', 'operator', 'admin', 'superadmin'],
        default: 'user'
    }, // 'user' < 'operator' < 'admin' < 'superadmin'

    // ── Brute-force protection ─────────────────────────
    loginAttempts: { type: Number, default: 0 },
    lockUntil:     { type: Date,   default: null },

    // ── Password-change force-logout ───────────────────
    passwordChangedAt: { type: Date, default: null },

    // ── Two-Factor Authentication ──────────────────────
    twoFactorSecret:  { type: String,  default: null, select: false },
    twoFactorEnabled: { type: Boolean, default: false }
}, { timestamps: true });

// ── Virtual: is the account currently locked? ─────────
userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Increment failed login counter; lock when threshold reached ──
userSchema.methods.incLoginAttempts = function () {
    // If a previous lock has expired, restart the counter
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({ $set: { loginAttempts: 1, lockUntil: null } });
    }
    const updates = { $inc: { loginAttempts: 1 } };
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
    }
    return this.updateOne(updates);
};

// ── Reset counter on successful login ─────────────────
userSchema.methods.resetLoginAttempts = function () {
    return this.updateOne({ $set: { loginAttempts: 0, lockUntil: null } });
};

// ── Pre-save: hash password + record change timestamp ─
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        // Only update timestamp on password *change*, not on first creation
        if (!this.isNew) {
            this.passwordChangedAt = new Date();
        }
    } catch (err) {
        throw err;
    }
});

module.exports = mongoose.model('User', userSchema);
