# Setup Instructions untuk Voice-to-Text App

## Masalah: Real-time Summarization Tidak Muncul

### ⚠️ ERROR: "unauthorized" - Backend tidak memiliki GROQ_API_KEY

**Masalah Utama:** Backend memerlukan `GROQ_API_KEY` untuk AI summarization, tapi file `.env` tidak ada.

### Langkah Troubleshooting:

1. **Buat file `.env` di folder `backend/`** dengan konfigurasi berikut:

```env
# Groq API Configuration
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant

# Supabase Configuration (opsional untuk development)
SUPABASE_URL=your_supabase_url_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here

# Development Settings (PENTING!)
DEV_ALLOW_NO_AUTH=true
DEV_BYPASS_AUTH=1

# Server Configuration
PORT=5001
```

**Cara Membuat File .env:**
1. Buka folder `backend/`
2. Buat file baru bernama `.env` (tanpa ekstensi)
3. Copy-paste konfigurasi di atas
4. Ganti `gsk_your_actual_groq_api_key_here` dengan API key Groq yang sebenarnya

2. **Dapatkan Groq API Key:**
   - Kunjungi https://console.groq.com/
   - Buat akun dan dapatkan API key
   - Masukkan ke file `.env`

3. **Jalankan aplikasi:**
   ```bash
   npm run dev
   ```

4. **Buka Developer Console** (F12) dan periksa log:
   - `✅ Socket connected successfully` - koneksi berhasil
   - `🔄 scheduleAutoSummarize called` - auto-summarize dipanggil
   - `📝 Requesting auto-summarize` - request dikirim
   - `📡 Received summary_stream data` - data diterima

### Debug Steps:

1. **Periksa koneksi Socket.IO:**
   - Status di UI harus menunjukkan "🟢 Terhubung"
   - Jika "🔴 Terputus" atau "🟡 Error", periksa backend

2. **Periksa auto-summarize:**
   - Mulai recording dengan tombol "Mulai"
   - Bicara beberapa kata
   - Periksa console untuk log auto-summarize

3. **Test manual summarization:**
   - Ketik beberapa kata di textarea
   - Tekan Ctrl+Enter untuk trigger manual

### Kemungkinan Masalah:

1. **GROQ_API_KEY tidak ada** - Backend akan error saat mencoba summarize
2. **Socket.IO tidak connect** - Periksa apakah backend berjalan di port 5001
3. **Auto-summarize disabled** - Periksa `autoSummarizeEnabled` di kode
4. **Text terlalu pendek** - Auto-summarize hanya trigger jika text > 10 karakter

### Environment Variables yang Diperlukan:

- `GROQ_API_KEY` (WAJIB) - untuk AI summarization
- `DEV_ALLOW_NO_AUTH=true` (WAJIB) - untuk bypass authentication di development
- `DEV_BYPASS_AUTH=1` (WAJIB) - untuk bypass authentication di development
