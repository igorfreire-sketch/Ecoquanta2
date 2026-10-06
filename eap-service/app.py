"""Publicação autenticada da EAP textual gerada localmente no MS Project."""

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import firebase_admin
from firebase_admin import auth, firestore
from flask import Flask, jsonify, request
from mpp_converter import read_mpp

convert_only = os.environ.get("EAP_CONVERT_ONLY", "").lower() == "true"
firebase_admin.initialize_app(options={"projectId": os.environ.get("GOOGLE_CLOUD_PROJECT", "ecoquanta-c2720")})
db = None if convert_only else firestore.client()
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 31 * 1024 * 1024

OS_CODE = re.compile(r"^\d+\.\d+$")
PREVIEW_ID = re.compile(r"^[0-9a-f]{32}$")
MAX_CHUNK_BYTES = 450_000  # margem abaixo do limite de 1 MiB por documento Firestore
MAX_MPP_BYTES = 30 * 1024 * 1024
MAX_ROWS = 25_000
MAX_CHUNKS = 500
MAX_CELL_CHARS = 10_000
MPP_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.after_request
def cors(response):
    origin = request.headers.get("Origin", "")
    allowed = {item.strip() for item in os.environ.get("EAP_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    if origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


@app.route("/preview/start", methods=["OPTIONS"])
@app.route("/convert", methods=["OPTIONS"])
@app.route("/preview/chunk", methods=["OPTIONS"])
@app.route("/preview/finish", methods=["OPTIONS"])
@app.route("/publish", methods=["OPTIONS"])
def preflight():
    origin = request.headers.get("Origin", "")
    allowed = {item.strip() for item in os.environ.get("EAP_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    return ("", 204) if origin in allowed else ("", 403)


def error(message, status=400):
    return jsonify({"error": message}), status


def caller():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise PermissionError("Entre com sua conta Google para atualizar a EAP.")
    try:
        claims = auth.verify_id_token(header[7:], check_revoked=True)
    except Exception as exc:
        raise PermissionError("Sua sessao Google expirou. Entre novamente.") from exc
    email = str(claims.get("email", "")).strip().lower()
    allowed = {item.strip().lower() for item in os.environ.get("EAP_EDITOR_EMAILS", "").split(",") if item.strip()}
    if not allowed or not claims.get("email_verified") or email not in allowed:
        raise PermissionError("Sua conta não tem permissão para publicar a EAP.")
    return claims["uid"], email


def body_json():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError("Requisição inválida.")
    return value


def preview_ref(preview_id):
    if not PREVIEW_ID.fullmatch(str(preview_id)):
        raise ValueError("Prévia inválida.")
    return db.collection("eapPreviews").document(preview_id)


def checked_preview(data, uid, status):
    expires_at = data.get("expiresAt") if data else None
    if (not data or data.get("uid") != uid or data.get("status") != status
            or not isinstance(expires_at, datetime) or expires_at <= datetime.now(timezone.utc)):
        raise ValueError("Prévia inválida ou expirada. Importe novamente.")


def valid_row(row, os_code):
    if not isinstance(row, list) or len(row) != 19 or any(not isinstance(cell, str) for cell in row):
        raise ValueError("Uma tarefa não possui as 19 colunas esperadas.")
    if any(len(cell) > MAX_CELL_CHARS for cell in row):
        raise ValueError("Uma tarefa possui texto grande demais.")
    code = row[3].strip()
    if not re.fullmatch(re.escape(os_code) + r"(?:\.\d+)*", code):
        raise ValueError("O arquivo contém tarefa fora da OS escolhida.")
    if not row[4].strip():
        raise ValueError(f"A tarefa {code} está sem nome.")


def parsed_date(value):
    value = str(value).strip()
    if not value:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Data inválida: {value[:30]}.")


def handle_exception(exc, action):
    if isinstance(exc, PermissionError):
        return error(str(exc), 403)
    if isinstance(exc, ValueError):
        return error(str(exc), 409)
    app.logger.exception("Falha ao %s EAP", action)
    return error("Operação indisponível. Nenhum dado foi publicado.", 500)


@app.post("/convert")
def convert():
    temporary_path = None
    try:
        caller()
        uploaded = request.files.get("file")
        if uploaded is None or not uploaded.filename or not uploaded.filename.lower().endswith(".mpp"):
            raise ValueError("Selecione um arquivo .mpp do Microsoft Project.")
        with tempfile.NamedTemporaryFile(suffix=".mpp", delete=False) as temporary:
            temporary_path = temporary.name
            signature = uploaded.stream.read(len(MPP_SIGNATURE))
            if signature != MPP_SIGNATURE:
                raise ValueError("O arquivo nao e um Project .mpp valido.")
            temporary.write(signature)
            size = len(signature)
            while block := uploaded.stream.read(1024 * 1024):
                size += len(block)
                if size > MAX_MPP_BYTES:
                    raise ValueError("O arquivo .mpp excede o limite de 30 MB.")
                temporary.write(block)
        rows = read_mpp(temporary_path)
        if len(rows) > MAX_ROWS:
            raise ValueError("O Project excede o limite de 25.000 tarefas.")
        root_name = next(row[4] for row in rows if row[3] == "0")
        return jsonify({"rows": rows, "rootName": root_name})
    except Exception as exc:
        return handle_exception(exc, "converter Project")
    finally:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)


@app.post("/preview/start")
def start():
    try:
        uid, email = caller()
        body = body_json()
        code = str(body.get("os", "")).strip()
        name = str(body.get("osName", "")).strip()
        is_new = body.get("isNew") is True
        if not OS_CODE.fullmatch(code) or not 1 <= len(name) <= 200:
            raise ValueError("Informe o código e o nome da OS.")
        os_doc = db.collection("eapOs").document(code).get()
        if is_new and os_doc.exists:
            raise ValueError("Esta OS já foi criada. Selecione-a na lista para atualizar.")
        if os_doc.exists and not is_new:
            name = str(os_doc.to_dict().get("osName") or name).strip()
        preview_id = uuid4().hex
        db.collection("eapPreviews").document(preview_id).set({
            "uid": uid, "email": email, "os": code, "osName": name, "isNew": is_new,
            "status": "uploading", "nextIndex": 0, "rowCount": 0,
            "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=60),
        })
        return jsonify({"previewId": preview_id})
    except Exception as exc:
        return handle_exception(exc, "iniciar prévia")


@app.post("/preview/chunk")
def chunk():
    try:
        uid, _ = caller()
        body = body_json()
        ref = preview_ref(body.get("previewId"))
        index = body.get("index")
        rows = body.get("rows")
        if not isinstance(index, int) or index < 0 or index >= MAX_CHUNKS or not isinstance(rows, list) or not rows:
            raise ValueError("Parte da EAP inválida.")
        encoded = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_CHUNK_BYTES:
            raise ValueError("Parte da EAP grande demais. Reduza o tamanho da parte.")
        tx = db.transaction()

        @firestore.transactional
        def save(transaction):
            snap = ref.get(transaction=transaction)
            data = snap.to_dict() if snap.exists else None
            checked_preview(data, uid, "uploading")
            chunk_ref = ref.collection("chunks").document(f"{index:08d}")
            if index < data["nextIndex"]:
                existing = chunk_ref.get(transaction=transaction)
                if existing.exists and existing.to_dict().get("rowsJson") == encoded:
                    return
                raise ValueError("Parte repetida diferente da original. Reinicie a importacao.")
            if index != data["nextIndex"]:
                raise ValueError("Partes da EAP fora de ordem. Reinicie a importação.")
            for row in rows:
                valid_row(row, data["os"])
            if data["rowCount"] + len(rows) > MAX_ROWS:
                raise ValueError("A EAP excede o limite de 25.000 tarefas.")
            transaction.set(chunk_ref, {"rowsJson": encoded})
            transaction.update(ref, {"nextIndex": index + 1, "rowCount": data["rowCount"] + len(rows)})

        save(tx)
        return jsonify({"ok": True})
    except Exception as exc:
        return handle_exception(exc, "receber parte")


@app.post("/preview/finish")
def finish():
    try:
        uid, _ = caller()
        body = body_json()
        ref = preview_ref(body.get("previewId"))
        snap = ref.get()
        data = snap.to_dict() if snap.exists else None
        if data and data.get("status") == "ready":
            checked_preview(data, uid, "ready")
            return jsonify({"previewId": ref.id, "os": data["os"], "osName": data["osName"],
                            "version": data["baseVersion"], "sha256": data["sha256"],
                            "rowCount": data["rowCount"]})
        checked_preview(data, uid, "uploading")
        chunks = list(ref.collection("chunks").order_by("__name__").stream())
        if len(chunks) != data["nextIndex"]:
            raise ValueError("Arquivo incompleto. Importe novamente.")
        seen = set()
        root_found = False
        count = 0
        digest = hashlib.sha256()
        for index, doc in enumerate(chunks):
            if doc.id != f"{index:08d}":
                raise ValueError("Parte ausente na EAP.")
            text = doc.to_dict()["rowsJson"]
            digest.update(text.encode("utf-8"))
            for row in json.loads(text):
                valid_row(row, data["os"])
                code = row[3].strip()
                if code in seen:
                    raise ValueError(f"Código de tarefa duplicado: {code}.")
                seen.add(code)
                root_found = root_found or code == data["os"]
                start_date = parsed_date(row[6])
                end_date = parsed_date(row[7])
                if start_date and end_date and start_date > end_date:
                    raise ValueError(f"Datas do plano base invertidas em {code}.")
                count += 1
        if not root_found or count < 2 or count != data["rowCount"]:
            raise ValueError("A OS precisa ter raiz e tarefas válidas.")
        os_doc = db.collection("eapOs").document(data["os"]).get()
        version = int(os_doc.to_dict().get("version", 0)) if os_doc.exists else 0
        if data["isNew"] and os_doc.exists:
            raise ValueError("Esta OS já foi criada. Importe novamente.")
        tx = db.transaction()

        @firestore.transactional
        def mark_ready(transaction):
            current = ref.get(transaction=transaction)
            current_data = current.to_dict() if current.exists else None
            checked_preview(current_data, uid, "uploading")
            if current.update_time != snap.update_time or current_data["nextIndex"] != len(chunks) or current_data["rowCount"] != count:
                raise ValueError("A EAP mudou durante a validacao. Finalize novamente.")
            transaction.update(ref, {"status": "ready", "baseVersion": version, "sha256": digest.hexdigest()})

        mark_ready(tx)
        return jsonify({"previewId": ref.id, "os": data["os"], "osName": data["osName"],
                        "version": version, "sha256": digest.hexdigest(), "rowCount": count})
    except Exception as exc:
        return handle_exception(exc, "finalizar prévia")


@app.post("/publish")
def publish():
    try:
        uid, email = caller()
        body = body_json()
        ref = preview_ref(body.get("previewId"))
        os_code = str(body.get("os", "")).strip()
        if not OS_CODE.fullmatch(os_code):
            raise ValueError("OS inválida.")
        os_ref = db.collection("eapOs").document(os_code)
        audit_ref = db.collection("eapAudit").document()
        tx = db.transaction()

        @firestore.transactional
        def commit(transaction):
            preview_doc = ref.get(transaction=transaction)
            os_doc = os_ref.get(transaction=transaction)
            data = preview_doc.to_dict() if preview_doc.exists else None
            if data and data.get("uid") == uid and data.get("status") == "published":
                current = os_doc.to_dict() if os_doc.exists else {}
                if data.get("os") == os_code and current.get("previewId") == ref.id:
                    return int(current.get("version", 0))
                raise ValueError("Esta previa ja foi publicada e substituida.")
            checked_preview(data, uid, "ready")
            if data["os"] != os_code:
                raise ValueError("A OS da prévia não confere.")
            version = int(os_doc.to_dict().get("version", 0)) if os_doc.exists else 0
            if version != data["baseVersion"] or (data["isNew"] and os_doc.exists):
                raise ValueError("Esta OS mudou desde a prévia. Importe novamente.")
            now = firestore.SERVER_TIMESTAMP
            transaction.set(os_ref, {"os": os_code, "osName": data["osName"],
                "previewId": ref.id, "chunkCount": data["nextIndex"], "rowCount": data["rowCount"],
                "sha256": data["sha256"], "version": version + 1,
                "updatedAt": now})
            transaction.update(ref, {"status": "published", "expiresAt": firestore.DELETE_FIELD})
            transaction.set(audit_ref, {"os": os_code, "osName": data["osName"],
                "version": version + 1, "previewId": ref.id, "chunkCount": data["nextIndex"],
                "sha256": data["sha256"], "byUid": uid, "byEmail": email, "at": now})
            return version + 1

        version = commit(tx)
        return jsonify({"ok": True, "os": os_code, "version": version})
    except Exception as exc:
        return handle_exception(exc, "publicar")
