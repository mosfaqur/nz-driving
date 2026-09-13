import sqlite3, json, os, hashlib, secrets
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "study_tracker.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, key_hex = stored_hash.split("$", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return secrets.compare_digest(key.hex(), key_hex)
    except Exception:
        return False

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        email TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Auto-migration for existing databases: ensure email column exists
    cursor.execute("PRAGMA table_info(users)")
    user_cols = [col[1] for col in cursor.fetchall()]
    if "email" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
    
    # 2. User Sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        session_token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    
    # 3. User Question Progress table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_question_progress (
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        status TEXT DEFAULT 'unseen', -- 'unseen', 'learning', 'mastered'
        bookmarked INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        incorrect_count INTEGER DEFAULT 0,
        last_tested TIMESTAMP,
        notes TEXT DEFAULT '',
        PRIMARY KEY (user_id, question_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    
    # 4. User Test History table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_test_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        test_type TEXT DEFAULT 'mock_35',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        score INTEGER,
        total_questions INTEGER DEFAULT 35,
        time_spent_seconds INTEGER,
        passed INTEGER,
        section_scores TEXT,
        answers_json TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()

# =============================================================================
# USER AUTHENTICATION & SESSION MANAGEMENT
# =============================================================================

def create_user(username: str, password: str, display_name: str = None, email: str = None) -> dict:
    username = username.strip().lower()
    email = (email or "").strip().lower()
    if len(username) < 2 or len(username) > 30:
        raise ValueError("Username must be between 2 and 30 characters.")
    if not username.replace("_", "").isalnum():
        raise ValueError("Username may only contain letters, numbers, and underscores.")
    if len(password) < 4:
        raise ValueError("Password must be at least 4 characters long.")
    if email and ("@" not in email or "." not in email):
        raise ValueError("Please provide a valid email address.")
        
    display_name = (display_name.strip() if display_name else "") or username.capitalize()
    pwd_hash = hash_password(password)
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (username, password_hash, display_name, email)
            VALUES (?, ?, ?, ?)
        """, (username, pwd_hash, display_name, email))
        user_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError(f"Username '{username}' is already registered. Please choose another or log in.")
    finally:
        conn.close()
        
    return {"id": user_id, "username": username, "display_name": display_name, "email": email}

def authenticate_user(username: str, password: str) -> dict:
    username = username.strip().lower()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, username, password_hash, display_name, email 
        FROM users 
        WHERE username = ? OR (email != '' AND email = ?)
    """, (username, username))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not verify_password(password, row["password_hash"]):
        return None
        
    return {"id": row["id"], "username": row["username"], "display_name": row["display_name"], "email": row["email"]}

def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    expires = (now + timedelta(days=60)).isoformat()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_sessions (session_token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user_id, now.isoformat(), expires))
    conn.commit()
    conn.close()
    return token

def get_user_by_session(session_token: str) -> dict:
    if not session_token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.display_name, u.email, u.created_at
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ?
    """, (session_token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id: int) -> dict:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, display_name, email, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_default_user() -> dict:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, display_name, email, created_at FROM users ORDER BY id ASC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(session_token: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_sessions WHERE session_token = ?", (session_token,))
    conn.commit()
    conn.close()

def list_all_users() -> list:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.display_name, u.email, u.created_at,
               (SELECT COUNT(*) FROM user_question_progress p WHERE p.user_id = u.id AND p.status = 'mastered') as mastered_count,
               (SELECT COUNT(*) FROM user_test_history t WHERE t.user_id = u.id) as tests_taken
        FROM users u
        ORDER BY u.id ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# =============================================================================
# PER-USER STUDY PROGRESS & TRACKING
# =============================================================================

def get_all_progress(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_question_progress WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return {r["question_id"]: dict(r) for r in rows}

def update_question_status(user_id: int, question_id: int, status: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_question_progress (user_id, question_id, status)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, question_id) DO UPDATE SET status = excluded.status
    """, (user_id, question_id, status))
    conn.commit()
    conn.close()

