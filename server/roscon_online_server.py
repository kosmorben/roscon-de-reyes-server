import json
import os
import random
import re
import string
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "app" / "src" / "main" / "assets" / "web"
DATA_DIR = BASE_DIR / "app" / "src" / "main" / "assets" / "data"
DATA_FILE = DATA_DIR / "base_pack_es.json"
MANIFEST_FILE = DATA_DIR / "themes_manifest.json"
VOICE_DIR = BASE_DIR / "app" / "src" / "main" / "assets" / "voice"
VOICE_PACK_ZIP = BASE_DIR / "voice_pack.zip"

ROSCO_LETTERS = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "L", "M",
    "N", "Ñ", "O", "P", "Q", "R", "S", "T", "U", "V", "X", "Z",
]

DIFF_CONFIG = {
    "facil": {"turnTime": 0, "hints": 4},
    "dificil": {"turnTime": 25, "hints": 2},
}

DEFAULT_THEME = "futbol"
CONTAINS_OK = {"Ñ", "Q", "X", "Z", "U"}
WIKI_WORD_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,14}$")

WIKI_THEME_CATS = {
    "navidad": ["Categoría:Navidad", "Categoría:Gastronomía_navideña", "Categoría:Villancicos", "Categoría:Tradiciones_navideñas"],
    "futbol": ["Categoría:Fútbol", "Categoría:Equipos_de_fútbol_de_España", "Categoría:Futbolistas_de_España", "Categoría:Estadios_de_fútbol_de_España", "Categoría:Terminología_futbolística"],
    "entretenimiento": ["Categoría:Cine", "Categoría:Películas_de_animación", "Categoría:Géneros_musicales", "Categoría:Instrumentos_musicales", "Categoría:Series_de_televisión"],
    "historia": ["Categoría:Historia_de_España", "Categoría:Antiguo_Egipto", "Categoría:Imperio_romano", "Categoría:Países_de_Europa", "Categoría:Capitales_de_Europa", "Categoría:Ríos_de_España"],
    "ciencia": ["Categoría:Astronomía", "Categoría:Elementos_químicos", "Categoría:Mamíferos", "Categoría:Aves", "Categoría:Anatomía_humana", "Categoría:Inventos"],
    "infantil": ["Categoría:Frutas", "Categoría:Animales_domésticos", "Categoría:Cuentos_de_hadas", "Categoría:Colores", "Categoría:Juguetes"],
}

CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def norm_es(s: str) -> str:
    if not s:
        return ""
    s = s.lower().strip().replace("ñ", "\x01")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = s.replace("\x01", "ñ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-zñ0-9\s]", " ", s)).strip()


def sanitize_key(raw_id: str) -> str:
    out = []
    for ch in str(raw_id or ""):
        if ch in ("Ñ", "ñ"):
            out.append("ENYE")
        elif ch.isalnum() or ch in ("_", "-"):
            out.append(ch)
    return "".join(out)


def question_key(q: dict) -> str:
    return f"{q['Letter']}|{norm_es(q['Answer'])}"


def load_themes_manifest() -> dict:
    if not MANIFEST_FILE.exists():
        return {"futbol": {"id": "futbol", "title": "Fútbol", "dataFile": "theme_futbol.json"}}
    rows = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    return {r["id"]: r for r in rows if r.get("id")}


THEMES_MAP = load_themes_manifest()
THEME_CACHE = {}


def load_theme_by_letter(theme_id: str) -> dict:
    tid = theme_id if theme_id in THEMES_MAP else DEFAULT_THEME
    fname = THEMES_MAP[tid].get("dataFile", "theme_futbol.json")
    fpath = DATA_DIR / fname
    if not fpath.exists():
        fpath = DATA_FILE
    mtime = fpath.stat().st_mtime if fpath.exists() else 0
    cached = THEME_CACHE.get(tid)
    if cached and cached["mtime"] == mtime:
        return cached["by_letter"]
    rows = json.loads(fpath.read_text(encoding="utf-8")) if fpath.exists() else []
    by_l = {l: [] for l in ROSCO_LETTERS}
    for q in rows:
        if q.get("Letter") in by_l:
            by_l[q["Letter"]].append(q)
    # Fallback to base_pack_es only if any letter is missing
    if any(len(by_l[l]) == 0 for l in ROSCO_LETTERS) and DATA_FILE.exists():
        base_rows = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        for q in base_rows:
            l = q.get("Letter")
            if l in by_l and len(by_l[l]) == 0:
                by_l[l].append(q)
    THEME_CACHE[tid] = {"mtime": mtime, "by_letter": by_l, "count": len(rows)}
    return by_l


