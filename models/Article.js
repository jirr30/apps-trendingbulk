const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true 
    },
    content: { 
        type: String, 
        required: true 
    }, // Menampung HTML dari CKEditor
    thumbnail: { 
        type: String 
    }, // Path gambar utama (/uploads/...)
    videoUrl: {
        type: String
    }, // Link YouTube Embed
    karya: {
        type: String,
        default: ''
    }, // Nama penulis / karya

    // RELASI MULTI-USER
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // SEO Fields
    slug:            { type: String, default: '' },
    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    metaKeywords:    { type: String, default: '' },
    category:        { type: String, default: '' },
    tags:            { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Article', articleSchema);
