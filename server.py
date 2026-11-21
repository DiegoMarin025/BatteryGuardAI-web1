"""Servidor de BatteryGuard AI: API del modelo e interfaz web."""
from __future__ import annotations

import argparse
import hashlib
import secrets
import socket
import io
import json
import math
import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
REPO = ROOT / "modelo" if (ROOT / "modelo").exists() else ROOT / "modelo-repo"
WEB = ROOT / "web"
RAW = REPO / "data" / "raw" / "ev_battery_failure_prediction_Dataset.csv"
sys.path.insert(0, str(REPO))

print("[BatteryGuard] Cargando el modelo de IA (puede tardar ~30 s la primera vez)...", flush=True)
t0 = time.perf_counter()
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from src.models import predict as P  # noqa: E402
import asistente  # noqa: E402

asistente.cargar_env()

print(f"[BatteryGuard] Modelo cargado en {time.perf_counter() - t0:.1f} s", flush=True)

VERSION = "1.0.0"

SHOW = [
    "battery_health_percent", "cell_temperature_max", "cell_temperature_avg", "internal_resistance",
    "BMS_warning_count", "previous_faults", "cycle_count", "vehicle_age_years", "abnormal_voltage_events",
    "temperature_variance", "charge_efficiency", "fast_charge_ratio", "cooling_system_health", "state_of_health",
]
SIM = ["battery_health_percent", "cell_temperature_max", "internal_resistance", "BMS_warning_count",
       "previous_faults", "abnormal_voltage_events", "fast_charge_ratio", "cycle_count"]


def anonymize(value) -> str:
    """Identificador anonimo de la bateria."""
    return "BAT-" + hashlib.sha256(str(value).encode()).hexdigest()[:8].upper()


def clean(v):
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    if isinstance(v, str):
        return v
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


class Fleet:
    """Flota de baterias puntuada por el modelo."""

    def __init__(self, df: pd.DataFrame, name: str):
        t = time.perf_counter()
        df = df.copy().reset_index(drop=True)
        ids = df["battery_serial"] if "battery_serial" in df else (df["vehicle_id"] if "vehicle_id" in df else pd.Series(range(len(df))).astype(str))
        df["_id"] = [anonymize(v) if pd.notna(v) else anonymize(f"fila-{i}") for i, v in enumerate(ids)]
        scored = P.predecir_lote(df)
        self.df = scored.set_index("_id", drop=False)
        self.name = name
        self.ms = round((time.perf_counter() - t) * 1000)

    def payload(self) -> dict:
        if getattr(self, "_payload", None) is None:
            self._payload = self._build()
        return dict(self._payload)

    def _build(self) -> dict:
        d = self.df
        n = len(d)

        def col(c, numeric=False):
            if c not in d:
                return [None] * n
            s = pd.to_numeric(d[c], errors="coerce") if numeric else d[c]
            return [clean(v) for v in s.tolist()]

        info = [col("_id"), col("vehicle_id"), col("vehicle_brand"), col("vehicle_model"), col("fleet_or_private"),
                col("battery_chemistry"), col("probabilidad_falla", True), col("vida_util_restante_ciclos", True),
                col("battery_failure", True)]
        feats = [col(f, True) for f in SHOW]
        rows = [[c[i] for c in info] + [[f[i] for f in feats]] for i in range(n)]
        return {"nombre": self.name, "filas": len(d), "tiempo_ms": self.ms, "variables": SHOW, "baterias": rows}

    def record(self, bid: str) -> dict | None:
        if bid not in self.df.index:
            return None
        r = self.df.loc[bid]
        if isinstance(r, pd.DataFrame):
            r = r.iloc[0]
        return {f: clean(r[f]) for f in P.FEATURES if f in r.index and clean(r[f]) is not None}


FLEETS: dict[str, Fleet] = {}
UPLOADS: dict[str, tuple[str, pd.DataFrame]] = {}
EXT_OK = (".csv", ".txt", ".xlsx", ".xlsm", ".xls")


