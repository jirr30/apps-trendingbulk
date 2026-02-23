const mongoose = require('mongoose');
const Article = require('./models/Article');
const Template = require('./models/Template');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trendingbulk')
.then(async () => {
    console.log("Terhubung ke MongoDB. Memulai pembersihan...");

    // Menghapus Artikel yang tidak punya author
    const deletedArticles = await Article.deleteMany({ author: { $exists: false } });
    console.log(`Berhasil menghapus ${deletedArticles.deletedCount} artikel tanpa pemilik.`);

    // Menghapus Template yang tidak punya author
    const deletedTemplates = await Template.deleteMany({ author: { $exists: false } });
    console.log(`Berhasil menghapus ${deletedTemplates.deletedCount} template tanpa pemilik.`);

    console.log("Pembersihan selesai!");
    process.exit();
})
.catch(err => {
    console.error("Koneksi gagal:", err);
    process.exit(1);
});
