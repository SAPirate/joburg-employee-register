# City of Johannesburg Employee Register

A responsive, role-based employee attendance register. Administrators create employee accounts; employees record weekday arrival, one lunch interval, departure, or an all-day absence. Weekly and monthly reports remain viewable on weekends.

## Attendance rules

- The application uses the `Africa/Johannesburg` calendar and server-generated timestamps.
- Employees can make attendance changes only for the current weekday. Saturday and Sunday are view-only, enforced by the server.
- Worked time is elapsed time from arrival to departure, less recorded breakfast and lunch intervals. The daily target and expected departure estimate adjust for shorter or missing breaks.
- Breakfast is a 30-minute interval and lunch is a 60-minute interval for schedule estimation. Employees can end either interval early. Departure is available when no break interval is active; a short or missing break changes the calculated work target and estimate.
- An absence is a full-day entry with a required reason and contributes 0 worked hours. It cannot be combined with a clock-in.
- Entries are immutable through the employee interface once the day's action is recorded. Corrections should be handled through an approved administrative process before operational use.

## Run locally

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm start
```

For local development, the database initializes a demo administrator. Open `http://localhost:3000` and use the local credentials already configured for this project. The administrator then creates employee accounts. Set `DATABASE_PATH` to choose another SQLite file; the default is `data/attendance.sqlite`.

Run the policy and calculation tests with `npm test`.

## Deploy on Render

The included `render.yaml` provisions a Node web service and a persistent disk for the SQLite database. SQLite data must live on that disk; ephemeral service storage is not suitable for attendance records. The configured Render Starter service and persistent disk may incur charges; confirm current pricing before deployment. Set `APP_ORIGIN` to the final HTTPS service URL and `TRUST_PROXY=1` in the Render environment. Render supplies `PORT`.

Create a separate **private** GitHub repository for this school project, push this folder, then create a Render Web Service from that repository using the included blueprint. Confirm the persistent disk and service plan before applying the blueprint. Once Render creates the service, copy its HTTPS URL into `APP_ORIGIN` and deploy. Production startup does not create the local demo administrator. In the Render Shell, run `npm run setup:admin` once and enter the production administrator details when prompted.

Self-service password reset is disabled in production until email ownership verification is configured. This avoids allowing someone who merely knows an employee's email address to take over that account. Until a verified email reset provider is added, employees who forget a production password must contact the administrator.

## Before operational use

This is an initial implementation, not a certified City of Johannesburg system. Confirm the City's working-time, break, absence, correction, retention, privacy, and records-management policies before using it for payroll or disciplinary decisions. Use HTTPS, restrict administrator access, arrange encrypted database backups, and have the appropriate IT/security team review the deployment and access controls.