const mongoose = require('mongoose');

const sekretariatSchema = new mongoose.Schema({
    alamat:      { type: String, default: '' },
    email:       { type: String, default: '' },
    telepon:     { type: String, default: '' },
    mapEmbedUrl: { type: String, default: '' },
    visiMisi: { type: String, default: '' },
    strukturOrganisasi: [
        {
            jabatan:   { type: String, default: '' },
            nama:      { type: String, default: '' },
            divisi:    { type: String, default: '' },
            periode:   { type: String, default: '' },
            foto:      { type: String, default: '' },
            deskripsi: { type: String, default: '' }
        }
    ],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Sekretariat', sekretariatSchema);
