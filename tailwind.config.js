/** @type {import('tailwindcss').Config} */
module.exports = {
  // 1. Beritahu Tailwind di mana saja class CSS digunakan
  content: [
    "./views/**/*.ejs",       // Semua file EJS di folder views & subfoldernya
    "./public/js/**/*.js",    // Jika ada manipulasi class lewat JS
    "./src/**/*.{html,js}"    // Jika Anda punya folder src tambahan
  ],
  
  theme: {
    extend: {
      // 2. Tambahkan kustomisasi di sini jika perlu
      colors: {
        // Contoh: Warna branding untuk dashboard NOC Anda
        'noc-blue': '#1e3a8a',
        'noc-dark': '#0f172a',
      },
      fontFamily: {
        // Font yang bersih untuk data-heavy applications
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },

  // 3. Masukkan plugin yang berguna untuk form dan pemrosesan teks
  plugins: [
    require('@tailwindcss/forms'),      // Membuat styling input form lebih mudah
    require('@tailwindcss/typography'), // Untuk styling konten deskripsi panjang
    require('@tailwindcss/aspect-ratio'),
  ],
}
