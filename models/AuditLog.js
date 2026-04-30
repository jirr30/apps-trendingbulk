const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username:  { type: String, default: 'anonymous' },
    role:      { type: String, default: 'unknown' },
    action:    { type: String, required: true },
    target:    { type: String, default: null },
    targetId:  { type: String, default: null },
    ip:        { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata:  { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

auditLogSchema.index({ action: 1 });
auditLogSchema.index({ userId: 1 });
// Auto-delete logs older than 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
