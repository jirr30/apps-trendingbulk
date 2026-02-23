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
    
    // RELASI MULTI-USER
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Merujuk ke Model User
        required: true
    }
}, { 
    // Otomatis membuat field createdAt dan updatedAt
    timestamps: true 
});

module.exports = mongoose.model('Article', articleSchema);
