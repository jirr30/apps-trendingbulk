const mongoose = require('mongoose');

const sejarahSchema = new mongoose.Schema({
    konten:        { type: String, default: '' },
    tahunBerdiri:  { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Sejarah', sejarahSchema);
