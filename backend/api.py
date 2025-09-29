import os
import eventlet
eventlet.monkey_patch()
import time
import re
import uuid
import traceback
from threading import Event
from datetime import datetime

from flask import Flask, render_template, request, jsonify, g, abort
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from groq import Groq
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

# =========================
# Supabase JWT verification (HS256 or RS256)
# =========================
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
JWKS_URL = os.getenv("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/keys")
ISSUER = f"{SUPABASE_URL}/auth/v1"
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")  # <— tambahkan di .env
DEV_ALLOW_NO_AUTH = os.getenv("DEV_ALLOW_NO_AUTH", "false").strip().lower() == "true"

_jwks_client = PyJWKClient(JWKS_URL)

def verify_supabase_jwt(token: str):
    """
    Deteksi algoritma dari header token:
    - RS256  -> verifikasi dengan JWKS publik
    - HS256  -> verifikasi dengan SUPABASE_JWT_SECRET
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = (header.get("alg") or "").upper()
    except Exception as e:
        raise Exception(f"invalid_token_header: {e}")

    if alg == "RS256":
        # RS256: pakai JWKS publik
        key = _jwks_client.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="authenticated",
            issuer=ISSUER,
            options={"require": ["exp", "iat"]},
        )
    elif alg == "HS256":
        # HS256: pakai JWT secret project
        if not SUPABASE_JWT_SECRET:
            raise Exception("missing_SUPABASE_JWT_SECRET_for_HS256")
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=ISSUER,
            options={"require": ["exp", "iat"]},
        )
    else:
        raise Exception(f"unsupported_jwt_alg:{alg or 'unknown'}")


def require_auth(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # DEV BYPASS: hanya untuk debugging lokal!
        if os.getenv("DEV_BYPASS_AUTH") == "1":
            g.user = {"sub": "dev-user", "email": "dev@example.com"}
            return fn(*args, **kwargs)

        auth = request.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1].strip() if auth.startswith("Bearer ") else None
        if not token:
            token = request.args.get("token") or (request.json or {}).get("token")
        if not token:
            abort(401)
        try:
            g.user = verify_supabase_jwt(token)
        except Exception as e:
            app.logger.warning(f"JWT verify failed: {e}")
            abort(401)
        return fn(*args, **kwargs)
    return wrapper



# =========================
# Helpers & Store
# =========================
history_store = []        # in-memory history
authed_sids = {}          # {sid: jwt_payload}
stop_flags = {}           # {sid: Event}
current_summary_mode = "patologi"  # default

def _now_iso():
    return datetime.utcnow().isoformat() + "Z"

def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

def build_prompt(text: str, mode: str = "patologi") -> str:
    mode = (mode or "patologi").lower()
    if mode in ("dokter_hewan"):
        return f"""
Anda adalah seorang dokter hewan berpengalaman.
Langsung berikan ringkasan final saja, tanpa proses berpikir.
Ikuti format:

**Ringkasan Klinis Hewan**

**Identitas Hewan:**
- ...

**Alasan Kunjungan:**
- ...

**Riwayat Medis:**
- ...

**Pemeriksaan Fisik:**
- ...

**Pemeriksaan Penunjang:**
- ...

**Diagnosis / Implikasi:**
- ...

**Rencana Penanganan:**
- ...

**Prognosis:**
- ...

**Rekomendasi / Tindak Lanjut:**
- ...

Aturan ketat:
- Hanya ekstrak fakta yang ada pada teks sumber.
- Pertahankan angka/satuan persis seperti tertulis.
- Jangan menambah atau mengubah fakta yang tidak ada di teks.

Teks sumber:
{text}

Ringkasan:
"""
    else:
        return f"""
Anda adalah seorang dokter patologi berpengalaman.
Langsung berikan ringkasan final saja, tanpa proses berpikir.
Ikuti format:

**Ringkasan Patologi Klinis**

**Jenis Pemeriksaan:**
- ...

**Jenis Spesimen:**
- ...

**Hasil Pemeriksaan Makroskopik:**
- ...

**Hasil PEmeriksaan Mikroskopik:**
- ...

**Diagnosis:**
- ...

**Rekomendasi / Tindak Lanjut:**
- ...

Aturan ketat:
- Hanya ekstrak fakta yang ada pada teks sumber.
- Pertahankan angka/satuan persis seperti tertulis.
- Jangan menambah atau mengubah fakta yang tidak ada di teks.

Teks sumber:
{text}

