const Transaction = require('../models/Transaction');
const { createPayment, getPaymentStatus, getPortalUrl } = require('../config/paymentsClient');
const { logAction } = require('../middleware/auditLog');

const CALLBACK_SECRET = process.env.PAYMENTS_CALLBACK_SECRET;

function genOrderId() {
  const ts = Date.now().toString().slice(-7);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `SAPHALTA-${ts}-${rand}`;
}

// GET /admin/payments
exports.index = async (req, res) => {
  try {
    const { status, q, page = 1 } = req.query;
    const limit = 15;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { orderId:      { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { customerEmail:{ $regex: q, $options: 'i' } }
      ];
    }

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [transactions, totalCount, stats] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter),
      Transaction.aggregate([{ $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }],
        revenueMonth: [
          { $match: { status: 'success', paidAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]
      }}])
    ]);

    const sm = {};
    (stats[0].byStatus || []).forEach(s => { sm[s._id] = s; });
    const summary = {
      revenueMonth: stats[0].revenueMonth[0] ? Math.round(stats[0].revenueMonth[0].total) : 0,
      totalPaid:    sm.success ? Math.round(sm.success.total) : 0,
      countPaid:    sm.success ? sm.success.count : 0,
      countPending: sm.pending ? sm.pending.count : 0
    };

    res.render('admin_payments', {
      pageTitle: 'Pembayaran',
      userName: req.session.userName,
      isSuperAdmin: req.session.role === 'superadmin',
      transactions, totalCount, summary,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: parseInt(page),
      filters: { status, q },
      success: req.flash('success')[0] || null,
      error:   req.flash('error')[0]   || null,
      clientKey:    process.env.MIDTRANS_CLIENT_KEY,
      isProduction: process.env.MIDTRANS_PRODUCTION === 'true',
      paymentsServerUrl: process.env.PAYMENTS_API_URL || 'https://payments.trendingbulk.top',
      getPortalUrl
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Gagal memuat data pembayaran.');
    res.redirect('/dashboard');
  }
};

// GET /admin/payments/create
exports.createForm = (req, res) => {
  res.render('admin_payment_create', {
    pageTitle: 'Buat Payment Link',
    userName: req.session.userName,
    isSuperAdmin: req.session.role === 'superadmin',
    transaction: null,
    suggestedOrderId: genOrderId(),
    error: req.flash('error')[0] || null
  });
};

// POST /admin/payments/create
exports.store = async (req, res) => {
  const { orderId, customerName, customerEmail, customerPhone, amount, description, notes } = req.body;

  try {
    const exists = await Transaction.findOne({ orderId });
    if (exists) {
      return res.render('admin_payment_create', {
        pageTitle: 'Buat Payment Link',
        userName: req.session.userName,
        isSuperAdmin: req.session.role === 'superadmin',
        transaction: req.body,
        suggestedOrderId: genOrderId(),
        error: `Order ID "${orderId}" sudah digunakan.`
      });
    }

    // Kirim request ke payment server
    const result = await createPayment({ orderId, customerName, customerEmail, customerPhone, amount, description });

    // Simpan referensi lokal di template_db
    const trx = await Transaction.create({
      orderId,
      customerName, customerEmail, customerPhone,
      amount: parseFloat(amount) || 0,
      description, notes,
      status: 'pending',
      paymentUrl: result.data.paymentUrl,
      snapToken:  result.data.snapToken,
      source:     'apps',
      createdBy:  req.session.userId
    });

    req.flash('success', 'Payment link berhasil dibuat via payment server.');
    res.redirect(`/admin/payments/${trx._id}`);
  } catch (err) {
    console.error('Payment server error:', err);
    const msg = err.response?.message || err.message || 'Gagal menghubungi payment server.';
    res.render('admin_payment_create', {
      pageTitle: 'Buat Payment Link',
      userName: req.session.userName,
      isSuperAdmin: req.session.role === 'superadmin',
      transaction: req.body,
      suggestedOrderId: genOrderId(),
      error: msg
    });
  }
};

// GET /admin/payments/:id
exports.detail = async (req, res) => {
  try {
    const trx = await Transaction.findById(req.params.id);
    if (!trx) { req.flash('error', 'Transaksi tidak ditemukan.'); return res.redirect('/admin/payments'); }

    res.render('admin_payment_detail', {
      pageTitle: `Payment #${trx.orderId}`,
      userName: req.session.userName,
      isSuperAdmin: req.session.role === 'superadmin',
      trx,
      success: req.flash('success')[0] || null,
      error:   req.flash('error')[0]   || null,
      clientKey:    process.env.MIDTRANS_CLIENT_KEY,
      isProduction: process.env.MIDTRANS_PRODUCTION === 'true',
      paymentsServerUrl: process.env.PAYMENTS_API_URL || 'https://payments.trendingbulk.top',
      portalUrl: getPortalUrl(trx.customerEmail)
    });
  } catch (err) {
    res.redirect('/admin/payments');
  }
};

