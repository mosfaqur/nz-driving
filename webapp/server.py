import os, json, random
from fastapi import FastAPI, HTTPException, Query, Request, Response, Header, Depends
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict

from database import (
    init_db, create_user, authenticate_user, create_session,
    get_user_by_session, get_user_by_id, delete_session, list_all_users,
    get_all_progress, update_question_status, toggle_question_bookmark,
    record_question_result, save_test_session, get_test_history, get_test_details,
    calculate_study_metrics, reset_progress
)

# Initialize DB & Tables
init_db()

# Load 691 Clean Questions
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUESTIONS_FILE = os.path.join(_BASE_DIR, "..", "export", "master_unique_questions.json")
with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
    ALL_QUESTIONS = json.load(f)

QUESTIONS_MAP = {q["canonical_id"]: q for q in ALL_QUESTIONS}
print(f"Loaded {len(ALL_QUESTIONS)} verified unique questions into web application.")

app = FastAPI(title="NZ Road Code Multi-User Study & Mock Exam Web App", version="1.1.0")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.api_route("/favicon.ico", methods=["GET", "HEAD"], include_in_schema=False)
def get_favicon():
    return FileResponse(os.path.join(STATIC_DIR, "favicon.png"), media_type="image/png")

# =============================================================================
# AUTHENTICATION DEPENDENCY
# =============================================================================
def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> dict:
    """Resolve active user via Bearer token, session cookie, or query param. Raises 401 if unauthenticated."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        token = request.query_params.get("session_token")

    user = get_user_by_session(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in or create an account.")
    return user

def get_optional_current_user(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> Optional[dict]:
    """Resolve active user if available, otherwise return None without raising 401."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        token = request.query_params.get("session_token")
    return get_user_by_session(token) if token else None

# =============================================================================
# AUTHENTICATION SCHEMAS & ENDPOINTS
# =============================================================================
class RegisterPayload(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    email: Optional[str] = None

class LoginPayload(BaseModel):
    username: str
    password: str

@app.post("/api/auth/register")
def register_user(payload: RegisterPayload, response: Response):
    try:
        user = create_user(payload.username, payload.password, payload.display_name, payload.email)
        token = create_session(user["id"])
        response.set_cookie(key="session_token", value=token, max_age=60*86400, httponly=True, samesite="lax")
        return {"success": True, "user": user, "token": token}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login")
def login_user(payload: LoginPayload, response: Response):
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password. Please check your credentials.")
    token = create_session(user["id"])
    response.set_cookie(key="session_token", value=token, max_age=60*86400, httponly=True, samesite="lax")
    return {"success": True, "user": user, "token": token}

@app.post("/api/auth/logout")
def logout_user(request: Request, response: Response, authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        token = request.cookies.get("session_token")
    if token:
        delete_session(token)
    response.delete_cookie(key="session_token")
    return {"success": True, "message": "Logged out successfully"}

@app.get("/api/auth/me")
def get_current_user_profile(user: dict = Depends(get_current_user)):
    # Enrich with summary stats
    metrics = calculate_study_metrics(user["id"], ALL_QUESTIONS)
    return {
        "user": user,
        "mastered_count": metrics["mastered_count"],
        "learning_count": metrics["learning_count"],
        "readiness_score": metrics["readiness_score"],
        "tests_taken": metrics["tests_taken"],
        "tests_passed": metrics["tests_passed"],
        "total_questions": len(ALL_QUESTIONS)
    }

@app.get("/api/auth/users")
def get_user_profiles_list():
    """Retrieve all profiles created on this installation for easy switching"""
    return list_all_users()

# =============================================================================
# WEB CLIENT & STATIC ASSETS
# =============================================================================
@app.get("/", response_class=HTMLResponse)
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/api/images/{canonical_id}")
def get_question_image(canonical_id: int):
    q = QUESTIONS_MAP.get(canonical_id)
    if not q or not q.get("image_path") or not os.path.exists(q["image_path"]):
        raise HTTPException(status_code=404, detail="Image not found")
    
    ext = os.path.splitext(q["image_path"])[1].lower()
    media_type = "image/png" if ext == ".png" else "image/jpeg"
    return FileResponse(q["image_path"], media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})

# =============================================================================
# QUESTIONS API (PER-USER PROGRESS)
# =============================================================================
@app.get("/api/questions")
def get_questions(
    section: Optional[str] = None,
    license: Optional[str] = None,
    status: Optional[str] = None,
    has_image: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    user: dict = Depends(get_current_user)
):
    progress = get_all_progress(user["id"])
    filtered = []
    search_terms = search.lower().split() if search else []
    
    for q in ALL_QUESTIONS:
        qid = q["canonical_id"]
        p = progress.get(qid, {})
        q_status = p.get("status", "unseen")
        is_bookmarked = p.get("bookmarked", 0) == 1
        
        if section and section != "All" and q["section"] != section:
            continue
            
        if license and license != "All" and license.lower() not in q["license_class"].lower():
            continue
            
        q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
        if has_image is not None and q_has_img != has_image:
            continue
            
        if status:
            if status == "mastered" and q_status != "mastered":
                continue
            elif status == "learning" and q_status != "learning":
                continue
            elif status == "unseen" and q_status != "unseen":
                continue
            elif status == "bookmarked" and not is_bookmarked:
                continue
            elif status == "has_image" and not q_has_img:
                continue
                
        if search_terms:
            full_text = f"{q['prompt']} {' '.join(q['options'])} {q['category']} {q['section']}".lower()
            if not all(term in full_text for term in search_terms):
                continue
                
        q_item = dict(q)
        q_item["has_image"] = q_has_img
        q_item["user_status"] = q_status
        q_item["is_bookmarked"] = is_bookmarked
        q_item["attempts"] = p.get("attempts", 0)
        q_item["correct_count"] = p.get("correct_count", 0)
        q_item["incorrect_count"] = p.get("incorrect_count", 0)
        q_item["image_url"] = f"/api/images/{qid}" if q_has_img else ""
        q_item.pop("image_path", None)
        filtered.append(q_item)

    total_matches = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = filtered[start:end]
    
    return {
        "user_id": user["id"] if user else None,
        "total": total_matches,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_matches + page_size - 1) // page_size if total_matches > 0 else 1,
        "questions": paginated
    }

