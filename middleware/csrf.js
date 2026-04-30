const crypto = require('crypto');

// Paths where CSRF validation is skipped (external webhooks use their own secrets)
const SKIP_PREFIXES = ['/api/'];

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * csrfInit — runs on every request.
 * Ensures session has a CSRF token and exposes it to EJS templates as `csrfToken`.
 */
exports.csrfInit = (req, res, next) => {
    if (!req.session) return next();
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateToken();
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
};

/**
 * csrfProtect — validates CSRF token on state-mutating requests (POST/PUT/PATCH/DELETE).
 * Add this after csrfInit in server.js.
 *
 * Token sources (in priority order):
 *   1. req.body._csrf   (hidden form field)
 *   2. X-CSRF-Token     (AJAX header)
 */
exports.csrfProtect = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    // Skip external webhook / API routes
    if (SKIP_PREFIXES.some(p => req.path.startsWith(p))) return next();

    // Skip multipart/form-data (file uploads)
    // They are protected by session auth + sameSite:strict cookies
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('multipart/form-data')) return next();

    const submitted  = req.body?._csrf || req.headers['x-csrf-token'];
    const sessionTok = req.session?.csrfToken;

    if (!submitted || !sessionTok || submitted !== sessionTok) {
        // AJAX / JSON request — kembalikan JSON 403
        const wantsJson = req.headers.accept?.includes('application/json') ||
                          req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (wantsJson) {
            return res.status(403).json({
                success: false,
                message: 'Token sesi tidak valid atau kedaluwarsa. Muat ulang halaman dan coba lagi.'
            });
        }

        // Sesi sudah habis — arahkan ke login
        if (!req.session?.userId) {
            req.flash('error', 'Sesi Anda telah berakhir. Silakan login kembali.');
            return res.redirect('/login');
        }

        // Sesi masih aktif tapi token stale (tab lama / back button)
        // Regenerate token agar request berikutnya langsung valid
        req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
        const msg = 'Halaman+sudah+kedaluwarsa.+Silakan+coba+lagi.';
        const referer = req.headers.referer || '/';
        const sep = referer.includes('?') ? '&' : '?';
        return res.redirect(`${referer}${sep}error=${msg}`);
    }

    next();
};