Ringkasan:
"""

def _parse_retry_after_seconds(message: str):
    try:
        m = re.search(r"in\s+(?:(\d+)m)?(\d+(?:\.\d+)?)s", message)
        if not m:
            return None
        minutes = float(m.group(1)) if m.group(1) else 0.0
        seconds = float(m.group(2))
        return minutes * 60.0 + seconds
    except Exception:
        return None


# =========================
# Config & Init
# =========================
load_dotenv()
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
# Pakai model yang lebih cepat secara default
MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet", logger=True, engineio_logger=False)


# =========================
# Error handler
# =========================
@app.errorhandler(Exception)
def handle_exception(e):
    code = 500
    msg = str(e)
    if isinstance(e, HTTPException):
        code = e.code or 500
        msg = e.description
    return jsonify({"error": msg}), code


# =========================
# Pages
# =========================
@app.route("/")
def base_page():
    return render_template("base.html")

@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")

@app.route("/voice")
def voice_page():
    return render_template("index.html")

@app.route("/history")
@require_auth
def history_page():
    return render_template("history.html", history=history_store)

@app.route("/settings")
def settings_page():
    return render_template("settings.html")


# =========================
# Settings routes
# =========================
@app.route("/set_summary_mode", methods=["POST"])
def set_summary_mode():
    global current_summary_mode
    data = request.get_json(force=True, silent=True) or {}
    mode = (data.get("mode") or "").strip().lower()
    if mode not in ["patologi", "dokter_hewan", "dokter"]:
        return jsonify({"error": "mode_invalid"}), 400
    current_summary_mode = mode
    return jsonify({"status":"ok","mode": current_summary_mode})

@app.route("/get_summary_mode", methods=["GET"])
def get_summary_mode():
    return jsonify({"mode": current_summary_mode})


# =========================
# API Routes
# =========================
@app.route("/test", methods=["GET"])
def test():
    return jsonify({"status": "connected", "message": "Backend is running"})

@app.route("/summarize", methods=["POST"])
@require_auth
def summarize():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    mode = (data.get("mode") or current_summary_mode).strip().lower()
    if not text:
        return jsonify({"error": "Teks kosong"}), 400
    # Teks terlalu pendek → ringkasan singkat agar cepat
    if len(text) < 20:
        return jsonify({"summary": "Teks terlalu pendek untuk diringkas. Tambahkan lebih banyak konteks."}), 200
    if not client:
        return jsonify({"error": "groq_api_key_missing"}), 500

    # Batasi panjang input agar responsif
    if len(text) > 4000:
        text = text[-4000:]
    prompt = build_prompt(text, mode)
    # Kurangi retry agar tidak menunggu terlalu lama
    max_retries, base_sleep, attempt = 1, 1.5, 0
    while True:
        try:
            resp = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=MODEL,
                temperature=0.3,
            )
            summary_raw = (resp.choices[0].message.content or "").strip()
            summary = strip_think(summary_raw)
            return jsonify({"summary": summary, "user": g.user})
        except Exception as e:
            msg = str(e).lower()
            is_rate = "rate limit" in msg or "rate_limit" in msg
            is_conn = any(k in msg for k in ["connection", "timeout", "temporarily"])
            retry_after = _parse_retry_after_seconds(str(e)) or base_sleep
            attempt += 1
            if (is_rate or is_conn) and attempt <= max_retries:
                time.sleep(retry_after * (2 ** (attempt - 1)))
                continue
            return jsonify({"error": str(e)}), 500

@app.route("/save", methods=["POST"])
@require_auth
def save_summary():
    payload = request.get_json(force=True, silent=False) or {}
    text = (payload.get("text") or "").strip()
    meta = payload.get("meta") or {}
    if not text:
        return jsonify({"error": "empty_text"}), 400
    entry = {
        "id": str(uuid.uuid4()),
        "text": text,
        "meta": meta,
        "created_at": _now_iso(),
        "user_id": g.user["sub"],
        "email": g.user.get("email"),
    }
    history_store.insert(0, entry)
    return jsonify({"status": "ok", "entry": entry}), 200

@app.route("/api/history", methods=["GET"])
@require_auth
def api_history():
    user_id = g.user["sub"]
    return jsonify({
        "history": [h for h in history_store if h["user_id"] == user_id]
    })


# =========================
# Socket.IO handlers
# =========================
@socketio.on("connect")
def on_connect(auth):
    # Terima koneksi tanpa token terlebih dahulu (agar polling browser tidak 400)
    # Jika token tersedia, verifikasi dan set payload, jika tidak, klien harus kirim event 'authenticate' setelah connect.
    token = (auth or {}).get("token") if auth else None
    if not token:
        auth_header = request.headers.get("Authorization", "")
        token = request.args.get("token") or (auth_header.split(" ", 1)[1].strip() if auth_header.startswith("Bearer ") else None)
    if token:
        try:
            payload = verify_supabase_jwt(token)
            authed_sids[request.sid] = payload
        except Exception:
            pass
    elif DEV_ALLOW_NO_AUTH:
        authed_sids[request.sid] = {"sub": "dev-user", "email": "dev@example.com"}
    emit("connect_ack", {"ok": True, "authed": request.sid in authed_sids})

@socketio.on("authenticate")
def on_authenticate(data):
    token = (data or {}).get("token")
    if not token:
        if DEV_ALLOW_NO_AUTH:
            authed_sids[request.sid] = {"sub": "dev-user", "email": "dev@example.com"}
            emit("auth_result", {"ok": True, "dev": True})
            return
        emit("auth_result", {"ok": False, "error": "missing_token"})
        return
    try:
        payload = verify_supabase_jwt(token)
        authed_sids[request.sid] = payload
        emit("auth_result", {"ok": True})
    except Exception as e:
        emit("auth_result", {"ok": False, "error": str(e)})

@socketio.on("summarize_stream")
def handle_summarize_stream(data):
    sid = request.sid
    user = authed_sids.get(sid)
    # In development, allow requests without valid JWT to simplify local testing
    if not user and DEV_ALLOW_NO_AUTH:
        user = {"sub": "dev-user", "email": "dev@example.com"}
        authed_sids[sid] = user
    print("[socket] summarize_stream from", sid, "authed=", bool(user))
    if not user:
        socketio.emit("summary_stream", {"error": "unauthorized"}, to=sid)
        return

    text = (data.get("text") or "").strip()
    mode = (data.get("mode") or current_summary_mode).strip().lower()
    if not text:
        socketio.emit("summary_stream", {"error": "Teks kosong"}, to=sid)
        return
    if not client:
        socketio.emit("summary_stream", {"error": "groq_api_key_missing"}, to=sid)
        return
    if len(text) < 20:
        socketio.emit("summary_stream", {
            "final": "Teks terlalu pendek untuk diringkas. Tambahkan lebih banyak konteks.",
            "end": True
        }, to=sid)
        return
    if len(text) > 4000:
        text = text[-4000:]

    prompt = build_prompt(text, mode)
    stop_evt = Event()
    stop_flags[sid] = stop_evt

    def worker():
        collected = []
        try:
            response = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=MODEL,
                temperature=0.3,
                stream=True,
            )
            cnt = 0
            for chunk in response:
                if stop_evt.is_set():
                    break
                try:
                    choice = chunk.choices[0]
                except Exception:
                    continue
                piece = None
                if hasattr(choice, "delta"):
                    piece = getattr(choice.delta, "content", None)
                if not piece and hasattr(choice, "message"):
                    piece = getattr(choice.message, "content", None)

                if piece:
                    collected.append(piece)
                    socketio.emit("summary_stream", {"token": piece}, to=sid)
                    socketio.sleep(0)  # penting utk flush
                    cnt += 1
                    if cnt % 20 == 0:
                        print(f"[socket] sent {cnt} chunks to {sid}")

            final = strip_think(("".join(collected)).strip())
            socketio.emit("summary_stream", {"final": final, "end": True}, to=sid)
        except Exception as e:
            print("[socket] stream error:", e)
            socketio.emit("summary_stream", {"error": str(e), "end": True}, to=sid)
        finally:
            stop_flags.pop(sid, None)
            print("[socket] stream done", sid)

    socketio.start_background_task(worker)

@socketio.on("stop_stream")
def handle_stop_stream():
    sid = request.sid
    if sid in stop_flags:
        stop_flags[sid].set()
    emit("stop_stream")

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    authed_sids.pop(sid, None)
    if sid in stop_flags:
        stop_flags[sid].set()
    print(f"[socket] disconnect SID={sid}")


# =========================
# Main
# =========================
if __name__ == "__main__":
    socketio.run(
        app,
        debug=True,
        use_reloader=False,
        host="127.0.0.1",
        port=int(os.environ.get("PORT", 5001)),
        allow_unsafe_werkzeug=True,
    )
