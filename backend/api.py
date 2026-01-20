import os
import eventlet
eventlet.monkey_patch()
import time
import re
import uuid
import traceback
import secrets
from threading import Event
from datetime import datetime, timedelta

from flask import Flask, render_template, request, jsonify, g, abort, redirect, url_for
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from groq import Groq
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# =========================
# Supabase JWT verification (HS256 or RS256)
# =========================
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
JWKS_URL = os.getenv("SUPABASE_JWKS_URL", f"{SUPABASE_URL}/auth/v1/keys" if SUPABASE_URL else "")
ISSUER = f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else ""
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")  # <— tambahkan di .env
DEV_ALLOW_NO_AUTH = os.getenv("DEV_ALLOW_NO_AUTH", "false").strip().lower() == "true"

# Debug: Print environment variables (jangan print secret di production!)
if SUPABASE_JWT_SECRET:
    print(f"[INFO] SUPABASE_JWT_SECRET is set (length: {len(SUPABASE_JWT_SECRET)})")
else:
    print("[WARN] SUPABASE_JWT_SECRET is NOT set in environment variables")
if SUPABASE_URL:
    print(f"[INFO] SUPABASE_URL is set: {SUPABASE_URL}")
else:
    print("[WARN] SUPABASE_URL is NOT set in environment variables")

# Initialize JWKS client only if SUPABASE_URL is set
_jwks_client = None
if SUPABASE_URL and JWKS_URL:
    try:
        _jwks_client = PyJWKClient(JWKS_URL)
    except Exception as e:
        print(f"[WARN] Failed to initialize JWKS client: {e}")

def verify_supabase_jwt(token: str):
    """
    Deteksi algoritma dari header token:
    - RS256  -> verifikasi dengan JWKS publik
    - HS256  -> verifikasi dengan SUPABASE_JWT_SECRET (jika tersedia)
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = (header.get("alg") or "").upper()
    except Exception as e:
        raise Exception(f"invalid_token_header: {e}")

    if alg == "RS256":
        # RS256: pakai JWKS publik
        if not _jwks_client:
            raise Exception("RS256_not_available: SUPABASE_URL not set or JWKS client not initialized")
        try:
            key = _jwks_client.get_signing_key_from_jwt(token).key
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience="authenticated",
                issuer=ISSUER if ISSUER else None,
                options={"require": ["exp", "iat"]},
            )
        except Exception as e:
            raise Exception(f"RS256_verification_failed: {e}")
    elif alg == "HS256":
        # HS256: pakai JWT secret project
        if not SUPABASE_JWT_SECRET:
            raise Exception("missing_SUPABASE_JWT_SECRET_for_HS256: Please set SUPABASE_JWT_SECRET in .env file")
        
        try:
            return jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=ISSUER if ISSUER else None,
                options={"require": ["exp", "iat"]} if ISSUER else {"require": ["exp", "iat"], "verify_signature": True},
            )
        except jwt.ExpiredSignatureError:
            raise Exception("token_expired")
        except jwt.InvalidTokenError as e:
            raise Exception(f"invalid_token: {str(e)}")
        except Exception as e:
            raise Exception(f"HS256_verification_failed: {str(e)}")
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
current_summary_mode = "rapat"  # default

def _now_iso():
    return datetime.utcnow().isoformat() + "Z"

def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()

def build_prompt(text: str, mode: str = "rapat") -> str:
    mode = (mode or "rapat").lower()
    return f"""
Anda adalah seorang notulis rapat yang berpengalaman.
Langsung berikan notulensi final saja, tanpa proses berpikir.
Ikuti format:

**Notulensi Rapat**

**Topik Pembahasan:**
- ...

**Peserta Rapat:**
- ...

**Poin-Poin Penting:**
- ...

**Keputusan yang Diambil:**
- ...

**Action Items / Tugas:**
- (Siapa) - (Apa yang harus dilakukan) - (Deadline)
- ...

**Follow-up / Tindak Lanjut:**
- ...

**Catatan Tambahan:**
- ...

Aturan ketat:
- Hanya ekstrak fakta yang ada pada teks sumber (transkripsi rapat).
- Pertahankan nama orang, tanggal, angka, dan informasi penting persis seperti tertulis.
- Jangan menambah atau mengubah fakta yang tidak ada di teks.
- Buat notulensi yang jelas, terstruktur, dan mudah dipahami.
- Identifikasi action items dengan jelas (siapa, apa, kapan).

Teks sumber (transkripsi rapat):
{text}

Notulensi:
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