def normalizar_numeros(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte texto con coma decimal a numero."""
    for c in [c for c in df.columns if c in P.NUM and df[c].dtype == object]:
        txt = df[c].astype(str).str.strip().replace({"": None, "nan": None, "None": None})
        vals = txt.dropna()
        if vals.empty:
            continue
        if vals.str.fullmatch(r"-?[\d.]*\d,\d+").mean() > 0.5:
            df[c] = pd.to_numeric(txt.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce").where(txt.notna())
    return df


def read_table(raw: bytes, name: str) -> tuple[pd.DataFrame, str | None]:
    """Lee un archivo CSV o Excel."""
    ext = Path(name).suffix.lower()
    if ext in (".xlsx", ".xlsm", ".xls"):
        hojas = pd.read_excel(io.BytesIO(raw), sheet_name=None, engine="xlrd" if ext == ".xls" else "openpyxl")
        if not hojas:
            raise ValueError("El libro de Excel no tiene hojas.")
        nombre, df = max(hojas.items(), key=lambda kv: sum(c in P.FEATURES for c in map(str, kv[1].columns)))
        df.columns = [str(c).strip() for c in df.columns]
        return normalizar_numeros(df), (nombre if len(hojas) > 1 else None)
    texto = None
    for enc in ("utf-8-sig", "latin-1"):
        try:
            texto = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    df = pd.read_csv(io.StringIO(texto), sep=None, engine="python")
    df.columns = [str(c).strip() for c in df.columns]
    return normalizar_numeros(df), None


_CTX_CACHE: dict = {}


def chat_context_cached(f: "Fleet", bid: str, umbral: float | None) -> dict | None:
    """Contexto del chat con cache por bateria."""
    clave = (id(f), bid, None if umbral is None else round(float(umbral), 3))
    if clave not in _CTX_CACHE:
        if len(_CTX_CACHE) > 200:
            _CTX_CACHE.clear()
        _CTX_CACHE[clave] = chat_context(f, bid, umbral)
    return _CTX_CACHE[clave]


def chat_context(f: "Fleet", bid: str, umbral: float | None) -> dict | None:
    rec = f.record(bid)
    if rec is None:
        return None
    r = f.df.loc[bid]
    if isinstance(r, pd.DataFrame):
        r = r.iloc[0]
    res = P.predecir(rec, umbral_alto=umbral)
    u = umbral if umbral is not None else P.UMBRAL_ALTO
    prob = f.df["probabilidad_falla"]
    med = {}
    for c in SHOW:
        if c in f.df and pd.notna(r.get(c)):
            col = pd.to_numeric(f.df[c], errors="coerce").dropna()
            v = float(r[c])
            med[c] = {"valor": round(v, 3), "mediana_flota": round(float(col.median()), 3), "pct_de_la_flota_con_valor_menor_o_igual": int(round((col <= v).mean() * 100))}
    win = next((e for e in pd.read_csv(REPO / "reports" / "experimentos_clasificacion.csv").to_dict("records") if "ajustado" in e["experimento"]), {})
    return {
        "bateria": {"id": bid, "vehiculo": clean(r.get("vehicle_id")), "marca": clean(r.get("vehicle_brand")), "modelo": clean(r.get("vehicle_model")),
                    "tipo_flota": clean(r.get("fleet_or_private")), "quimica": clean(r.get("battery_chemistry")),
                    "fallo_en_historial": None if "battery_failure" not in r.index else clean(r.get("battery_failure"))},
        "prediccion_del_modelo": {"probabilidad_falla_pct": res.get("probabilidad_falla_pct"), "nivel_riesgo": res.get("nivel_riesgo"),
                                  "vida_util_restante_ciclos": res.get("vida_util_restante_ciclos"), "umbral_alto_pct": round(u * 100, 1),
                                  "umbral_medio_pct": round(min(P.UMBRAL_MEDIO, u) * 100, 1),
                                  "lugar_en_prioridad": int((prob > float(r["probabilidad_falla"])).sum()) + 1, "baterias_en_flota": len(f.df)},
        "factores_shap_top5": res.get("top_factores_detalle", []),
        "mediciones": med,
        "flota": {"nombre": f.name, "baterias": len(f.df), "en_riesgo_alto": int((prob >= u).sum()),
                  "vida_util_mediana_ciclos": clean(f.df["vida_util_restante_ciclos"].median())},
        "modelo_ia": {"nombre": P.CONFIG.get("modelo_falla"), "recall_prueba": clean(win.get("test_recall")), "precision_prueba": clean(win.get("test_precision")),
                      "costo_falla_no_detectada_usd": 45000, "costo_inspeccion_innecesaria_usd": 1500},
    }


def model_info() -> dict:
    rep = REPO / "reports"
    exp = pd.read_csv(rep / "experimentos_clasificacion.csv").to_dict(orient="records")
    vida = pd.read_csv(rep / "experimentos_vida_util.csv").to_dict(orient="records")
    cm = json.loads((rep / "matrices_confusion.json").read_text(encoding="utf-8"))
    schema = P.SCHEMA["numeric_ranges"]
    return {
        "modelo_falla": P.CONFIG.get("modelo_falla"), "modelo_vida_util": P.CONFIG.get("modelo_vida_util"),
        "hiperparametros": P.CONFIG.get("hiperparametros"), "umbral_alto": P.UMBRAL_ALTO, "umbral_medio": P.UMBRAL_MEDIO,
        "n_variables": len(P.FEATURES), "features": P.FEATURES, "experimentos": [{k: clean(v) for k, v in e.items()} for e in exp],
        "vida_util": [{k: clean(v) for k, v in e.items()} for e in vida], "matrices": cm,
        "simulador": {f: schema.get(f) for f in SIM}, "asistente": asistente.estado(),
    }


def quality(df: pd.DataFrame) -> dict:
    found = [f for f in P.FEATURES if f in df.columns]
    issues = []
    for f in [c for c in P.NUM if c in df.columns]:
        num = pd.to_numeric(df[f], errors="coerce")
        bad = int((num.isna() & df[f].notna() & (df[f].astype(str).str.strip() != "")).sum())
        if bad:
            issues.append(f"'{f}': {bad} valores no numericos se trataran como vacios.")
        if f in P.LIMITES_DUROS:
            lo, hi = P.LIMITES_DUROS[f]
            out = int(((num < lo) | (num > hi)).sum())
            if out:
                issues.append(f"'{f}': {out} valores fuera del rango valido [{lo}, {hi}] se trataran como vacios.")
                df.loc[(num < lo) | (num > hi), f] = np.nan
    return {"encontradas": len(found), "total": len(P.FEATURES), "avisos": issues}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("[api] " + (fmt % args) + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=clean).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/api/estado":
                return self._json({"listo": "ref" in FLEETS, "version": VERSION, "modelo": P.CONFIG.get("modelo_falla"), "asistente": asistente.estado()})
            if u.path == "/api/modelo":
                return self._json(model_info())
            if u.path == "/api/flota":
                f = FLEETS.get(q.get("src", "ref"))
                return self._json(f.payload()) if f else self._json({"error": "Flota no encontrada."}, 404)
            if u.path == "/api/bateria":
                f = FLEETS.get(q.get("src", "ref"))
                rec = f.record(q.get("id", "")) if f else None
                if rec is None:
                    return self._json({"status": "error", "errores": ["No se encontro la bateria."]}, 404)
                umb = float(q["umbral"]) if q.get("umbral") else None
                res = P.predecir(rec, umbral_alto=umb)
                res["registro"] = rec
                threading.Thread(target=chat_context_cached, args=(f, q.get("id", ""), umb), daemon=True).start()
                return self._json(res)
        except Exception as exc:
            return self._json({"status": "error", "errores": [f"Error del servidor: {exc}"]}, 500)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        try:
            if u.path == "/api/predecir":
                data = json.loads(self._body() or b"{}")
                f = FLEETS.get(data.get("src", "ref"))
                rec = (f.record(data.get("id", "")) if f else None) or {}
                rec.update(data.get("cambios") or {})
                res = P.predecir(rec, umbral_alto=data.get("umbral"))
                return self._json(res)
            if u.path == "/api/revisar":
                from urllib.parse import unquote
                name = unquote(self.headers.get("X-Archivo", "archivo.csv"))
                if not name.lower().endswith(EXT_OK):
                    return self._json({"status": "error", "errores": ["Formato no soportado. Usa CSV (.csv) o Excel (.xlsx, .xls)."]}, 400)
                raw = self._body()
                try:
                    df, hoja = read_table(raw, name)
                except Exception as exc:
                    return self._json({"status": "error", "errores": [f"No se pudo leer el archivo: {exc}"]}, 400)
                if df.empty:
                    return self._json({"status": "error", "errores": ["El archivo no tiene filas de datos."]}, 400)
                q = quality(df)
                token = secrets.token_hex(8)
                UPLOADS.clear(); UPLOADS[token] = (name, df)
                cols = list(df.columns)
                show = [c for c in ["battery_serial", "vehicle_id", "vehicle_brand", "vehicle_model", "battery_health_percent",
                                    "cell_temperature_max", "internal_resistance", "battery_failure"] if c in cols] or cols[:8]
                vacias = float(df.isna().mean().mean()) if len(cols) else 0.0
                return self._json({"status": "success", "token": token, "archivo": name, "hoja": hoja, "filas": len(df), "columnas": len(cols),
                                   "vacias": round(vacias, 4), "encontradas": q["encontradas"], "total": q["total"], "avisos": q["avisos"],
                                   "tiene_falla": "battery_failure" in cols, "vista_columnas": show,
                                   "vista": [[clean(v) for v in row] for row in df[show].head(6).itertuples(index=False)]})
            if u.path == "/api/lote":
                data = json.loads(self._body() or b"{}")
                item = UPLOADS.get(data.get("token", ""))
                if not item:
                    return self._json({"status": "error", "errores": ["El archivo ya no está disponible; vuelve a cargarlo."]}, 400)
                name, df = item
                if not quality(df)["encontradas"]:
                    return self._json({"status": "error", "errores": ["Ninguna columna coincide con las variables del modelo. Revisa los encabezados."]}, 400)
                FLEETS["upload"] = Fleet(df, name)
                out = FLEETS["upload"].payload()
                out.update({"status": "success"})
                return self._json(out)
            if u.path in ("/api/chat", "/api/chat/stream"):
                data = json.loads(self._body() or b"{}")
                f = FLEETS.get(data.get("src", "ref"))
                ctx = chat_context_cached(f, data.get("id", ""), data.get("umbral")) if f else None
                if ctx is None:
                    return self._json({"status": "error", "errores": ["No se encontró la batería."]}, 404)
                if u.path == "/api/chat":
                    return self._json(asistente.responder(data.get("mensajes") or [], ctx))
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("X-Accel-Buffering", "no")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                try:
                    for tipo, valor in asistente.responder_stream(data.get("mensajes") or [], ctx):
                        self.wfile.write((json.dumps({"t": tipo, "v": valor}, ensure_ascii=False) + "\n").encode("utf-8"))
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
                return
        except Exception as exc:
            return self._json({"status": "error", "errores": [f"Error del servidor: {exc}"]}, 500)
        self._json({"error": "Ruta no encontrada."}, 404)


def warm_up():
    """Carga la flota y el explicador SHAP al iniciar."""
    t = time.perf_counter()
    FLEETS["ref"] = Fleet(pd.read_csv(RAW, low_memory=False), "Dataset de referencia")
    print(f"[BatteryGuard] {len(FLEETS['ref'].df):,} baterias puntuadas en {time.perf_counter() - t:.1f} s", flush=True)
    t = time.perf_counter()
    first = FLEETS["ref"].df.index[0]
    P.predecir(FLEETS["ref"].record(first))
    print(f"[BatteryGuard] Explicaciones SHAP listas ({time.perf_counter() - t:.1f} s)", flush=True)


def main():
    ap = argparse.ArgumentParser(description="BatteryGuard AI")
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    class Servidor(ThreadingHTTPServer):
        allow_reuse_address = os.name != "nt"
        daemon_threads = True

    class Servidor6(Servidor):
        address_family = socket.AF_INET6

    try:
        srv = Servidor((args.host, args.port), Handler)
    except OSError:
        print(f"[BatteryGuard] El puerto {args.port} ya esta en uso: probablemente BatteryGuard ya esta abierto en otra ventana. "
              f"Cierrala o usa: python server.py --port {args.port + 1}", flush=True)
        return
    srv6 = None
    if args.host == "127.0.0.1":
        try:
            srv6 = Servidor6(("::1", args.port), Handler)
        except OSError:
            pass
    warm_up()
    if srv6:
        threading.Thread(target=srv6.serve_forever, daemon=True).start()
    url = f"http://localhost:{args.port}"
    print(f"[BatteryGuard] Listo: abre {url}  (Ctrl+C para detener)", flush=True)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[BatteryGuard] Servidor detenido.")


if __name__ == "__main__":
    main()
