const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Judul wajib diisi'],
        trim: true,
        maxlength: [100, 'Judul tidak boleh lebih dari 100 karakter']
    },
    description: {
        type: String,
        required: [true, 'Deskripsi wajib diisi'],
        trim: true
    },
    imageUrl: {
        type: String,
        required: [true, 'Path gambar wajib ada']
    },
    labelKarya: {
        type: String,
        trim: true,
        default: ''
    },
    labelProduksi: {
        type: String,
        trim: true,
        default: ''
    },

    // SEO Fields
    metaTitle:       { type: String, trim: true, default: '' },
    metaDescription: { type: String, trim: true, default: '' },
    metaKeywords:    { type: String, trim: true, default: '' },
    slug:            { type: String, trim: true, default: '' },

    // RELASI MULTI-USER (Kepemilikan Aset)
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    // Otomatis membuat field createdAt dan updatedAt secara standar
    timestamps: true 
});

// Export model agar bisa digunakan di Controller
module.exports = mongoose.model('Template', TemplateSchema);