def ensure_voice_pack():
    global VOICE_DIR
    existing = sum(1 for p in VOICE_DIR.glob("*.ogg")) if VOICE_DIR.exists() else 0
    zips = [p for p in (VOICE_PACK_ZIP, BASE_DIR / "voice_navidad.zip") if p.exists()]
    if existing >= 950 or not zips:
        return
    for target_dir in (VOICE_DIR, Path(tempfile.gettempdir()) / "roscon_voice"):
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            for zpath in zips:
                with zipfile.ZipFile(zpath, "r") as zf:
                    for info in zf.infolist():
                        if not info.is_dir():
                            fname = Path(info.filename).name
                            if fname.lower().endswith((".ogg", ".mp3")):
                                (target_dir / fname).write_bytes(zf.read(info))
            VOICE_DIR = target_dir
            print(f"Extracted Fenrir voice pack to {VOICE_DIR}", flush=True)
            return
        except Exception as exc:
            print(f"Voice pack extract fallback ({target_dir}): {exc}", flush=True)


ensure_voice_pack()


def _load_all_questions() -> list:
    seen = set()
    merged = []
    for tid in THEMES_MAP:
        for pool in load_theme_by_letter(tid).values():
            for q in pool:
                k = question_key(q)
                if k not in seen:
                    seen.add(k)
                    merged.append(q)
    if DATA_FILE.exists():
        for q in json.loads(DATA_FILE.read_text(encoding="utf-8")):
            if q.get("Letter") in ROSCO_LETTERS and q.get("Answer") and q.get("Clue"):
                k = question_key(q)
                if k not in seen:
                    seen.add(k)
                    merged.append(q)
    return merged


ALL_QUESTIONS = _load_all_questions()
GLOBAL_BY_LETTER = {l: [] for l in ROSCO_LETTERS}
for _q in ALL_QUESTIONS:
    if _q.get("Letter") in GLOBAL_BY_LETTER:
        GLOBAL_BY_LETTER[_q["Letter"]].append(_q)

DAILY_SCORES_FILE = Path(tempfile.gettempdir()) / "roscon_daily_scores_v2.json"
DAILY_BOARDS = {}
try:
    if DAILY_SCORES_FILE.exists():
        DAILY_BOARDS = json.loads(DAILY_SCORES_FILE.read_text(encoding="utf-8"))
except Exception:
    DAILY_BOARDS = {}


def get_today_es() -> str:
    # Europe/Madrid UTC+1 winter date
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() + 3600))