# Tambahkan koneksi Supabase
from supabase import create_client, Client
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Tes koneksi singkat ke tabel "documents"
        try:
            res = supabase.table("documents").select("*").limit(1).execute()
            print("[OK] Koneksi Supabase berhasil.")
        except Exception as e:
            print(f"[ERROR] Gagal konek Supabase: {e}")
    except Exception as e:
        print(f"[ERROR] Supabase init failed: {e}")
else:
    print("Supabase credentials not set; supabase client disabled")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
# Pakai model yang lebih cepat secara default
MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet", logger=True, engineio_logger=False)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///share_tokens.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# =========================
# Database Models
# =========================
class ShareToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(32), unique=True, nullable=False, index=True)
    document_id = db.Column(db.String(255), nullable=False)  # Changed to String to match your app
    created_by = db.Column(db.String(255), nullable=False)  # Changed to String to match user ID format
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)
    max_views = db.Column(db.Integer, nullable=True)
    view_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    
    def is_expired(self):
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
    
    def is_view_limit_reached(self):
        if self.max_views is None:
            return False
        return self.view_count >= self.max_views
    
    def can_access(self):
        return self.is_active and not self.is_expired() and not self.is_view_limit_reached()
    
    def increment_view_count(self):
        self.view_count += 1
        db.session.commit()


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

@app.route("/shared/<identifier>", methods=["GET"])
def shared_document(identifier):
    """
    Safe handler: jika identifier valid UUID -> ambil dokumen langsung.
    Jika bukan UUID -> anggap sebagai share token dan fallback.
    """
    try:
        # 1) Jika identifier adalah UUID yang valid, coba query dokumen langsung
        if supabase:
            try:
                uuid.UUID(identifier)  # raises ValueError jika bukan UUID
                res = supabase.table("documents").select("*").eq("id", identifier).limit(1).execute()
                if res and getattr(res, "data", None):
                    return jsonify(res.data[0])
            except ValueError:
                # bukan UUID -> lanjut ke pengecekan token
                pass
            except Exception as e:
                app.logger.debug("Supabase direct id query failed: %s", e)

        # 2) Fallback: treat identifier as share token
        share_token = None
        try:
            share_token = ShareToken.query.filter_by(token=identifier).first()
        except Exception:
            share_token = None

        if not share_token:
            return render_template("shared.html", error="Document not found"), 404

        if not share_token.can_access():
            return render_template("shared.html", error="Share token expired or revoked"), 410

        # Ambil dokumen dari Supabase berdasarkan document_id pada token
        try:
            doc_res = supabase.table("documents").select("*").eq("id", share_token.document_id).limit(1).execute()
            if not doc_res or not getattr(doc_res, "data", None):
                return render_template("shared.html", error="Document not found"), 404
            doc = doc_res.data[0]
        except Exception as e:
            return render_template("shared.html", error=f"Failed to fetch document: {e}"), 500

        # Increment view count and render
        try:
            share_token.increment_view_count()
        except Exception:
            app.logger.debug("Failed to increment share token view count")

        return render_template("shared.html", doc=doc, token=identifier)
    except Exception as e:
        app.logger.exception("shared_document error")
        return jsonify({"error": str(e)}), 500

@app.route("/s/<identifier>")
def s_short_redirect(identifier):
    # redirect ke handler shared_document yang sudah ada
    return redirect(url_for("shared_document", identifier=identifier), code=302)

# =========================
# Database initialization
# =========================
def init_db():
    """Initialize the database tables"""
    with app.app_context():
        db.create_all()
        print("Database tables created successfully!")

# Initialize database on startup
init_db()


# =========================
# Settings routes
# =========================
@app.route("/set_summary_mode", methods=["POST"])
def set_summary_mode():
    global current_summary_mode
    data = request.get_json(force=True, silent=True) or {}
    mode = (data.get("mode") or "rapat").strip().lower()
    # Mode default adalah "rapat" untuk notulensi rapat
    if mode not in ["rapat", "meeting"]:
        mode = "rapat"  # fallback ke default
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
    # Generate UUID untuk ID dokumen dan simpan ke Supabase
    doc_id = str(uuid.uuid4())
    entry["id"] = doc_id
    try:
        res = supabase.table("documents").insert({
            "id": doc_id,
            "user_id": g.user["sub"],
            "text": text,
            "meta": meta,
            "created_at": entry["created_at"]
        }).execute()
    except Exception as e:
        return jsonify({"error": f"Gagal simpan ke Supabase: {e}"}), 500

    # Kembalikan entry beserta share URL (gunakan host runtime)
    share_url = f"{request.host_url.rstrip('/')}/s/{doc_id}"
    return jsonify({"status": "ok", "entry": entry, "share_url": share_url}), 200

