const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['foto', 'video'], required: true },
    source: { type: String, enum: ['upload', 'youtube'], default: 'upload' },
    fileUrl: { type: String, required: true },
    thumbnail: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

gallerySchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Gallery', gallerySchema);
