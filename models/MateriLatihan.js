const mongoose = require('mongoose');

const materiLatihanSchema = new mongoose.Schema({
    nama: { type: String, required: true, trim: true },
    kategori: {
        type: String,
        required: true,
        enum: ['Teknik', 'Fisik', 'Taktik', 'Mental', 'Sparring', 'Lainnya']
    },
    deskripsi: { type: String, trim: true },
    durasi: { type: Number }, // menit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MateriLatihan', materiLatihanSchema);
