<p align="center">
  <img src="../branding/banner.png" alt="NZ Road Code Driving Test & Mock Exam" width="100%" />
</p>

# NZ Road Code Study & Mock Exam Web Application

A full-stack, responsive web application designed for mastering the New Zealand Road Code and passing the official Class 1, Motorcycle, and Heavy Vehicle learner driver theory tests.

---

## Overview

The application provides an interactive, data-driven study experience powered by 716 verified, deduplicated NZ road code questions compiled from official NZTA guidelines and industry training sources. It features a per-user study tracker, a 35-question mock exam engine with strict 30-minute timing and official scoring, a targeted weak-area review mode, and progress analytics.

- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript, Chart.js (Zero framework dependencies, optimized for mobile and desktop).
- **Backend**: FastAPI (Python 3.10+), Uvicorn ASGI server.
- **Database**: SQLite3 with automatic migrations, parameterized queries, and PBKDF2-HMAC-SHA256 password hashing.
- **Deployment**: Systemd service (`nz-driving.service`) on Ubuntu/Debian Linux.

---

## Key Features

### 1. Interactive Study Hub
- **High-Density Study Flow**: Displays **100 questions per page**, streamlining the entire 716-question bank across just **8 clean pages**.
- **Clear & Simple Pagination**: Real-time slice indicator showing exact active question range without clutter, e.g. `Page 1 of 8 (1–100 of 716)`.
- **Instant Quiz Mode**: Test recall on each question with immediate answer validation, full rule explanations, and diagram references.
- **Intuitive Answer Choice Bullets**:
  - *Single-Answer Questions*: Circular radio bullets (`.study-opt-radio`) aligned before option identifiers (`[A]`, `[B]`, `[C]`), dynamically tinted with accent color upon selection.
  - *Multiple-Answer Questions*: Square checkboxes (`.study-opt-checkbox`) with multi-selection support and an explicit "Check Answers" confirmation button.
  - *Color-Coded Feedback*: Instant emerald (correct) or crimson (incorrect) highlight states with option badges and explanations.
- **Filters & Search**: Filter across all 10 Road Code syllabus topics, license classes (Car, Motorcycle, Heavy), and mastery status (*All*, *Unseen*, *Needs Practice*, *Mastered*, *Bookmarked*, *With Diagrams*). Includes real-time search debouncing.
- **Minimalist Question Cards**:
  - **Status Indicator Icons**: Visual status without text labels:
    - *Mastered*: Emerald checkmark circle.
    - *Needs Practice / Learning*: Amber in-progress rotate arrow.
    - *Unseen*: Neutral slate dashed circle.
  - **Bookmark Action**: One-tap toggle icon with accessible tooltip.
  - **Diagram Viewer**: High-resolution diagrams with tap-to-zoom modal dialogs (clean display without redundant captions).

### 2. Official 35-Question Mock Exam Engine
- **Balanced Question Distribution**: Follows official NZTA proportions across core rules, intersections, parking, emergencies, signs, and road conditions.
- **Official Exam Rules**:
  - 35 questions with a 30-minute countdown timer.
  - Passing threshold: 32 / 35 (91.4%) correct.
  - Flagging system to mark questions for review before submitting.
  - Visual navigator drawer tracking answered, unanswered, and flagged questions.
- **Comprehensive Scorecard & Review**:
  - Detailed breakdown of score per section.
  - Full item-by-item question review displaying correct vs. selected answers with official rule explanations.

### 3. Weak Area Diagnostic Drill
- Isolates all questions answered incorrectly across study sessions or mock tests.
- Dynamically updates as questions are practiced and mastered.

### 4. Growth & Readiness Metrics
- **Readiness Score**: Calculates percentage preparedness for the actual NZTA exam based on unique questions mastered.
- **Historical Performance Chart**: Interactive Chart.js timeline showing exam score trajectories, pass/fail thresholds, and average exam duration.

### 5. Multi-User Authentication & Profile Isolation
- **Mandatory Authentication**: Full-screen authentication gate protecting study data; each learner must register and log in.
- **User Registration**: Supports username, email address, display name, and secure password.
- **Flexible Sign In**: Users can log in using either their **Username** or **Email Address**.
- **Saved Profiles Quick Switcher**: Quick-switch buttons on the login gate allow seamless profile switching across multiple family members or learners sharing a device.
- **Session Security**: 60-day cryptographically secure Bearer session tokens with HTTP-only cookie support.

---

## Directory Structure

```text
webapp/
|-- database.py          # Database models, connection pool, migrations, and CRUD operations
|-- server.py            # FastAPI endpoints, auth middleware, and question bank routing
|-- study_tracker.db     # SQLite3 database (users, sessions, progress, test history)
|-- run.sh               # Local development launch script
|-- README.md            # Application documentation
`-- static/
    |-- index.html       # Single Page Application entry point
    |-- css/
    |   `-- style.css    # Responsive CSS styling, animations, and dark auth gate
    `-- js/
        |-- app.js       # Client application logic, state, and DOM manipulation
        `-- chart.min.js # Chart.js library for metrics visualization
```

---

## Database Architecture