@app.get("/api/questions/{canonical_id}")
def get_question_detail(canonical_id: int, user: dict = Depends(get_current_user)):
    q = QUESTIONS_MAP.get(canonical_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    progress = get_all_progress(user["id"]).get(canonical_id, {})
    q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
    
    res = dict(q)
    res["has_image"] = q_has_img
    res["image_url"] = f"/api/images/{canonical_id}" if q_has_img else ""
    res["user_status"] = progress.get("status", "unseen")
    res["is_bookmarked"] = progress.get("bookmarked", 0) == 1
    res["attempts"] = progress.get("attempts", 0)
    res["correct_count"] = progress.get("correct_count", 0)
    res["incorrect_count"] = progress.get("incorrect_count", 0)
    res.pop("image_path", None)
    return res

class StatusUpdate(BaseModel):
    status: str

@app.post("/api/questions/{canonical_id}/status")
def set_status(canonical_id: int, payload: StatusUpdate, user: dict = Depends(get_current_user)):
    if payload.status not in ["unseen", "learning", "mastered"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    update_question_status(user["id"], canonical_id, payload.status)
    return {"success": True, "canonical_id": canonical_id, "status": payload.status}

@app.post("/api/questions/{canonical_id}/bookmark")
def toggle_bookmark(canonical_id: int, user: dict = Depends(get_current_user)):
    new_state = toggle_question_bookmark(user["id"], canonical_id)
    return {"success": True, "canonical_id": canonical_id, "is_bookmarked": new_state}

class SingleAnswerPayload(BaseModel):
    selected_index: Optional[int] = None
    selected_indices: Optional[List[int]] = None

@app.post("/api/questions/{canonical_id}/answer")
def check_single_answer(canonical_id: int, payload: SingleAnswerPayload, user: dict = Depends(get_current_user)):
    q = QUESTIONS_MAP.get(canonical_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
        
    correct_indices = q.get("correct_option_indices", [q["correct_option_index"]])
    correct_set = set(correct_indices)
    
    if payload.selected_indices is not None and len(payload.selected_indices) > 0:
        is_correct = (set(payload.selected_indices) == correct_set)
    elif payload.selected_index is not None:
        is_correct = (payload.selected_index in correct_set)
    else:
        is_correct = False
        
    record_question_result(user["id"], canonical_id, is_correct)
    
    return {
        "is_correct": is_correct,
        "correct_option_indices": correct_indices,
        "correct_letters": q.get("correct_letters", [q.get("correct_letter", "A")]),
        "correct_option_index": q["correct_option_index"],
        "correct_letter": q.get("correct_letter", "A"),
        "is_multi_answer": q.get("is_multi_answer", len(correct_indices) > 1),
        "explanation": q["explanation"]
    }

# =============================================================================
# MOCK TEST GENERATION & GRADING (PER-USER)
# =============================================================================
@app.get("/api/test/generate")
def generate_mock_test(license_filter: Optional[str] = "Class 1 (Car)", user: dict = Depends(get_current_user)):
    distribution = [
        ("Core Rules & General Theory", 12),
        ("Intersections & Give-Way Scenarios", 8),
        ("Road Signs, Signals & Markings", 6),
        ("Driving Behaviour & Defensive Driving", 4),
        ("Parking & Stopping Restrictions", 3),
        ("Emergencies & Road Safety", 2)
    ]
    
    pool = ALL_QUESTIONS
    if license_filter and license_filter != "All":
        pool = [q for q in ALL_QUESTIONS if license_filter.lower() in q["license_class"].lower() or "all" in q["license_class"].lower()]
        if len(pool) < 50:
            pool = ALL_QUESTIONS
            
    by_section = {}
    for q in pool:
        by_section.setdefault(q["section"], []).append(q)
        
    selected = []
    chosen_ids = set()
    
    for sec_name, count in distribution:
        candidates = [q for q in by_section.get(sec_name, []) if q["canonical_id"] not in chosen_ids]
        n_pick = min(count, len(candidates))
        picked = random.sample(candidates, n_pick) if candidates else []
        for q in picked:
            chosen_ids.add(q["canonical_id"])
            selected.append(q)
            
    if len(selected) < 35:
        remaining = [q for q in pool if q["canonical_id"] not in chosen_ids]
        need = 35 - len(selected)
        if remaining:
            fillers = random.sample(remaining, min(need, len(remaining)))
            for q in fillers:
                chosen_ids.add(q["canonical_id"])
                selected.append(q)
                
    random.shuffle(selected)
    
    test_items = []
    for idx, q in enumerate(selected, 1):
        q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
        test_items.append({
            "test_item_number": idx,
            "canonical_id": q["canonical_id"],
            "section": q["section"],
            "category": q["category"],
            "license_class": q["license_class"],
            "prompt": q["prompt"],
            "options": q["options"],
            "is_multi_answer": q.get("is_multi_answer", len(q.get("correct_option_indices", [])) > 1),
            "has_image": q_has_img,
            "image_url": f"/api/images/{q['canonical_id']}" if q_has_img else ""
        })
        
    return {
        "test_type": "mock_35",
        "time_limit_minutes": 30,
        "pass_mark": 32,
        "total_questions": len(test_items),
        "questions": test_items
    }

class UserAnswer(BaseModel):
    question_id: int
    selected_index: Optional[int] = -1
    selected_indices: Optional[List[int]] = None
    flagged: Optional[bool] = False

class SubmitTestPayload(BaseModel):
    time_spent_seconds: int
    answers: List[UserAnswer]
    test_type: Optional[str] = "mock_35"

@app.post("/api/test/submit")
def submit_mock_test(payload: SubmitTestPayload, user: dict = Depends(get_current_user)):
    total = len(payload.answers)
    score = 0
    section_breakdown = {}
    review_items = []
    answers_to_save = []
    
    for item in payload.answers:
        qid = item.question_id
        q = QUESTIONS_MAP.get(qid)
        if not q:
            continue
            
        correct_indices = q.get("correct_option_indices", [q["correct_option_index"]])
        correct_set = set(correct_indices)
        
        if item.selected_indices is not None and len(item.selected_indices) > 0:
            is_correct = (set(item.selected_indices) == correct_set)
        else:
            if q.get("is_multi_answer"):
                is_correct = (item.selected_index in correct_set)
            else:
                is_correct = (item.selected_index == q["correct_option_index"])
                
        if is_correct:
            score += 1
            
        sec = q["section"]
        if sec not in section_breakdown:
            section_breakdown[sec] = {"total": 0, "correct": 0}
        section_breakdown[sec]["total"] += 1
        if is_correct:
            section_breakdown[sec]["correct"] += 1
            
        q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
        
        review_items.append({
            "canonical_id": qid,
            "section": sec,
            "prompt": q["prompt"],
            "options": q["options"],
            "selected_index": item.selected_index,
            "selected_indices": item.selected_indices or ([] if item.selected_index < 0 else [item.selected_index]),
            "correct_option_index": q["correct_option_index"],
            "correct_option_indices": correct_indices,
            "correct_letters": q.get("correct_letters", [q.get("correct_letter", "A")]),
            "correct_letter": q.get("correct_letter", "A"),
            "is_multi_answer": q.get("is_multi_answer", len(correct_indices) > 1),
            "is_correct": is_correct,
            "flagged": item.flagged,
            "explanation": q["explanation"],
            "has_image": q_has_img,
            "image_url": f"/api/images/{qid}" if q_has_img else ""
        })
        
        answers_to_save.append({
            "question_id": qid,
            "selected_index": item.selected_index,
            "correct_index": q["correct_option_index"],
            "is_correct": is_correct
        })

    passed = (score >= 32) if total == 35 else (score / total >= 0.91)
    
    test_id = save_test_session(
        user_id=user["id"],
        score=score,
        total_questions=total,
        time_spent_seconds=payload.time_spent_seconds,
        section_scores=section_breakdown,
        answers_list=answers_to_save,
        test_type=payload.test_type
    )
    
    return {
        "user_id": user["id"],
        "test_id": test_id,
        "score": score,
        "total_questions": total,
        "percentage": round((score / total) * 100, 1) if total > 0 else 0,
        "passed": passed,
        "pass_threshold": 32,
        "time_spent_seconds": payload.time_spent_seconds,
        "section_breakdown": section_breakdown,
        "review_items": review_items
    }

@app.get("/api/metrics")
def get_metrics(user: dict = Depends(get_current_user)):
    return calculate_study_metrics(user["id"], ALL_QUESTIONS)

@app.get("/api/test/history")
def get_history(limit: int = 20, user: dict = Depends(get_current_user)):
    return get_test_history(user["id"], limit=limit)

@app.get("/api/test/history/{test_id}")
def get_history_detail(test_id: int, user: dict = Depends(get_current_user)):
    detail = get_test_details(user["id"], test_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Test session not found")
        
    augmented_answers = []
    if detail.get("answers_json"):
        for item in detail["answers_json"]:
            qid = item["question_id"]
            q = QUESTIONS_MAP.get(qid)
            if q:
                q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
                augmented_answers.append({
                    "canonical_id": qid,
                    "section": q["section"],
                    "prompt": q["prompt"],
                    "options": q["options"],
                    "selected_index": item["selected_index"],
                    "correct_option_index": item["correct_index"],
                    "correct_letter": q["correct_letter"],
                    "is_correct": item["is_correct"],
                    "explanation": q["explanation"],
                    "has_image": q_has_img,
                    "image_url": f"/api/images/{qid}" if q_has_img else ""
                })
    detail["review_items"] = augmented_answers
    return detail

@app.get("/api/weak-areas")
def get_weak_areas(limit: int = 35, user: dict = Depends(get_current_user)):
    progress = get_all_progress(user["id"])
    weak_list = []
    
    for q in ALL_QUESTIONS:
        qid = q["canonical_id"]
        p = progress.get(qid, {})
        inc = p.get("incorrect_count", 0)
        att = p.get("attempts", 0)
        st = p.get("status", "unseen")
        
        if inc > 0 or st == "learning":
            q_has_img = bool(q.get("image_path") and os.path.exists(q["image_path"]))
            acc = round((p.get("correct_count", 0) / att) * 100, 1) if att > 0 else 0
            weak_list.append({
                "canonical_id": qid,
                "section": q["section"],
                "category": q["category"],
                "license_class": q["license_class"],
                "prompt": q["prompt"],
                "options": q["options"],
                "correct_option_index": q["correct_option_index"],
                "explanation": q["explanation"],
                "has_image": q_has_img,
                "image_url": f"/api/images/{qid}" if q_has_img else "",
                "user_status": st,
                "attempts": att,
                "incorrect_count": inc,
                "accuracy": acc
            })
            
    weak_list.sort(key=lambda x: (x["incorrect_count"], -x["accuracy"]), reverse=True)
    return weak_list[:limit]

@app.post("/api/reset")
def reset_user_progress(user: dict = Depends(get_current_user)):
    reset_progress(user["id"])
    return {"success": True, "message": f"Study progress and test history reset for user {user['username']}"}

if __name__ == "__main__":
    import uvicorn
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080, help="Port to run server on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address")
    args = parser.parse_args()
    
    print(f"Starting NZ Road Code Multi-User Web Application at http://{args.host}:{args.port}")
    uvicorn.run("server:app", host=args.host, port=args.port, reload=False)
