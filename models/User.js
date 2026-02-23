const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        default: 'user' 
    } // 'user' atau 'admin'
}, { timestamps: true });

/**
 * MIDDLEWARE ENKRIPSI PASSWORD
 * Memperbaiki error "next is not a function" dengan menghapus callback next
 * karena fungsi sudah menggunakan async/await.
 */
userSchema.pre('save', async function() {
    // Hanya jalankan enkripsi jika password baru atau sedang diubah
    if (!this.isModified('password')) return;

    try {
        // Menggunakan salt round 10 untuk keamanan standar NOC
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error; // Melempar error ke controller agar bisa ditangkap di catch block
    }
});

module.exports = mongoose.model('User', userSchema);
