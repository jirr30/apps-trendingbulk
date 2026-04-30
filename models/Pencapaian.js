const mongoose = require('mongoose');

const pencapaianSchema = new mongoose.Schema({
    namaEvent : { type: String, required: true },
    kategori  : { type: String, default: '' },
    karya     : { type: String, default: '' },
    tahun     : { type: Number, required: true },
    createdBy : { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Pencapaian', pencapaianSchema);
