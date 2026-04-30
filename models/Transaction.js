const mongoose = require('mongoose');

/**
 * Model transaksi lokal di template_db (apps)
 * Data aslinya ada di payments_db (payments server).
 * Model ini menyimpan referensi + status terakhir yang diketahui apps.
 */
const transactionSchema = new mongoose.Schema({
  orderId:          { type: String, required: true, unique: true },
  customerName:     { type: String, required: true, trim: true },
  customerEmail:    { type: String, trim: true },
  customerPhone:    { type: String, trim: true },
  amount:           { type: Number, required: true },
  description:      { type: String, trim: true },
  notes:            { type: String, trim: true },
  // Status terakhir yang di-sync dari payment server
  status:           { type: String, enum: ['pending','success','failed','refund','expired'], default: 'pending' },
  paymentUrl:       { type: String },
  snapToken:        { type: String },
  // Info dari payment server setelah sync
  midtransPaymentType: { type: String },
  midtransVaNumber:    { type: String },
  bank:                { type: String },
  paidAt:              { type: Date },
  // Asal tagihan: 'apps' = dibuat dari sini, 'payments-dashboard' = di-sync dari payments server
  source:           { type: String, default: 'apps' },
  // Data invoice (jika di-sync dari payments dashboard)
  invoiceNumber:    { type: String, trim: true },
  dueDate:          { type: Date },
  // Link langsung ke halaman invoice di portal customer payments server
  portalLink:       { type: String, trim: true },
  items: [{
    description: { type: String },
    qty:         { type: Number },
    unitPrice:   { type: Number },
    subtotal:    { type: Number },
    _id: false
  }],
  // Siapa yang membuat dari sisi apps
  createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Pakai koneksi default (template_db)
module.exports = mongoose.model('Transaction', transactionSchema);
