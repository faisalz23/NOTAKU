import os
import time
import re
import uuid
import traceback
from threading import Event
from datetime import datetime
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify, g, abort
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from groq import Groq
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

# =========================
# Supabase JWT verification
# =========================
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
JWKS_URL = os.getenv("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/keys")
ISSUER = f"{SUPABASE_URL}/auth/v1"
_jwks = PyJWKClient(JWKS_URL)

def verify_supabase_jwt(token: str):
    key = _jwks.get_signing_key_from_jwt(token).key
    payload = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience="authenticated",
        issuer=ISSUER,
        options={"require": ["exp", "iat"]},
    )
    return payload

def require_auth(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = auth.split(" ", 1)[1].strip() if auth.startswith("Bearer ") else None
        if not token:
            token = request.args.get("token") or (request.json or {}).get("token")
        if not token:
            abort(401)
        try:
            g.user = verify_supabase_jwt(token)
        except Exception:
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
MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


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
    if not client:
        return jsonify({"error": "groq_api_key_missing"}), 500

    prompt = build_prompt(text, mode)
    max_retries, base_sleep, attempt = 3, 3.0, 0
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
    token = (auth or {}).get("token")
    if not token:
        return False
    try:
        payload = verify_supabase_jwt(token)
    except Exception:
        return False
    authed_sids[request.sid] = payload
    emit("connect_ack", {"ok": True})

@socketio.on("summarize_stream")
def handle_summarize_stream(data):
    sid = request.sid
    user = authed_sids.get(sid)
    if not user:
        emit("summary_stream", {"error": "unauthorized"})
        return
    text = (data.get("text") or "").strip()
    mode = (data.get("mode") or current_summary_mode).strip().lower()
    if not text:
        emit("summary_stream", {"error": "Teks kosong"})
        return
    if not client:
        emit("summary_stream", {"error": "groq_api_key_missing"})
        return

    prompt = build_prompt(text, mode)
    stop_evt = Event()
    stop_flags[sid] = stop_evt
    collected = []
    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=MODEL,
            temperature=0.3,
            stream=True
        )
        for chunk in response:
            if stop_evt.is_set():
                break
            choice = chunk.choices[0]
            text_piece = getattr(choice.delta, "content", None) if hasattr(choice, "delta") else None
            if not text_piece:
                message_obj = getattr(choice, "message", None)
                if message_obj and getattr(message_obj, "content", None):
                    text_piece = message_obj.content
            if text_piece:
                collected.append(text_piece)
                emit("summary_stream", {"token": text_piece})
        final_raw = "".join(collected).strip()
        final_fmt = strip_think(final_raw)
        emit("summary_stream", {"final": final_fmt, "end": True})
    except Exception as e:
        emit("summary_stream", {"error": str(e)})
    finally:
        stop_flags.pop(sid, None)

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
