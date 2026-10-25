# AquaAlert

AquaAlert is a final-year project prototype for viewing community-submitted waterlogging reports, displaying coordinate-bearing reports on a map, and comparing routes on an illustrative graph. It is not an emergency alert service or a real-world navigation system.

## Features

- Session-based sign-in and registration with BCrypt password hashes.
- Authenticated report history and report creation with LOW, MEDIUM, or HIGH severity.
- Optional latitude and longitude; when supplied, both must be valid and in range.
- Leaflet and OpenStreetMap map markers at submitted coordinates only (HIGH red, MEDIUM orange, LOW green).
- Open-Meteo weather summary.
- Dijkstra comparison on a small, illustrative sample graph.
- DBSCAN summary of saved reports that have valid coordinates.

## Architecture and data flow

- `src/main/resources/static/index.html` serves the authenticated dashboard and handles report submission, history, weather, and map updates.
- `src/main/resources/static/js/route-planner.js` contains the sample graph and deterministic Dijkstra distance/risk calculations.
- `src/main/resources/static/js/report-analytics.js` clusters saved coordinate-bearing reports using DBSCAN.
- `WaterloggingReportController` validates report fields and reads/writes them through Spring Data JPA.
- `WaterloggingReport` maps to the existing report table. Nullable coordinate fields keep older rows readable; Hibernate's configured `update` mode can add missing columns without deleting rows.
- Spring Security protects the dashboard and reports API. Browser writes use the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header.

## Technology

- Java 21, Spring Boot 4.0.8, Maven
- Spring Security, BCrypt, Spring Data JPA / Hibernate
- MySQL
- HTML, CSS, JavaScript, Leaflet, OpenStreetMap
- Open-Meteo forecast API

## Prerequisites

- JDK 21
- MySQL server
- The included Maven wrapper (`mvnw.cmd`)
- Network access to Open-Meteo and the Leaflet/OpenStreetMap tile services for those external features

## MySQL setup

1. Start MySQL and create the `aquaalert` database if it does not already exist:

   ```sql
   CREATE DATABASE aquaalert;
   ```

   If the database already exists, do not drop or recreate it.
2. Check the datasource URL, username, and password in `src/main/resources/application.properties`. Use your local MySQL settings; do not commit real passwords or share them.
3. The project uses Hibernate schema update. Start the application and inspect the startup log for schema errors. Existing reports and accounts are not cleared by the application.

Reports created before the coordinate fields were active can legitimately have null coordinates. They remain in history but are excluded from map markers, route-risk calculations, and hotspot analysis. Do not infer coordinates from the location text.

## Start the application

From the project root in VS Code PowerShell:

```powershell
.\mvnw.cmd spring-boot:run
```

Open **http://localhost:8080/**. Do not use Live Server; it does not provide the Spring Security session or backend API.

If an older AquaAlert process is already using port 8080, stop it gracefully in the terminal where it was started (Ctrl+C), then run the command above. Do not terminate an unidentified process or delete the database. A running JVM does not load newly built entity classes until it is restarted.

## Registration and sign-in

There are no default credentials. Register through `POST /api/auth/register` with JSON fields `username` and `password`; the stored password is BCrypt-encoded. Registration does not delete or reset existing accounts. The endpoint is public but CSRF-protected: first make a GET request to `/login` using the same browser/client session, then include its `XSRF-TOKEN` cookie as the `X-XSRF-TOKEN` request header on the POST. For a local PowerShell registration, prompt for a new username and hidden password rather than typing either into a command:

```powershell
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$baseUri = [Uri]"http://localhost:8080"
$null = Invoke-WebRequest -Uri "$baseUri/login" -WebSession $session
$csrfCookie = $session.Cookies.GetCookies($baseUri) |
    Where-Object Name -eq "XSRF-TOKEN"
$username = Read-Host "New username"
$securePassword = Read-Host "New password" -AsSecureString
$password = [System.Net.NetworkCredential]::new("", $securePassword).Password
$body = @{ username = $username; password = $password } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri "$baseUri/api/auth/register" `
    -WebSession $session -Headers @{ "X-XSRF-TOKEN" = $csrfCookie.Value } `
    -ContentType "application/json" -Body $body
Remove-Variable securePassword, password, body
```

The password exists temporarily in process memory to create the JSON request, but is not displayed or written to a project file. Use a unique local test password. If registration reports a duplicate username, choose another name; existing accounts are not overwritten.

Sign in at the Spring Security login page. The dashboard and `/api/reports` require an authenticated session. The browser sends the CSRF header for report submission and logout.

## API

| Method | URL | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public, CSRF token required | Register a username/password |
| `GET` | `/api/reports` | Authenticated | Read saved reports |
| `POST` | `/api/reports` | Authenticated, CSRF token required | Save a report |
| `POST` | `/logout` | Authenticated, CSRF token required | End the session |

Report JSON uses `location`, `severity`, and optional `description`, `latitude`, and `longitude`. Coordinates must be supplied as a pair. Valid severity values are LOW, MEDIUM, and HIGH (case-insensitive input is normalized). The authenticated GET response includes nullable `latitude` and `longitude` fields.

## Route and hotspot calculations

The route graph has named demo junctions and illustrative straight links. Dijkstra selects the shortest sample path and a second path using distance plus a severity/proximity penalty from valid saved report coordinates. This graph is not surveyed road geometry, covers no real road network, and cannot identify or guarantee a safe route.

Hotspots use DBSCAN with a 350 metre neighbourhood radius and minimum 3 coordinate-bearing reports per cluster. The dashboard shows cluster counts and approximate coordinate centres. It is descriptive only, uses submitted report locations, excludes invalid/missing coordinates, and is not a forecast. Reports are not fabricated to fill gaps.

## Tests and checks

Run these from the project root:

```powershell
.\mvnw.cmd verify
node --test src\test\js\route-planner.test.js
node --test src\test\js\report-analytics.test.js
git diff --check
```

The Java tests use the configured test/application database connection. Ensure MySQL is available and configured before running them; tests do not clear the database.

## Limitations and future work

- The route graph and edge geometry are illustrative, not real roads or live navigation.
- Risk is a deterministic heuristic based on the proximity and severity of submitted reports; missing reports do not imply an absence of hazards.
- Hotspot results depend on the number, quality, and coverage of submitted coordinates.
- Weather and map tiles depend on external services and network availability.
- Future work could use a licensed, maintained road network, validated risk observations, and dedicated operational review before any public safety use.
