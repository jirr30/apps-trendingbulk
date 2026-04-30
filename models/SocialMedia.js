const mongoose = require('mongoose');

const socialMediaSchema = new mongoose.Schema({
    instagram: { type: String, default: '' },
    twitter:   { type: String, default: '' },
    facebook:  { type: String, default: '' },
    youtube:   { type: String, default: '' },
    tiktok:    { type: String, default: '' },
    whatsapp:  { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('SocialMedia', socialMediaSchema);