def save_daily_boards():
    try:
        # Keep recent 14 days so file stays tiny
        keys = sorted(DAILY_BOARDS.keys())[-14:]
        trimmed = {k: DAILY_BOARDS[k] for k in keys}
        DAILY_SCORES_FILE.write_text(json.dumps(trimmed, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def get_daily_leaderboard(date_str: str) -> list:
    entries = list((DAILY_BOARDS.get(date_str) or {}).values())
    entries.sort(key=lambda e: (-int(e.get("correct", 0)), -int(e.get("score", 0)), int(e.get("elapsedSec", 9999))))
    out = []
    for idx, item in enumerate(entries[:25], 1):
        row = dict(item)
        row["rank"] = idx
        out.append(row)
    return out


def build_daily_challenge(date_str: str) -> dict:
    try:
        yr, mo, dy = [int(x) for x in date_str.split("-")]
        day_ordinal = yr * 372 + mo * 31 + dy
    except Exception:
        day_ordinal = int(time.time() // 86400)

    rng_day = random.Random(f"ROSCON_DAILY_V2_{date_str}")
    voiced = get_voiced_keys()
    theme_order = [t for t in ("navidad", "futbol", "entretenimiento", "historia", "ciencia") if t in THEMES_MAP]
    if not theme_order:
        theme_order = list(THEMES_MAP.keys())

    by_letter = {l: [] for l in ROSCO_LETTERS}
    seen = set()
    for tid in theme_order:
        tmap = load_theme_by_letter(tid)
        for l in ROSCO_LETTERS:
            for q in tmap.get(l, []):
                na = norm_es(q.get("Answer", ""))
                if not na or f"{l}|{na}" in seen:
                    continue
                seen.add(f"{l}|{na}")
                by_letter[l].append(q)

    items = []
    used_answers = set()
    for l in ROSCO_LETTERS:
        pool = by_letter[l] or GLOBAL_BY_LETTER.get(l, [])
        if not pool:
            continue
        vpool = [q for q in pool if sanitize_key(q.get("Id", "")) in voiced]
        cands = vpool if vpool else pool
        cands_sorted = sorted(cands, key=lambda q: str(q.get("Id", "")))
        # Deterministic shuffle per letter + rotational index by day_ordinal -> ZERO repeats across consecutive days!
        letter_rng = random.Random(f"ROSCON_DAILY_CYCLE_V2_{l}")
        letter_rng.shuffle(cands_sorted)
        n = len(cands_sorted)
        pick = cands_sorted[day_ordinal % n]
        for offset in range(n):
            cand = cands_sorted[(day_ordinal + offset) % n]
            if norm_es(cand.get("Answer", "")) not in used_answers:
                pick = cand
                break
        used_answers.add(norm_es(pick.get("Answer", "")))
        items.append(pick)

    prize_idx = rng_day.randrange(len(items)) if items else 0
    haba_idx = rng_day.randrange(len(items)) if len(items) <= 1 else (prize_idx + 1 + rng_day.randrange(len(items) - 1)) % len(items)
    return {
        "date": date_str,
        "timeLimit": 180,
        "hints": 3,
        "prizeIndex": prize_idx,
        "habaIndex": haba_idx,
        "questions": items,
    }


def get_voiced_keys() -> set:
    keys = set()
    if VOICE_DIR.exists():
        for p in VOICE_DIR.iterdir():
            if p.suffix.lower() in (".ogg", ".mp3") and p.stat().st_size > 1500:
                keys.add(p.stem)
    return keys


def fetch_unlimited_wiki_questions(theme_id: str, diff: str, exclude_keys: set, count: int = 36) -> list:
    cats = WIKI_THEME_CATS.get(theme_id, WIKI_THEME_CATS["historia"])
    chosen_cats = random.sample(cats, min(2, len(cats)))
    found = []
    seen = set(exclude_keys)

    for cat in chosen_cats:
        if len(found) >= count:
            break
        try:
            q_url = (
                "https://es.wikipedia.org/w/api.php?action=query&generator=categorymembers"
                f"&gcmtitle={urllib.parse.quote(cat)}&gcmnamespace=0&gcmlimit=50"
                "&prop=extracts&exintro=1&explaintext=1&exsentences=1&format=json"
            )
            req = urllib.request.Request(q_url, headers={"User-Agent": "RosconDeReyesOnline/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            pages = list((data.get("query") or {}).get("pages", {}).values())
            random.shuffle(pages)
            for p in pages:
                title = (p.get("title") or "").strip()
                if not WIKI_WORD_RE.match(title):
                    continue
                ans_n = norm_es(title)
                first_l = ans_n[0].upper()
                letter = None
                mode = "StartsWith"
                if first_l in ROSCO_LETTERS:
                    letter = first_l
                else:
                    for cl in CONTAINS_OK:
                        if cl.lower() in ans_n:
                            letter = cl
                            mode = "Contains"
                            break
                if not letter:
                    continue
                key = f"{letter}|{ans_n}"
                if key in seen:
                    continue
                clue = re.sub(r"\([^)]*\)", "", p.get("extract") or "")
                clue = re.sub(r"\s+", " ", clue).strip()
                dot = clue.find(".")
                if dot >= 22:
                    clue = clue[: dot + 1].strip()
                # Strip leading subject "<Title> es/fue ..." so clue doesn't leak answer
                clue = re.sub(
                    r"^[^.,;:]{0,36}" + re.escape(title) + r"[^.,;:]{0,20}\b(es|fue|son|era|se refiere a)\b\s*",
                    "",
                    clue,
                    flags=re.IGNORECASE,
                ).strip()
                if not clue or len(clue) < 22 or len(clue) > 94:
                    continue
                clue_n = norm_es(clue)
                if ans_n in clue_n or (len(ans_n) >= 5 and ans_n[:5] in clue_n):
                    continue
                clue = clue[0].upper() + clue[1:]
                if not clue.endswith("."):
                    clue += "."
                if len(clue) > 95:
                    continue
                seen.add(key)
                found.append({
                    "Id": f"UNLIM_{theme_id.upper()}_{letter}_{int(time.time())}_{len(found)}",
                    "Letter": letter,
                    "Mode": mode,
                    "Category": theme_id,
                    "Clue": clue,
                    "Answer": title,
                    "AcceptedVariants": [],
                    "Difficulty": diff,
                    "PackId": f"unlimited_{theme_id}",
                })
                if len(found) >= count:
                    break
        except Exception:
            continue
    return found


def build_shared_rosco(excluded_keys: set, theme_id: str = DEFAULT_THEME, diff: str = "facil") -> list:
    by_letter = load_theme_by_letter(theme_id)
    voiced = get_voiced_keys()
    chosen = []
    target_diff = "dificil" if diff == "dificil" else "facil"

    banned_answers = set()
    banned_ids = set()
    for k in (excluded_keys or set()):
        ks = str(k)
        if ks.startswith("ans:"):
            banned_answers.add(ks[4:])
        elif ks.startswith("id:"):
            banned_ids.add(ks[3:])
        elif "|" in ks:
            banned_answers.add(ks.split("|", 1)[1])

    def can_use(q: dict) -> bool:
        na = norm_es(q.get("Answer", ""))
        if not na or na in banned_answers:
            return False
        if question_key(q) in excluded_keys:
            return False
        if q.get("Id") and str(q["Id"]) in banned_ids:
            return False
        for v in (q.get("AcceptedVariants") or []):
            nv = norm_es(v)
            if nv and nv in banned_answers:
                return False
        return True

    for l in ROSCO_LETTERS:
        pool = by_letter.get(l, [])
        fresh = [q for q in pool if can_use(q)]
        if not fresh:
            gpool = GLOBAL_BY_LETTER.get(l, [])
            gvoiced = [q for q in gpool if sanitize_key(q.get("Id", "")) in voiced and can_use(q)]
            fresh = gvoiced if gvoiced else [q for q in gpool if can_use(q)]
        if not fresh:
            fresh = [q for q in (GLOBAL_BY_LETTER.get(l, []) or pool) if norm_es(q.get("Answer", "")) not in banned_answers]
        if not fresh:
            continue

        fresh_diff = [
            q for q in fresh
            if (
                (q.get("Difficulty", "facil").lower() in ("dificil", "normal"))
                if target_diff == "dificil"
                else (q.get("Difficulty", "facil").lower() == "facil")
            )
        ]
        diff_pool = fresh_diff if fresh_diff else fresh
        fresh_voiced = [q for q in diff_pool if sanitize_key(q.get("Id", "")) in voiced]
        candidates = fresh_voiced if fresh_voiced else diff_pool
        pick = random.choice(candidates)
        banned_answers.add(norm_es(pick.get("Answer", "")))
        if pick.get("Id"):
            banned_ids.add(str(pick["Id"]))
        for v in (pick.get("AcceptedVariants") or []):
            nv = norm_es(v)
            if nv:
                banned_answers.add(nv)
        chosen.append(pick)
    return chosen


LOCK = threading.RLock()
ROOMS = {}
QUEUE = {}  # playerId -> {playerId, name, diff, playedKeys, joinedAt, lastSeen, matchedRoomCode}


def make_room_code() -> str:
    for _ in range(50):
        code = "".join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in ROOMS:
            return code
    return "".join(random.choice(CODE_CHARS) for _ in range(5))


def make_player_obj(pid: str, name: str, hints: int, seat: int) -> dict:
    clean_name = (name or f"Jugador {seat + 1}").strip()[:18] or f"Jugador {seat + 1}"
    return {
        "playerId": pid,
        "id": seat,
        "name": clean_name,
        "score": 0,
        "correct": 0,
        "wrong": 0,
        "streak": 0,
        "bestStreak": 0,
        "hintsLeft": hints,
        "foundKing": False,
        "foundHaba": False,
    }


def start_match_in_room(room: dict):
    cfg = DIFF_CONFIG.get(room["diff"], DIFF_CONFIG["facil"])
    excluded = set(room.get("excludedKeys", set()))
    rosco = build_shared_rosco(excluded, room.get("theme", DEFAULT_THEME), room.get("diff", "facil"))
    for q in rosco:
        excluded.add(question_key(q))
    room["excludedKeys"] = excluded

    room["items"] = [
        {
            "q": q,
            "status": "pending",
            "revealed": [0] if q.get("Mode") == "StartsWith" else [],
        }
        for q in rosco
    ]
    n = len(room["items"])
    prize_idx = random.randrange(n) if n > 0 else -1
    haba_idx = prize_idx
    while n > 1 and haba_idx == prize_idx:
        haba_idx = random.randrange(n)

    room["prizeIndex"] = prize_idx
    room["habaIndex"] = haba_idx
    room["prizeFound"] = False
    room["habaFound"] = False
    room["currentIndex"] = 0
    room["currentPlayerIndex"] = 0
    room["timeLimit"] = cfg["turnTime"]
    room["turnStartedAt"] = time.time()
    room["lap"] = 1
    room["status"] = "playing"
    room["finishReason"] = ""
    for seat, p in enumerate(room["players"]):
        p["score"] = 0
        p["correct"] = 0
        p["wrong"] = 0
        p["streak"] = 0
        p["bestStreak"] = 0
        p["hintsLeft"] = cfg["hints"]
        p["foundKing"] = False
        p["foundHaba"] = False

    room["eventSeq"] += 1
    room["lastEvent"] = {
        "seq": room["eventSeq"],
        "type": "start",
        "actorIndex": 0,
        "actorName": room["players"][0]["name"],
        "letter": room["items"][0]["q"]["Letter"] if room["items"] else "A",
        "surprise": "none",
        "pts": 0,
    }
    room["version"] += 1
    room["updatedAt"] = time.time()


def serialize_room(room: dict, viewer_pid: str = "") -> dict:
    my_seat = -1
    for i, p in enumerate(room["players"]):
        if p["playerId"] == viewer_pid:
            my_seat = i
            break

    now = time.time()
    time_rem = 0
    if room["status"] == "playing" and room["timeLimit"] > 0:
        elapsed = max(0, int(now - room["turnStartedAt"]))
        time_rem = max(0, room["timeLimit"] - elapsed)

    return {
        "roomCode": room["code"],
        "status": room["status"],
        "diff": room["diff"],
        "version": room["version"],
        "mySeat": my_seat,
        "players": [
            {k: v for k, v in p.items() if k != "playerId"}
            for p in room["players"]
        ],
        "items": room["items"],
        "currentIndex": room["currentIndex"],
        "currentPlayerIndex": room["currentPlayerIndex"],
        "timeLimit": room["timeLimit"],
        "timeRemaining": time_rem,
        "lap": room["lap"],
        "prizeIndex": room["prizeIndex"] if (room["prizeFound"] or room["status"] == "finished") else -1,
        "habaIndex": room["habaIndex"] if (room["habaFound"] or room["status"] == "finished") else -1,
        "prizeFound": room["prizeFound"],
        "habaFound": room["habaFound"],
        "finishReason": room["finishReason"],
        "lastEvent": room["lastEvent"],
    }


def advance_turn_in_room(room: dict, pass_player: bool):
    items = room["items"]
    total = len(items)
    next_idx = -1
    wrapped = False
    for step in range(1, total + 1):
        idx = (room["currentIndex"] + step) % total
        if items[idx]["status"] in ("pending", "passed"):
            next_idx = idx
            wrapped = (room["currentIndex"] + step) >= total
            break
    if next_idx == -1:
        room["status"] = "finished"
        room["finishReason"] = "completed"
        return
    if wrapped:
        room["lap"] += 1
    room["currentIndex"] = next_idx
    if len(room["players"]) > 1 and pass_player:
        room["currentPlayerIndex"] = (room["currentPlayerIndex"] + 1) % len(room["players"])
    room["turnStartedAt"] = time.time()


def apply_room_action(room: dict, player_id: str, action: str, payload: dict) -> tuple[bool, str]:
    seat = -1
    for i, p in enumerate(room["players"]):
        if p["playerId"] == player_id:
            seat = i
            break
    if seat < 0:
        return False, "No perteneces a esta sala."

    if action == "rematch":
        if len(room["players"]) < 2:
            return False, "Falta el segundo jugador."
        start_match_in_room(room)
        return True, "ok"

    if room["status"] != "playing":
        return False, "La partida no está activa."

    if action == "finish":
        room["status"] = "finished"
        room["finishReason"] = "abandoned"
        room["eventSeq"] += 1
        room["lastEvent"] = {
            "seq": room["eventSeq"],
            "type": "finish",
            "actorIndex": seat,
            "actorName": room["players"][seat]["name"],
            "letter": "",
            "surprise": "none",
            "pts": 0,
        }
        room["version"] += 1
        room["updatedAt"] = time.time()
        return True, "ok"

    # Turn-protected actions
    if seat != room["currentPlayerIndex"]:
        # Allow timeout claim only if turn clock genuinely expired
        if action == "timeout" and room["timeLimit"] > 0:
            if (time.time() - room["turnStartedAt"]) < room["timeLimit"] - 1:
                return False, "No es tu turno."
        else:
            return False, "No es tu turno."

    actor = room["players"][room["currentPlayerIndex"]]
    item = room["items"][room["currentIndex"]]
    letter = item["q"]["Letter"]

    if action == "select":
        idx = int(payload.get("index", -1))
        if 0 <= idx < len(room["items"]) and room["items"][idx]["status"] in ("pending", "passed"):
            room["currentIndex"] = idx
            room["version"] += 1
            room["updatedAt"] = time.time()
            return True, "ok"
        return False, "Letra no disponible."

    if action == "hint":
        if actor["hintsLeft"] <= 0:
            return False, "Sin pistas."
        ans_len = len(item["q"]["Answer"])
        hidden = [i for i in range(ans_len) if i not in item["revealed"]]
        if len(hidden) <= 1:
            return False, "No quedan letras por revelar."
        pick = random.choice(hidden)
        item["revealed"].append(pick)
        actor["hintsLeft"] -= 1
        room["eventSeq"] += 1
        room["lastEvent"] = {
            "seq": room["eventSeq"],
            "type": "hint",
            "actorIndex": room["currentPlayerIndex"],
            "actorName": actor["name"],
            "letter": letter,
            "surprise": "none",
            "pts": 0,
        }
        room["version"] += 1
        room["updatedAt"] = time.time()
        return True, "ok"

    if action in ("pass", "timeout"):
        if item["status"] in ("pending", "passed"):
            item["status"] = "passed"
        actor["streak"] = 0
        actor_idx = room["currentPlayerIndex"]
        advance_turn_in_room(room, pass_player=True)
        room["eventSeq"] += 1
        room["lastEvent"] = {
            "seq": room["eventSeq"],
            "type": action,
            "actorIndex": actor_idx,
            "actorName": actor["name"],
            "letter": letter,
            "surprise": "none",
            "pts": 0,
        }
        room["version"] += 1
        room["updatedAt"] = time.time()
        return True, "ok"

    if action == "answer":
        is_correct = bool(payload.get("correct", False))
        surprise = "none"
        pts = 0
        actor_idx = room["currentPlayerIndex"]

        if is_correct:
            item["status"] = "correct"
            actor["correct"] += 1
            actor["streak"] += 1
            actor["bestStreak"] = max(actor["bestStreak"], actor["streak"])
            pts = max(40, 100 - max(0, len(item["revealed"]) - 1) * 20) + min(125, (actor["streak"] - 1) * 25)
            if room["currentIndex"] == room["prizeIndex"] and not room["prizeFound"]:
                room["prizeFound"] = True
                actor["foundKing"] = True
                pts += 500
                surprise = "king"
            elif room["currentIndex"] == room["habaIndex"] and not room["habaFound"]:
                room["habaFound"] = True
                actor["foundHaba"] = True
                pts = max(0, pts - 75)
                surprise = "haba"
            actor["score"] += pts
            advance_turn_in_room(room, pass_player=False)
            ev_type = "correct"
        else:
            item["status"] = "wrong"
            actor["wrong"] += 1
            actor["streak"] = 0
            if room["currentIndex"] == room["habaIndex"] and not room["habaFound"]:
                room["habaFound"] = True
                actor["foundHaba"] = True
                actor["score"] = max(0, actor["score"] - 75)
                surprise = "haba"
            advance_turn_in_room(room, pass_player=True)
            ev_type = "wrong"

        room["eventSeq"] += 1
        room["lastEvent"] = {
            "seq": room["eventSeq"],
            "type": ev_type,
            "actorIndex": actor_idx,
            "actorName": actor["name"],
            "letter": letter,
            "surprise": surprise,
            "pts": pts,
        }
        room["version"] += 1
        room["updatedAt"] = time.time()
        return True, "ok"

    return False, f"Acción desconocida: {action}"


def purge_stale():
    now = time.time()
    for pid in list(QUEUE.keys()):
        if now - QUEUE[pid]["lastSeen"] > 45:
            del QUEUE[pid]
    for code in list(ROOMS.keys()):
        if now - ROOMS[code]["updatedAt"] > 1800:
            del ROOMS[code]


MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
}


class RosconHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Compact access log for API routes only
        if args and "/api/" in str(args[0]) and "/state?" not in str(args[0]) and "/status?" not in str(args[0]):
            print(f"[{time.strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}", flush=True)

    def send_cors_headers(self, cache_control: str = "no-store"):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", cache_control)

    def send_json(self, obj: dict, status: int = 200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def serve_file(self, path: Path):
        if not path.exists() or not path.is_file():
            self.send_json({"ok": False, "error": "Not found"}, 404)
            return
        data = path.read_bytes()
        total = len(data)
        ext = path.suffix.lower()
        mime = MIME_TYPES.get(ext, "application/octet-stream")
        cc = "public, max-age=86400" if ext in (".ogg", ".mp3", ".wav", ".webp", ".png", ".jpg") else "no-store"

        range_hdr = self.headers.get("Range")
        if range_hdr and range_hdr.startswith("bytes="):
            try:
                spec = range_hdr.split("=", 1)[1].split(",")[0].strip()
                s_str, e_str = spec.split("-", 1)
                start = int(s_str) if s_str else 0
                end = int(e_str) if e_str else total - 1
                start = max(0, min(start, total - 1))
                end = max(start, min(end, total - 1))
                chunk = data[start : end + 1]
                self.send_response(206)
                self.send_cors_headers(cc)
                self.send_header("Content-Type", mime)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
                self.send_header("Content-Length", str(len(chunk)))
                self.end_headers()
                self.wfile.write(chunk)
                return
            except Exception:
                pass

        self.send_response(200)
        self.send_cors_headers(cc)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(total))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/health":
            with LOCK:
                purge_stale()
                self.send_json({
                    "ok": True,
                    "questions": len(ALL_QUESTIONS),
                    "voiced": len(get_voiced_keys()),
                    "rooms": len(ROOMS),
                    "queued": sum(1 for q in QUEUE.values() if not q.get("matchedRoomCode")),
                })
            return

        if path == "/api/daily":
            d_str = ((qs.get("date") or [""])[0] or get_today_es()).strip()[:10]
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", d_str):
                d_str = get_today_es()
            with LOCK:
                challenge = build_daily_challenge(d_str)
                board = get_daily_leaderboard(d_str)
            self.send_json({"ok": True, "daily": challenge, "leaderboard": board})
            return

        if path == "/api/daily/leaderboard":
            d_str = ((qs.get("date") or [""])[0] or get_today_es()).strip()[:10]
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", d_str):
                d_str = get_today_es()
            with LOCK:
                board = get_daily_leaderboard(d_str)
            self.send_json({"ok": True, "date": d_str, "leaderboard": board})
            return

        if path == "/api/matchmake/status":
            pid = (qs.get("playerId") or [""])[0]
            with LOCK:
                entry = QUEUE.get(pid)
                if not entry:
                    self.send_json({"ok": True, "status": "idle"})
                    return
                entry["lastSeen"] = time.time()
                code = entry.get("matchedRoomCode")
                if code and code in ROOMS:
                    room = ROOMS[code]
                    del QUEUE[pid]
                    self.send_json({"ok": True, "status": "matched", "room": serialize_room(room, pid)})
                    return
                waiting_count = sum(1 for q in QUEUE.values() if not q.get("matchedRoomCode"))
                self.send_json({"ok": True, "status": "waiting", "waitingCount": waiting_count})
            return

        if path == "/api/room/state":
            code = (qs.get("code") or [""])[0].upper().strip()
            pid = (qs.get("playerId") or [""])[0]
            since_v = int((qs.get("v") or ["-1"])[0])
            with LOCK:
                room = ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "Sala no encontrada."}, 404)
                    return
                cond = room["cond"]
                if room["version"] <= since_v:
                    cond.wait(timeout=3.5)
                if room["version"] <= since_v:
                    self.send_json({"ok": True, "changed": False, "version": room["version"]})
                else:
                    self.send_json({"ok": True, "changed": True, "room": serialize_room(room, pid)})
            return

        # Static web + audio + data for browser Player 2 testing
        if path == "/" or path == "/index.html":
            self.serve_file(WEB_DIR / "index.html")
            return
        if path in ("/privacidad", "/privacy", "/privacy_policy.html"):
            self.serve_file(BASE_DIR / "store_kit" / "privacy_policy.html")
            return
        if path.startswith("/voice/"):
            fname = Path(path).name
            self.serve_file(VOICE_DIR / fname)
            return
        if path.startswith("/data/"):
            fname = Path(path).name
            if fname.endswith(".json"):
                self.serve_file(DATA_DIR / fname)
                return
        rel = path.lstrip("/")
        if rel and ".." not in rel:
            cand = WEB_DIR / rel
            if cand.exists() and cand.is_file():
                self.serve_file(cand)
                return

        self.send_json({"ok": False, "error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json()

        if path == "/api/questions/more":
            theme = str(body.get("theme") or DEFAULT_THEME).strip()
            if theme not in THEMES_MAP:
                theme = DEFAULT_THEME
            diff = body.get("diff") if body.get("diff") in DIFF_CONFIG else "facil"
            exclude = set(body.get("excludeKeys") or [])
            count = min(60, max(12, int(body.get("count") or 36)))
            qs = fetch_unlimited_wiki_questions(theme, diff, exclude, count)
            self.send_json({"ok": True, "theme": theme, "diff": diff, "questions": qs})
            return

        if path == "/api/room/create":
            pid = str(body.get("playerId") or "").strip()
            name = str(body.get("name") or "Jugador 1").strip()
            diff = body.get("diff") if body.get("diff") in DIFF_CONFIG else "facil"
            theme = str(body.get("theme") or DEFAULT_THEME).strip()
            if theme not in THEMES_MAP:
                theme = DEFAULT_THEME
            played = set(body.get("playedKeys") or [])
            if not pid:
                self.send_json({"ok": False, "error": "playerId requerido"}, 400)
                return
            with LOCK:
                purge_stale()
                code = make_room_code()
                cfg = DIFF_CONFIG[diff]
                room = {
                    "code": code,
                    "status": "waiting",
                    "diff": diff,
                    "theme": theme,
                    "players": [make_player_obj(pid, name, cfg["hints"], 0)],
                    "excludedKeys": played,
                    "items": [],
                    "prizeIndex": -1,
                    "habaIndex": -1,
                    "prizeFound": False,
                    "habaFound": False,
                    "currentIndex": 0,
                    "currentPlayerIndex": 0,
                    "timeLimit": cfg["turnTime"],
                    "turnStartedAt": time.time(),
                    "lap": 1,
                    "finishReason": "",
                    "eventSeq": 0,
                    "lastEvent": None,
                    "version": 1,
                    "updatedAt": time.time(),
                    "cond": threading.Condition(LOCK),
                }
                ROOMS[code] = room
                self.send_json({"ok": True, "room": serialize_room(room, pid)})
            return

        if path == "/api/room/join":
            code = str(body.get("roomCode") or "").upper().strip()
            pid = str(body.get("playerId") or "").strip()
            name = str(body.get("name") or "Jugador 2").strip()
            played = set(body.get("playedKeys") or [])
            with LOCK:
                room = ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "Código de sala no encontrado."}, 404)
                    return
                # Rejoin if already in room
                for p in room["players"]:
                    if p["playerId"] == pid:
                        self.send_json({"ok": True, "room": serialize_room(room, pid)})
                        return
                if len(room["players"]) >= 2:
                    self.send_json({"ok": False, "error": "Esta sala ya está llena."}, 409)
                    return
                cfg = DIFF_CONFIG.get(room["diff"], DIFF_CONFIG["facil"])
                room["players"].append(make_player_obj(pid, name, cfg["hints"], 1))
                room["excludedKeys"].update(played)
                start_match_in_room(room)
                room["cond"].notify_all()
                self.send_json({"ok": True, "room": serialize_room(room, pid)})
            return

        if path == "/api/matchmake":
            pid = str(body.get("playerId") or "").strip()
            name = str(body.get("name") or "Jugador").strip()
            diff = body.get("diff") if body.get("diff") in DIFF_CONFIG else "facil"
            theme = str(body.get("theme") or DEFAULT_THEME).strip()
            if theme not in THEMES_MAP:
                theme = DEFAULT_THEME
            played = set(body.get("playedKeys") or [])
            if not pid:
                self.send_json({"ok": False, "error": "playerId requerido"}, 400)
                return
            with LOCK:
                purge_stale()
                # Look for another waiting player with same difficulty & theme
                partner_id = None
                for other_pid, entry in QUEUE.items():
                    if (
                        other_pid != pid
                        and not entry.get("matchedRoomCode")
                        and entry["diff"] == diff
                        and entry.get("theme", DEFAULT_THEME) == theme
                    ):
                        partner_id = other_pid
                        break

                if partner_id:
                    partner = QUEUE[partner_id]
                    code = make_room_code()
                    cfg = DIFF_CONFIG[diff]
                    room = {
                        "code": code,
                        "status": "waiting",
                        "diff": diff,
                        "theme": theme,
                        "players": [
                            make_player_obj(partner["playerId"], partner["name"], cfg["hints"], 0),
                            make_player_obj(pid, name, cfg["hints"], 1),
                        ],
                        "excludedKeys": set(partner["playedKeys"]) | played,
                        "items": [],
                        "prizeIndex": -1,
                        "habaIndex": -1,
                        "prizeFound": False,
                        "habaFound": False,
                        "currentIndex": 0,
                        "currentPlayerIndex": 0,
                        "timeLimit": cfg["turnTime"],
                        "turnStartedAt": time.time(),
                        "lap": 1,
                        "finishReason": "",
                        "eventSeq": 0,
                        "lastEvent": None,
                        "version": 1,
                        "updatedAt": time.time(),
                        "cond": threading.Condition(LOCK),
                    }
                    start_match_in_room(room)
                    ROOMS[code] = room
                    partner["matchedRoomCode"] = code
                    if pid in QUEUE:
                        del QUEUE[pid]
                    self.send_json({"ok": True, "status": "matched", "room": serialize_room(room, pid)})
                    return

                QUEUE[pid] = {
                    "playerId": pid,
                    "name": name,
                    "diff": diff,
                    "theme": theme,
                    "playedKeys": played,
                    "joinedAt": time.time(),
                    "lastSeen": time.time(),
                    "matchedRoomCode": None,
                }
                self.send_json({"ok": True, "status": "waiting"})
            return

        if path == "/api/matchmake/cancel":
            pid = str(body.get("playerId") or "").strip()
            with LOCK:
                QUEUE.pop(pid, None)
            self.send_json({"ok": True})
            return

        if path == "/api/room/action":
            code = str(body.get("roomCode") or "").upper().strip()
            pid = str(body.get("playerId") or "").strip()
            action = str(body.get("action") or "").strip()
            payload = body.get("payload") or {}
            with LOCK:
                room = ROOMS.get(code)
                if not room:
                    self.send_json({"ok": False, "error": "Sala no encontrada."}, 404)
                    return
                ok, msg = apply_room_action(room, pid, action, payload)
                if not ok:
                    self.send_json({"ok": False, "error": msg}, 400)
                    return
                room["cond"].notify_all()
                self.send_json({"ok": True, "room": serialize_room(room, pid)})
            return

        if path == "/api/daily/submit":
            pid = str(body.get("playerId") or "").strip()[:40]
            raw_name = str(body.get("name") or "Jugador").strip()[:16] or "Jugador"
            is_vip = bool(body.get("isVip"))
            d_str = str(body.get("date") or get_today_es()).strip()[:10]
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", d_str):
                d_str = get_today_es()
            if not pid:
                self.send_json({"ok": False, "error": "playerId requerido"}, 400)
                return
            correct = max(0, min(24, int(body.get("correct") or 0)))
            score = max(0, min(15000, int(body.get("score") or 0)))
            elapsed = max(1, min(3600, int(body.get("elapsedSec") or 180)))
            found_king = bool(body.get("foundKing"))

            with LOCK:
                day_map = DAILY_BOARDS.setdefault(d_str, {})
                prev = day_map.get(pid)
                candidate = {
                    "playerId": pid,
                    "name": raw_name,
                    "isVip": is_vip,
                    "correct": correct,
                    "score": score,
                    "elapsedSec": elapsed,
                    "foundKing": found_king,
                    "ts": int(time.time()),
                }
                if prev is None or (
                    (correct, score, -elapsed) > (int(prev.get("correct", 0)), int(prev.get("score", 0)), -int(prev.get("elapsedSec", 9999)))
                ):
                    day_map[pid] = candidate
                    save_daily_boards()
                board = get_daily_leaderboard(d_str)
                all_sorted = sorted(
                    day_map.values(),
                    key=lambda e: (-int(e.get("correct", 0)), -int(e.get("score", 0)), int(e.get("elapsedSec", 9999))),
                )
                my_rank = next((i + 1 for i, e in enumerate(all_sorted) if e["playerId"] == pid), len(all_sorted))
            self.send_json({"ok": True, "date": d_str, "myRank": my_rank, "leaderboard": board})
            return

        self.send_json({"ok": False, "error": "Not found"}, 404)


def main():
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), RosconHandler)
    print(f"Roscon de Reyes Online 1v1 Server listening on http://{host}:{port}", flush=True)
    print(f"Loaded {len(ALL_QUESTIONS)} unique questions | {len(get_voiced_keys())} Fenrir voice clips", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
