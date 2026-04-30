const mongoose = require('mongoose');

const beritaSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    thumbnail: {
        type: String
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // SEO Fields
    slug:            { type: String, default: '', index: true },
    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    metaKeywords:    { type: String, default: '' },
    category:        { type: String, default: '' },
    tags:            { type: String, default: '' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Berita', beritaSchema);
