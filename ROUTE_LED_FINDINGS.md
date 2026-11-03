# Route-Led Mobile Application - Map & Navigation Extraction Report

## 1. Executive Summary

This report documents the architectural, data, network, and security findings extracted from reverse engineering the Route-Led Android application (`com.cardiffappdevs.route_led_new`, version 5.9.6, build 1522).

The analysis covers:
- Core map and navigation SDK components.
- Dynamic route reconstruction and map-matching pipeline.
- Navigation thresholds, geofencing, and timer parameters.
- Local Android Room SQLite database schema.
- Cloud API endpoints and Google Play Integrity attestation requirements.
- Extracted third-party API keys, tokens, and backend URLs.

---

## 2. Navigation Architecture & Map SDK

Route-Led uses the **Mapbox Navigation SDK for Android** (v2.x) alongside the Mapbox Maps SDK (`com.mapbox.maps`):

- **Map Styles**:
  - `Style.STANDARD` (`mapbox://styles/mapbox/standard`): Default day driving vector style.
  - `Style.STANDARD_SATELLITE`: Aerial satellite imagery overlay.
- **HUD & UI Components**:
  - `com.mapbox.maps.MapView`: Root interactive vector map canvas.
  - `MapboxManeuverView`: Turn-by-turn guidance header showing next maneuvers, lane arrows, and distance countdowns.
  - `MapboxRecenterButton`: Camera recentering control locking focus behind the user vehicle puck.
  - `MapboxRouteOverviewButton`: Camera toggle framing the full route bounding box.
  - `MapboxSpeedInfoView`: Live speed limit indicator displaying current road speed limit and vehicle velocity.
  - `MapboxSoundButton`: Voice instruction volume toggle (Full Voice, Alert Beeps Only, Muted).
  - `MapboxRouteLineApi` and `MapboxRouteLineView`: Multi-segment colored route line with live congestion rendering.
  - `MapboxRouteArrowView`: 3D road arrows projected onto the pavement before upcoming intersections.
  - `NavigationLocationProvider`: Kalman-filtered location provider snapping the GPS puck to road coordinates.

---

## 3. Map Matching Pipeline & Coordinate Model

The application does not distribute static pre-compiled routes or Turn-by-Turn step files in its APK assets. Instead, it dynamically transforms raw coordinate points into navigation routes:

### Coordinate Model
Stored in the Room database as a JSON array string:
```json
[
  {"lat": -36.82215, "lon": 174.60873},
  {"lat": -36.82281, "lon": 174.60925},
  {"lat": -36.82390, "lon": 174.61050}
]
```

### Map Matching Execution
When a route is started, `com.cardiffappdevs.route_led.feature.navigation.data.repository.b` invokes `MapboxNavigation.mapMatching`:
```kotlin
val builder = MapMatchingOptions.Builder()
builder.profile("driving") // or "driving-traffic"
builder.coordinates(pointsList)
builder.waypoints(listOf(0, pointsList.size - 1))
builder.annotations(listOf("speed", "duration", "distance"))
builder.steps(true)
builder.voiceInstructions(true)
builder.bannerInstructions(true)
builder.language(locale.language + "&voice_units=" + (if (distanceUnits == DistanceUnits.MILES) "imperial" else "metric"))
mapboxNavigation.mapMatching(builder.build(), callback)
```
The Mapbox Map Matching service calculates road geometry, generates turn maneuvers, computes segment speed limits, and synthesizes turn-by-turn spoken instructions.

---

## 4. Key Navigation Thresholds & Parameters

Extracted from navigation controller `R0.java` and `MapRoutesFragment.java`:

| Parameter | Extracted Constant | Value | Description |
| :--- | :--- | :--- | :--- |
| **Start Pin Geofence** | `R0.f66755d` | `200.0 meters` | User must be within 200m of the starting green pin to initiate turn-by-turn navigation. |
| **Test Centre Approach** | `R0.f66756e` | `2000.0 meters` | Maximum distance allowed when previewing routes to the test centre. |
| **Off-Route Debounce Delay** | `R0.f66753b` | `7000 ms` | Countdown duration before triggering off-route warning tone and modal dialog. |
| **Route Completion Radius** | `R0.f66760i` | `100.0 meters` | Proximity to final destination triggering the test complete screen. |
| **Follow Camera Zoom** | `R0.f66758g` | `16.0` | Default camera zoom level during active driving navigation. |
| **Camera Transition Time** | `R0.f66757f` | `250 ms` | Duration for camera recenter animations. |
| **Recenter Inactivity Timeout**| `R0.f66759h` | `3000 ms` | Timeout before camera snaps back after manual panning. |
| **Offline Region Buffer** | `b.f67573a` | `5000.0 meters` | Centroid radius + 5km padding, downloaded as a 36-point polygon for offline Mapbox tile packs. |

---

## 5. Local Database Schema (Android Room SQLite)

Extracted from `RouteLedDB_Impl.java`:

### `CountryEntity`
```sql
CREATE TABLE IF NOT EXISTS `CountryEntity` (
  `id` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `iso_code` TEXT NOT NULL,
  `last_updated_at` INTEGER NOT NULL,
  PRIMARY KEY(`id`)
);
```

### `TestCentreEntity`
```sql
CREATE TABLE IF NOT EXISTS `TestCentreEntity` (
  `id` INTEGER NOT NULL,
  `country_id` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `address_line_1` TEXT NOT NULL,
  `address_line_2` TEXT NOT NULL,
  `town_city` TEXT NOT NULL,
  `postcode` TEXT NOT NULL,
  `latitude` REAL NOT NULL,
  `longitude` REAL NOT NULL,
  `last_updated_at` INTEGER NOT NULL,
  `routes_heading` TEXT NOT NULL,
  `routes_summary` TEXT NOT NULL,
  `routes_footnotes` TEXT NOT NULL,
  `status` TEXT NOT NULL,
  `is_owned` INTEGER NOT NULL,
  PRIMARY KEY(`id`),
  FOREIGN KEY(`country_id`) REFERENCES `CountryEntity`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `index_TestCentreEntity_country_id` ON `TestCentreEntity` (`country_id`);
```

### `TestRouteEntity`
```sql
CREATE TABLE IF NOT EXISTS `TestRouteEntity` (
  `id` INTEGER NOT NULL,
  `test_centre_id` INTEGER NOT NULL,
  `order_index` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `distance` REAL NOT NULL DEFAULT 0,
  `coordinates` TEXT NOT NULL,
  `last_updated_at` INTEGER NOT NULL,
  `status` TEXT,
  `is_completed` INTEGER NOT NULL,
  `completed_count` INTEGER NOT NULL,
  `is_recommended` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL,
  `usage_rank` INTEGER NOT NULL,
  `image_url` TEXT,
  `duration` REAL NOT NULL,
  `route_type` TEXT,
  PRIMARY KEY(`id`),
  FOREIGN KEY(`test_centre_id`) REFERENCES `TestCentreEntity`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `index_TestRouteEntity_test_centre_id` ON `TestRouteEntity` (`test_centre_id`);
```

---

## 6. Cloud API Endpoints & Attestation

Base URL: `https://api.route-led.com/`

### Route & Test Centre Endpoints
- `GET api/v1/countries/{syncTimestamp}`
  - Fetches country list (`id`, `name`, `iso_code`).
- `POST api/v4/test_centres/android/{syncTimestamp}/{countryId}`
  - Fetches paginated test centres for a country.
- `POST api/v4/test_routes/android/{syncTimestamp}/{centerId}`
  - Fetches test routes and coordinate arrays for a test centre.

### Integrity & Attestation Flow
Route-Led protects route downloads with Google Play Integrity and Android KeyStore hardware attestation:
1. `GET api/v1/integrity/nonce`: Retrieves a single-use server nonce (`{"value": "<uuid>"}`).
2. Client requests a signed token from Google Play Integrity API.
3. `GET api/v1/integrity/android/token?integrityToken=...`: Exchanges Google token for an `X-Integrity-Login-Token`.
4. `POST api/v4/test_routes/android/...`: Requires `X-Integrity-Login-Token` header and a body containing `SecureTestRoutesRequest` with a device KeyStore ECDSA certificate chain and payload signature:
   - `nonce` (string)
   - `keyAlias` (string)
   - `clientData` (string)
   - `signature` (string)
   - `certificateChain` (list of X.509 certs)

---

## 7. Extracted Keys, Tokens & Configuration

Extracted from compiled Android resources (`resources.arsc`):

| Key Identifier | Resource ID | Extracted Value | Usage |
| :--- | :--- | :--- | :--- |
| `mapbox_access_token` | `0x7f140181` | `sk.eyJ1...[redacted_security_token]...wTTdA` | Mapbox Maps SDK map render & styles |
| `MAPBOX_DOWNLOADS_TOKEN` | `0x7f140006` | `sk.eyJ1...[redacted_security_token]...EY8Q` | Mapbox SDK offline region tile downloads |
| `GOOGLE_MAPS_API_KEY` | `0x7f140004` | `AIzaSyCS...[redacted_security_token]...Pk8A` | Google Maps Android SDK fallback |
| `google_api_key` | `0x7f140107` | `AIzaSyCL...[redacted_security_token]...VeLgQ` | Firebase / Play Services |
| `firebase_database_url` | `0x7f140100` | `https://routeled-17efa.firebaseio.com` | Firebase Realtime Database |
| `ADJUST_APP_TOKEN` | `0x7f140000` | `ccqgeo509tz4` | Adjust mobile analytics & attribution |
| `FACEBOOK_CLIENT_TOKEN` | `0x7f140003` | `55e88cce9106b4e1c51f3b9a017b8735` | Meta SDK client authentication |
