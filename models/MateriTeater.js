const mongoose = require('mongoose');

const materiTeaterSchema = new mongoose.Schema({
    title:     { type: String, required: true, trim: true },
    content:   { type: String, required: true },
    thumbnail: { type: String },
    videoUrl:  { type: String },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MateriTeater', materiTeaterSchema);