@app.route("/api/history", methods=["GET"])
@require_auth
def api_history():
    user_id = g.user["sub"]
    try:
        result = supabase.table("documents").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return jsonify({"history": result.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================
# Share Token API Routes
# =========================
@app.route("/api/share/generate", methods=["POST"])
@require_auth
def generate_share_token():
    """Generate a new share token for a document"""
    data = request.get_json(force=True, silent=True) or {}
    document_id = data.get("document_id")
    expires_days = data.get("expires_days", 7)  # Default 7 days
    max_views = data.get("max_views")  # Optional view limit
    
    if not document_id:
        return jsonify({"error": "document_id is required"}), 400
    
    # Generate unique token
    token = secrets.token_urlsafe(32)
    
    # Calculate expiration date
    expires_at = datetime.utcnow() + timedelta(days=expires_days)
    
    # Create share token
    share_token = ShareToken(
        token=token,
        document_id=document_id,
        created_by=g.user["sub"],
        expires_at=expires_at,
        max_views=max_views
    )
    
    try:
        db.session.add(share_token)
        db.session.commit()
        
        # Generate share URL
        base_url = request.host_url.rstrip('/')
        share_url = f"{base_url}/shared/{token}"
        
        return jsonify({
            "success": True,
            "token": token,
            "share_url": share_url,
            "expires_at": expires_at.isoformat(),
            "max_views": max_views
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create share token: {str(e)}"}), 500

@app.route("/api/share/validate/<token>", methods=["GET"])
def validate_share_token(token):
    """Validate a share token and return document access info"""
    share_token = ShareToken.query.filter_by(token=token).first()
    
    if not share_token:
        return jsonify({"error": "Invalid or expired share token"}), 404
    
    if not share_token.can_access():
        if share_token.is_expired():
            return jsonify({"error": "Share token has expired"}), 410
        elif share_token.is_view_limit_reached():
            return jsonify({"error": "Share token view limit reached"}), 410
        else:
            return jsonify({"error": "Share token is no longer active"}), 410
    
    # Increment view count
    share_token.increment_view_count()
    
    return jsonify({
        "valid": True,
        "document_id": share_token.document_id,
        "created_at": share_token.created_at.isoformat(),
        "expires_at": share_token.expires_at.isoformat() if share_token.expires_at else None,
        "view_count": share_token.view_count,
        "max_views": share_token.max_views
    })

@app.route("/api/share/revoke", methods=["POST"])
@require_auth
def revoke_share_token():
    """Revoke a share token (deactivate it)"""
    data = request.get_json(force=True, silent=True) or {}
    token = data.get("token")
    
    if not token:
        return jsonify({"error": "token is required"}), 400
    
    share_token = ShareToken.query.filter_by(token=token, created_by=g.user["sub"]).first()
    
    if not share_token:
        return jsonify({"error": "Share token not found"}), 404
    
    share_token.is_active = False
    db.session.commit()
    
    return jsonify({"success": True, "message": "Share token revoked"})

@app.route("/api/share/list", methods=["GET"])
@require_auth
def list_share_tokens():
    """List all share tokens created by the current user"""
    user_id = g.user["sub"]
    share_tokens = ShareToken.query.filter_by(created_by=user_id).order_by(ShareToken.created_at.desc()).all()
    
    tokens_data = []
    for token in share_tokens:
        tokens_data.append({
            "id": token.id,
            "token": token.token,
            "document_id": token.document_id,
            "created_at": token.created_at.isoformat(),
            "expires_at": token.expires_at.isoformat() if token.expires_at else None,
            "view_count": token.view_count,
            "max_views": token.max_views,
            "is_active": token.is_active,
            "is_expired": token.is_expired(),
            "can_access": token.can_access()
        })
    
    return jsonify({"tokens": tokens_data})

@app.route("/api/document/<document_id>", methods=["GET"])
def get_document(document_id):
    """Get document data by ID (now using Supabase)"""
    # Validasi: hanya terima UUID yang valid
    try:
        UUID(str(document_id))
    except Exception:
        return jsonify({"error": "Document not found"}), 404

    try:
        result = supabase.table("documents").select("*").eq("id", document_id).execute()
        if not result.data:
            return jsonify({"error": "Document not found"}), 404
        doc = result.data[0]
        return jsonify(doc)
    except Exception as e:
        app.logger.exception("get_document error")
        return jsonify({"error": f"Failed to fetch document: {str(e)}"}), 500




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
