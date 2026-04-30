const mongoose = require('mongoose');

const siteSettingSchema = new mongoose.Schema({
    logoUrl:                  { type: String, default: '' },
    // SEO Global
    siteTitle:                { type: String, default: '' },
    siteDescription:          { type: String, default: '' },
    siteKeywords:             { type: String, default: '' },
    // Google Tools
    gaTrackingId:             { type: String, default: '' },
    searchConsoleVerification:{ type: String, default: '' },
    // Google AdSense
    adsenseAccountVerification: { type: String, default: '' },
    adsensePublisherId:       { type: String, default: '' },
    adsenseAutoCode:          { type: String, default: '' },
    // Pengaturan Registrasi
    registrationOpen: { type: Boolean, default: true },
    maxUsers:         { type: Number, default: 0 }, // 0 = tidak dibatasi
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SiteSetting', siteSettingSchema);