// POST /admin/payments/:id/check-status — sync status dari payment server
exports.checkStatus = async (req, res) => {
  try {
    const trx = await Transaction.findById(req.params.id);
    if (!trx) return res.redirect('/admin/payments');

    const result = await getPaymentStatus(trx.orderId);
    const data   = result.data;

    // Update status lokal
    trx.status              = data.status;
    trx.midtransPaymentType = data.midtransPaymentType;
    trx.midtransVaNumber    = data.midtransVaNumber;
    trx.bank                = data.bank;
    if (data.paidAt) trx.paidAt = new Date(data.paidAt);
    await trx.save();

    req.flash('success', `Status diperbarui: ${data.status}`);
    res.redirect(`/admin/payments/${trx._id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Gagal cek status dari payment server.');
    res.redirect(`/admin/payments/${req.params.id}`);
  }
};

// POST /admin/payments/:id/delete
exports.destroy = async (req, res) => {
  try {
    const trx = await Transaction.findById(req.params.id);
    if (!trx) {
      req.flash('error', 'Transaksi tidak ditemukan.');
      return res.redirect('/admin/payments');
    }
    await logAction(req, 'payment_delete', 'payment', trx._id, {
      orderId:      trx.orderId,
      invoiceNumber: trx.invoiceNumber || null,
      amount:       trx.amount,
      status:       trx.status,
      customerName: trx.customerName
    });
    await trx.deleteOne();
    req.flash('success', 'Transaksi dihapus dari daftar lokal.');
    res.redirect('/admin/payments');
  } catch (err) {
    console.error('[PaymentDelete]', err);
    req.flash('error', 'Gagal menghapus transaksi.');
    res.redirect('/admin/payments');
  }
};

// GET /payment/finish|error|pending — callback dari Midtrans (wajib login)
exports.callbackPage = (req, res) => {
  const isLoggedIn = !!(req.session && req.session.userId);
  const type = req.path.split('/').pop();
  const siteSetting = res.locals.siteSetting || {};
  if (!isLoggedIn) {
    const redirectTo = req.originalUrl;
    return res.render('payment_callback', { type, query: req.query, siteSetting, notLoggedIn: true, redirectTo, loginError: req.flash('error')[0] || null });
  }
  res.render('payment_callback', { type, query: req.query, siteSetting, notLoggedIn: false, redirectTo: null, loginError: null });
};


// POST /api/payment-callback — webhook dari payments server (auto-sync status)
exports.handleCallback = async (req, res) => {
  try {
    // Validasi secret
    const secret = req.headers['x-callback-secret'];
    if (!CALLBACK_SECRET || secret !== CALLBACK_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const { orderId, status, midtransPaymentType, midtransVaNumber, bank, paidAt } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: 'orderId dan status wajib ada.' });
    }

    const trx = await Transaction.findOne({ orderId });
    if (!trx) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    trx.status = status;
    if (midtransPaymentType) trx.midtransPaymentType = midtransPaymentType;
    if (midtransVaNumber)    trx.midtransVaNumber    = midtransVaNumber;
    if (bank)                trx.bank                = bank;
    if (paidAt)              trx.paidAt              = new Date(paidAt);

    await trx.save();
    console.log(`[PaymentCallback] ${orderId} → ${status}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[PaymentCallback] Error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /tagihan/:orderId/print — cetak invoice (wajib login)
exports.tagihanPrint = async (req, res) => {
  if (!(req.session && req.session.userId)) {
    return res.redirect(`/login?redirect_to=/tagihan/${req.params.orderId}/print`);
  }
  try {
    const trx = await Transaction.findOne({ orderId: req.params.orderId });
    if (!trx) return res.status(404).send('Transaksi tidak ditemukan.');

    // Selalu render invoice customer lokal — tidak redirect ke payments server
    const siteSetting = res.locals.siteSetting || {};
    const printPortalUrl = trx.portalLink || getPortalUrl(trx.customerEmail);
    res.render('tagihan_print', { trx, siteSetting, portalUrl: printPortalUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
};

// GET /tagihan/:orderId — halaman tagihan
// Untuk transaksi dari payments-dashboard yang punya paymentUrl: redirect langsung (tanpa login)
// Untuk transaksi dari apps: wajib login
exports.tagihanPage = async (req, res) => {
  const isLoggedIn = !!(req.session && req.session.userId);
  const redirectTo = req.originalUrl;
  const siteSetting = res.locals.siteSetting || {};
  const commonVars = { siteSetting, clientKey: process.env.MIDTRANS_CLIENT_KEY, isProduction: process.env.MIDTRANS_PRODUCTION === 'true' };

  try {
    const trx = await Transaction.findOne({ orderId: req.params.orderId });

    // Transaksi dari payments-dashboard → arahkan ke portal invoice (lebih informatif)
    // Priority: portalLink > paymentUrl (untuk yg belum lunas) > portal login
    if (trx && trx.source === 'payments-dashboard') {
      if (trx.portalLink) return res.redirect(trx.portalLink);
      if (trx.paymentUrl && trx.status !== 'success') return res.redirect(trx.paymentUrl);
      if (trx.customerEmail) return res.redirect(getPortalUrl(trx.customerEmail));
      return res.redirect(`${process.env.PAYMENTS_API_URL || 'https://payments.trendingbulk.top'}/portal/login`);
    }

    if (!isLoggedIn) {
      return res.render('tagihan', { ...commonVars, trx: null, notFound: false, notLoggedIn: true, redirectTo, loginError: req.flash('error')[0] || null });
    }

    if (!trx) {
      return res.status(404).render('tagihan', { ...commonVars, trx: null, notFound: true, notLoggedIn: false, redirectTo: null, loginError: null });
    }

    res.render('tagihan', { ...commonVars, trx, notFound: false, notLoggedIn: false, redirectTo: null, loginError: null });
  } catch (err) {
    console.error(err);
    res.status(500).render('tagihan', { ...commonVars, trx: null, notFound: true, notLoggedIn: false, redirectTo: null, loginError: null });
  }
};

// GET /admin/payments/export/csv
exports.exportCsv = async (req, res) => {
  try {
    const { status, q, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.$or = [
      { orderId: { $regex: q, $options: 'i' } },
      { customerName: { $regex: q, $options: 'i' } }
    ];
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to + 'T23:59:59');
    }

    const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).lean();

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Order ID','Invoice','Customer','Email','Telepon','Nominal','Status','Sumber','Dibuat','Dibayar'];
    const rows = transactions.map(t => [
      escape(t.orderId),
      escape(t.invoiceNumber || ''),
      escape(t.customerName),
      escape(t.customerEmail || ''),
      escape(t.customerPhone || ''),
      t.amount || 0,
      escape(t.status),
      escape(t.source || 'apps'),
      escape(new Date(t.createdAt).toLocaleDateString('id-ID')),
      escape(t.paidAt ? new Date(t.paidAt).toLocaleDateString('id-ID') : '')
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const filename = `transactions-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('[ExportCSV]', err);
    res.status(500).send('Gagal export.');
  }
};

// POST /api/payment-sync — terima & upsert data invoice dari payments.trendingbulk.top
exports.handleSync = async (req, res) => {
  try {
    // Validasi secret
    const secret = req.headers['x-callback-secret'];
    if (!CALLBACK_SECRET || secret !== CALLBACK_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const {
      orderId, invoiceNumber, customerName, customerEmail, customerPhone,
      amount, description, notes, status, paymentLink, portalLink, dueDate, paidAt,
      items, source
    } = req.body;

    if (!orderId || !customerName || !amount) {
      return res.status(400).json({ success: false, message: 'orderId, customerName, dan amount wajib ada.' });
    }

    // Upsert: update jika sudah ada, insert jika belum
    const update = {
      customerName,
      customerEmail:  customerEmail  || undefined,
      customerPhone:  customerPhone  || undefined,
      amount:         Number(amount),
      description:    description    || undefined,
      notes:          notes          || undefined,
      status:         ['pending','success','failed','refund','expired'].includes(status) ? status : 'pending',
      paymentUrl:     paymentLink    || undefined,
      portalLink:     portalLink     || undefined,
      invoiceNumber:  invoiceNumber  || orderId,
      dueDate:        dueDate        ? new Date(dueDate) : undefined,
      paidAt:         paidAt         ? new Date(paidAt)  : undefined,
      items:          Array.isArray(items) ? items : [],
      source:         source         || 'payments-dashboard'
    };

    // Hapus field undefined agar tidak overwrite nilai existing dengan undefined
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const existed = await Transaction.exists({ orderId });

    await Transaction.findOneAndUpdate(
      { orderId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const action = existed ? 'updated' : 'created';
    console.log(`[PaymentSync] orderId=${orderId} status=${update.status} → ${action}`);
    res.json({ success: true, orderId, action });
  } catch (err) {
    console.error('[PaymentSync] Error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