The SQLite database (`study_tracker.db`) manages 4 relational tables:

1. **`users`**:
   - `id`: Primary key (Integer).
   - `username`: Unique username (Case-insensitive).
   - `password_hash`: Salted PBKDF2-HMAC-SHA256 password hash.
   - `display_name`: Friendly learner name.
   - `email`: User email address (Used for communication and login).
   - `created_at`: Registration timestamp.

2. **`user_sessions`**:
   - `session_token`: Secure 32-byte URL-safe authentication token.
   - `user_id`: Foreign key reference to `users.id` (Cascade delete).
   - `created_at`, `expires_at`: Session validity timestamps (60-day expiry).

3. **`user_question_progress`**:
   - `(user_id, question_id)`: Composite primary key.
   - `status`: `'unseen'`, `'learning'`, or `'mastered'`.
   - `bookmarked`: Boolean (0 or 1).
   - `attempts`, `correct_count`, `incorrect_count`: Quantitative progress counters.
   - `last_tested`: Timestamp of most recent attempt.
   - `notes`: User notes.

4. **`user_test_history`**:
   - `id`: Primary key (Integer).
   - `user_id`: Foreign key reference to `users.id` (Cascade delete).
   - `test_type`: Test identifier (default `'mock_35'`).
   - `timestamp`: Exam completion date.
   - `score`, `total_questions`: Numerical exam results.
   - `time_spent_seconds`: Time taken in seconds.
   - `passed`: Boolean pass/fail indicator (>= 32/35).
   - `section_scores`: JSON breakdown of performance per syllabus area.
   - `answers_json`: JSON record of submitted answers and question outcomes.

---

## API Reference

All protected endpoints require an `Authorization: Bearer <session_token>` header or `session_token` cookie.

### Authentication Endpoints
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user profile (username, email, display_name, password) | No |
| `POST` | `/api/auth/login` | Authenticate with username/email and password | No |
| `POST` | `/api/auth/logout` | Terminate session and invalidate token | Yes |
| `GET` | `/api/auth/me` | Fetch authenticated user summary, mastery count, and readiness | Yes |
| `GET` | `/api/auth/users` | List public profile summaries for device quick switcher | No |

### Study & Question Endpoints
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/questions` | Query question bank with pagination, search, and topic/status filters | Yes |
| `GET` | `/api/questions/{id}` | Retrieve individual question detail and user progress | Yes |
| `POST` | `/api/questions/{id}/answer` | Validate answer choice and record attempt in study tracker | Yes |
| `POST` | `/api/questions/{id}/status` | Manually update question status (`learning` / `mastered`) | Yes |
| `POST` | `/api/questions/{id}/bookmark` | Toggle question bookmark status | Yes |
| `GET` | `/api/images/{image_id}` | Serve question road diagram image | No |

### Mock Exam & Analytics Endpoints
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/test/generate` | Generate 35-question mock exam based on official topic distribution | Yes |
| `POST` | `/api/test/submit` | Grade mock exam, compute section breakdowns, and save session | Yes |
| `GET` | `/api/test/history` | Retrieve past mock exam records for current user | Yes |
| `GET` | `/api/test/session/{id}` | Fetch full question and answer details for a historical exam | Yes |
| `GET` | `/api/weak-areas` | Query questions needing practice based on historical mistakes | Yes |
| `GET` | `/api/metrics` | Retrieve comprehensive learning metrics and score timelines | Yes |
| `POST` | `/api/reset` | Permanently reset study progress and test records for current user | Yes |

---

## Local Development & Setup

### Prerequisites
- Python 3.10+
- `pip` package manager

### 1. Install Dependencies
```bash
pip install fastapi uvicorn pydantic
```

### 2. Run Local Development Server
```bash
cd webapp
python3 server.py --host 0.0.0.0 --port 8080
```
Open `http://localhost:8080` in your web browser.

---

## Production Deployment (Systemd)

The application is deployed on production Linux servers using systemd for automatic startup, crash recovery, and multi-worker execution.

### Service File (`/etc/systemd/system/nz-driving.service`)
```ini
[Unit]
Description=NZ Road Code Study & Mock Exam Web App
After=network.target
Documentation=https://github.com/musfiq/nz-driving

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nz-driving/webapp
Environment=PYTHONUNBUFFERED=1
Environment=TZ=Pacific/Auckland
ExecStart=/usr/local/bin/uvicorn server:app --host 0.0.0.0 --port 8011 --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nz-driving

[Install]
WantedBy=multi-user.target
```

### Managing the Service
```bash
# Check service health and logs
systemctl status nz-driving.service

# Restart service after updates
systemctl restart nz-driving.service

# View live application logs
journalctl -u nz-driving.service -f
```

---

## Synchronization & Production Deployment

To synchronize updates from the development environment to the production host (`192.168.1.100`):

```bash
# Sync web application files (preserving production database)
rsync -avz --exclude="study_tracker.db" --exclude="__pycache__" \
  /root/nz-dirving/webapp/ root@192.168.1.100:/opt/nz-driving/webapp/

# Restart production service
ssh root@192.168.1.100 "systemctl restart nz-driving.service"
```
