"use client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const handleLogin = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Header dengan Login Button */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent">
                NotaKu
              </h1>
            </div>
            <button
              onClick={handleLogin}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Login
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Notulensi Otomatis Rapat
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
              dengan AI
            </span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Ubah percakapan rapat Anda menjadi notulensi profesional secara otomatis menggunakan teknologi 
            Speech-to-Text dan AI Summarization. Hemat waktu, tingkatkan produktivitas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleLogin}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Mulai Sekarang
            </button>
            <a
              href="#cara-penggunaan"
              className="px-8 py-4 bg-white text-gray-700 rounded-lg font-semibold text-lg border-2 border-gray-300 hover:border-blue-600 hover:text-blue-600 transition-all duration-200 shadow-md hover:shadow-lg inline-block text-center"
            >
              Pelajari Lebih Lanjut
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-center text-gray-900 mb-12">
            Fitur Unggulan
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Transkripsi Real-time</h4>
              <p className="text-gray-600 leading-relaxed">
                Transkripsi suara menjadi teks secara real-time menggunakan Web Speech API. 
                Dapatkan hasil transkripsi langsung saat rapat berlangsung.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Ringkasan Otomatis dengan AI</h4>
              <p className="text-gray-600 leading-relaxed">
                Dapatkan ringkasan otomatis dari transkripsi rapat menggunakan teknologi AI. 
                Fokus pada poin-poin penting tanpa harus membaca seluruh transkripsi.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Dashboard & Statistik</h4>
              <p className="text-gray-600 leading-relaxed">
                Pantau aktivitas rapat Anda dengan dashboard yang informatif. 
                Lihat statistik jumlah rapat, kata yang ditranskripsi, dan notulensi yang dibuat.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Pengaturan Fleksibel</h4>
              <p className="text-gray-600 leading-relaxed">
                Sesuaikan bahasa pengenalan suara, sensitivitas mikrofon, dan konfigurasi model AI 
                sesuai kebutuhan Anda.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Riwayat Notulensi</h4>
              <p className="text-gray-600 leading-relaxed">
                Akses semua riwayat notulensi rapat Anda dengan mudah. 
                Fitur pencarian dan filter untuk menemukan notulensi yang Anda butuhkan.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-2 border border-gray-100">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684m0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Export & Share</h4>
              <p className="text-gray-600 leading-relaxed">
                Export notulensi dalam berbagai format atau bagikan dengan tim Anda. 
                Kolaborasi menjadi lebih mudah dengan fitur sharing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cara Penggunaan Section */}
      <section id="cara-penggunaan" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-center text-gray-900 mb-12">
            Cara Penggunaan
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-700 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold shadow-lg">
                1
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Daftar / Login</h4>
              <p className="text-gray-600 leading-relaxed">
                Buat akun baru atau login ke akun yang sudah ada untuk mulai menggunakan aplikasi.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-700 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold shadow-lg">
                2
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Mulai Rekaman</h4>
              <p className="text-gray-600 leading-relaxed">
                Klik tombol "Mulai" untuk memulai perekaman suara rapat. 
                Pastikan mikrofon Anda sudah diaktifkan.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-700 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold shadow-lg">
                3
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Transkripsi Otomatis</h4>
              <p className="text-gray-600 leading-relaxed">
                Aplikasi akan secara otomatis mentranskripsikan suara menjadi teks secara real-time 
                saat rapat berlangsung.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-700 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold shadow-lg">
                4
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-3">Dapatkan Ringkasan</h4>
              <p className="text-gray-600 leading-relaxed">
                AI akan secara otomatis membuat ringkasan dari transkripsi secara real-time. 
                Simpan, export, atau bagikan notulensi Anda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-700 to-blue-500">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-4xl font-bold text-white mb-6">
            Siap Meningkatkan Produktivitas Rapat Anda?
          </h3>
          <p className="text-xl text-blue-100 mb-8">
            Bergabunglah sekarang dan rasakan kemudahan membuat notulensi rapat secara otomatis.
          </p>
          <button
            onClick={handleLogin}
            className="px-10 py-4 bg-white text-blue-600 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
          >
            Mulai Gratis Sekarang
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm">
            © 2024 NotaKu. Dibuat dengan ❤️ untuk meningkatkan produktivitas rapat Anda.
          </p>
        </div>
      </footer>
    </div>
  );
}
