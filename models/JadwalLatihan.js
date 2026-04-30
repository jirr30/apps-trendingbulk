const mongoose = require('mongoose');

const jadwalLatihanSchema = new mongoose.Schema({
    hari: {
        type: String,
        required: true,
        enum: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
    },
    waktu_mulai: { type: String, required: true },
    waktu_selesai: { type: String, required: true },
    materi: { type: String, required: true, trim: true },
    pelatih: { type: String, required: true, trim: true },
    tempat: { type: String, required: true, trim: true },
    keterangan: { type: String, trim: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('JadwalLatihan', jadwalLatihanSchema);