def toggle_question_bookmark(user_id: int, question_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT bookmarked FROM user_question_progress WHERE user_id = ? AND question_id = ?", (user_id, question_id))
    row = cursor.fetchone()
    if row is None:
        new_val = 1
        cursor.execute("INSERT INTO user_question_progress (user_id, question_id, bookmarked) VALUES (?, ?, 1)", (user_id, question_id))
    else:
        new_val = 0 if row["bookmarked"] else 1
        cursor.execute("UPDATE user_question_progress SET bookmarked = ? WHERE user_id = ? AND question_id = ?", (new_val, user_id, question_id))
    conn.commit()
    conn.close()
    return bool(new_val)

def record_question_result(user_id: int, question_id: int, is_correct: bool):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute("SELECT * FROM user_question_progress WHERE user_id = ? AND question_id = ?", (user_id, question_id))
    row = cursor.fetchone()
    if row is None:
        attempts = 1
        c_count = 1 if is_correct else 0
        i_count = 0 if is_correct else 1
        status = "mastered" if is_correct else "learning"
        cursor.execute("""
            INSERT INTO user_question_progress (user_id, question_id, status, attempts, correct_count, incorrect_count, last_tested)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, question_id, status, attempts, c_count, i_count, now))
    else:
        attempts = row["attempts"] + 1
        c_count = row["correct_count"] + (1 if is_correct else 0)
        i_count = row["incorrect_count"] + (0 if is_correct else 1)
        current_status = row["status"]
        if is_correct and c_count >= 2:
            current_status = "mastered"
        elif not is_correct:
            current_status = "learning"
            
        cursor.execute("""
            UPDATE user_question_progress
            SET attempts = ?, correct_count = ?, incorrect_count = ?, status = ?, last_tested = ?
            WHERE user_id = ? AND question_id = ?
        """, (attempts, c_count, i_count, current_status, now, user_id, question_id))
        
    conn.commit()
    conn.close()

def save_test_session(user_id: int, score: int, total_questions: int, time_spent_seconds: int, section_scores: dict, answers_list: list, test_type: str = "mock_35"):
    conn = get_db()
    cursor = conn.cursor()
    passed = 1 if score >= 32 and total_questions == 35 else (1 if (score / total_questions >= 0.91) else 0)
    
    cursor.execute("""
        INSERT INTO user_test_history (user_id, test_type, score, total_questions, time_spent_seconds, passed, section_scores, answers_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        test_type,
        score,
        total_questions,
        time_spent_seconds,
        passed,
        json.dumps(section_scores),
        json.dumps(answers_list)
    ))
    test_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Record individual question results for this user
    for ans in answers_list:
        record_question_result(user_id, ans["question_id"], ans["is_correct"])
        
    return test_id

def get_test_history(user_id: int, limit: int = 50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, user_id, test_type, timestamp, score, total_questions, time_spent_seconds, passed, section_scores
        FROM user_test_history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
    """, (user_id, limit))
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        d = dict(r)
        if d.get("section_scores"):
            try:
                d["section_scores"] = json.loads(d["section_scores"])
            except Exception:
                pass
        results.append(d)
    return results

def get_test_details(user_id: int, test_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_test_history WHERE id = ? AND user_id = ?", (test_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("section_scores"):
        d["section_scores"] = json.loads(d["section_scores"])
    if d.get("answers_json"):
        d["answers_json"] = json.loads(d["answers_json"])
    return d

def calculate_study_metrics(user_id: int, all_questions: list):
    conn = get_db()
    cursor = conn.cursor()
    
    progress = get_all_progress(user_id)
    
    total_q = len(all_questions)
    mastered_cnt = sum(1 for q in all_questions if progress.get(q["canonical_id"], {}).get("status") == "mastered")
    learning_cnt = sum(1 for q in all_questions if progress.get(q["canonical_id"], {}).get("status") == "learning")
    bookmarked_cnt = sum(1 for q in all_questions if progress.get(q["canonical_id"], {}).get("bookmarked") == 1)
    unseen_cnt = total_q - mastered_cnt - learning_cnt
    
    from collections import defaultdict
    sections_map = defaultdict(lambda: {"total": 0, "mastered": 0, "learning": 0, "unseen": 0, "tested_attempts": 0, "tested_correct": 0})
    
    for q in all_questions:
        sec = q["section"]
        qid = q["canonical_id"]
        sections_map[sec]["total"] += 1
        p = progress.get(qid, {})
        st = p.get("status", "unseen")
        if st == "mastered":
            sections_map[sec]["mastered"] += 1
        elif st == "learning":
            sections_map[sec]["learning"] += 1
        else:
            sections_map[sec]["unseen"] += 1
            
        attempts = p.get("attempts", 0)
        corrects = p.get("correct_count", 0)
        sections_map[sec]["tested_attempts"] += attempts
        sections_map[sec]["tested_correct"] += corrects

    section_metrics = {}
    for sec, stats in sections_map.items():
        mastery_pct = round((stats["mastered"] / stats["total"]) * 100, 1) if stats["total"] > 0 else 0
        accuracy_pct = round((stats["tested_correct"] / stats["tested_attempts"]) * 100, 1) if stats["tested_attempts"] > 0 else None
        
        rating = "Needs Focus"
        if mastery_pct >= 80 or (accuracy_pct is not None and accuracy_pct >= 90):
            rating = "Strong"
        elif mastery_pct >= 40 or (accuracy_pct is not None and accuracy_pct >= 75):
            rating = "Developing"
            
        section_metrics[sec] = {
            "total": stats["total"],
            "mastered": stats["mastered"],
            "learning": stats["learning"],
            "unseen": stats["unseen"],
            "mastery_percent": mastery_pct,
            "tested_accuracy": accuracy_pct,
            "rating": rating
        }

    # Test history stats for this user
    cursor.execute("SELECT score, total_questions, passed, time_spent_seconds FROM user_test_history WHERE user_id = ? ORDER BY id ASC", (user_id,))
    tests = cursor.fetchall()
    conn.close()
    
    test_count = len(tests)
    passed_count = sum(1 for t in tests if t["passed"] == 1)
    avg_score = round(sum(t["score"] for t in tests) / test_count, 1) if test_count > 0 else 0
    avg_time = round(sum(t["time_spent_seconds"] for t in tests) / test_count) if test_count > 0 else 0
    pass_rate = round((passed_count / test_count) * 100, 1) if test_count > 0 else 0
    
    test_factor = (avg_score / 35.0) * 100 if test_count > 0 else 0
    mastery_factor = (mastered_cnt / total_q) * 100 if total_q > 0 else 0
    if test_count == 0:
        readiness_score = round(mastery_factor * 0.7)
    else:
        readiness_score = round((test_factor * 0.6) + (mastery_factor * 0.4))
    readiness_score = min(100, max(0, readiness_score))
    
    return {
        "user_id": user_id,
        "total_questions": total_q,
        "mastered_count": mastered_cnt,
        "learning_count": learning_cnt,
        "unseen_count": unseen_cnt,
        "bookmarked_count": bookmarked_cnt,
        "mastery_percent": round((mastered_cnt / total_q) * 100, 1),
        "readiness_score": readiness_score,
        "tests_taken": test_count,
        "tests_passed": passed_count,
        "pass_rate": pass_rate,
        "avg_test_score": avg_score,
        "avg_time_spent_sec": avg_time,
        "section_metrics": section_metrics
    }

def reset_progress(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_question_progress WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM user_test_history WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
