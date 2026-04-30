const AuditLog = require('../models/AuditLog');

/**
 * logAction — write an audit log entry.
 * Never throws — audit failure must not break the main request flow.
 *
 * @param {object}  req      - Express request (for IP, user-agent, session)
 * @param {string}  action   - e.g. 'login_success', 'delete_payment'
 * @param {string}  [target] - resource type: 'user', 'payment', etc.
 * @param {*}       [targetId]
 * @param {object}  [metadata]
 */
async function logAction(req, action, target = null, targetId = null, metadata = {}) {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.ip
                || null;

        await AuditLog.create({
            userId:    req.session?.userId   || null,
            username:  req.session?.userName || 'anonymous',
            role:      req.session?.role     || 'unknown',
            action,
            target,
            targetId:  targetId != null ? String(targetId) : null,
            ip,
            userAgent: req.headers['user-agent'] || null,
            metadata
        });
    } catch (err) {
        console.error('[AuditLog] Write failed:', err.message);
    }
}

module.exports = { logAction };
