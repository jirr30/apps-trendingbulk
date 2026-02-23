const Template = require('../models/Template');
const fs = require('fs');
const path = require('path');

// 1. Ambil Semua Data untuk ditampilkan di Frontend
exports.getPublicData = async (req, res) => {
    try {
        const data = await Template.find().sort({ createdAt: -1 });
        // Pastikan nama variabelnya 'templates' agar sesuai dengan index.ejs di atas
        res.render('public_home', { templates: data }); 
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching data");
    }
};


// 2. Simpan Data Baru (Upload)
exports.uploadData = async (req, res) => {
    try {
        const { title, description } = req.body;
        
        // Cek apakah ada file yang diupload
        if (!req.file) {
            return res.status(400).send("Gambar wajib diupload!");
        }

        const newData = new Template({
            title,
            description,
            imageUrl: `/uploads/${req.file.filename}`
        });

        await newData.save();
        res.redirect('/');
    } catch (err) {
        // Jika DB gagal tapi file sudah terlanjur terupload, hapus kembali filenya
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).send("Gagal menyimpan data ke database");
    }
};

// 3. Hapus Data (Hapus Database + Hapus File Fisik)
exports.deleteData = async (req, res) => {
    try {
        const id = req.params.id;
        const item = await Template.findById(id);

        if (!item) {
            return res.status(404).send("Data tidak ditemukan");
        }

        // Jalur file fisik di server (public/uploads/nama-file.jpg)
        const filePath = path.join(__dirname, '../public', item.imageUrl);

        // Hapus file fisik jika ada
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Hapus data dari database
        await Template.findByIdAndDelete(id);
        
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send("Gagal menghapus data");
    }
};
