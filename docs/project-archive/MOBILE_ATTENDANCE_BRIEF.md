## Prompt: Improve Stocrant Mobile App — Check-In, Check-Out & Attendance History

Improve the Check-In and Check-Out functionality in the Stocrant mobile application. Make it professional, modern, accurate, easy to use, and fully functional on mobile devices.

### 1. Live Working Clock
- Display the current time in real time using **hours, minutes, and seconds (HH:MM:SS)**.
- Display the current date and day of the week.
- Update the clock every second without refreshing the page.
- Use a clear, large digital clock with a modern mobile-friendly design.
- Display the employee's current attendance status: Not Checked In, Checked In, On Break, or Checked Out, depending on the existing system features.

### 2. Check-In and Check-Out Buttons
- Create prominent, easy-to-use Check-In and Check-Out buttons.
- When an employee checks in, save the exact date and time of the action.
- When an employee checks out, save the exact date and time and calculate the total working duration.
- Display the check-in time, check-out time, and total hours, minutes, and seconds worked.
- Prevent duplicate check-ins and invalid check-outs.
- Update the interface immediately after each successful action.
- Show clear confirmation messages and useful error messages.
- Preserve attendance records when the employee closes or reopens the application.

### 3. Today's Attendance Dashboard
Display an attendance summary card containing:
- Current live clock.
- Today's check-in time.
- Today's check-out time, if available.
- Total time worked today.
- Remaining scheduled working time, if the employee has a configured work schedule.
- Current attendance status.
- Any late arrival or early departure indicators, based on the employee's assigned shift.

Use a clear visual layout with readable text, appropriate icons, and responsive cards.

### 4. Attendance History
Create a dedicated Attendance History section that allows employees to review their previous attendance records.

Display the following information for each day:
- Date and day of the week.
- Check-in time.
- Check-out time.
- Total working hours and minutes.
- Attendance status.
- Late arrival or early departure, where applicable.

Include:
- A calendar or date-range filter.
- Filters for Today, This Week, This Month, and Custom Date Range.
- A detailed view for each attendance record.
- Pagination or efficient loading for large attendance histories.
- A clear empty state when no records are available.

Ensure that employees can only access their own attendance history.

### 5. Working Duration Timer
When an employee successfully checks in, start a live working-duration timer.

Example:

**Working Time Today**

`08:24:36`

Update the timer every second while the employee is checked in. Calculate the duration from the saved check-in timestamp rather than relying solely on a local counter, so the displayed time remains accurate if the app is minimized, closed, or reopened.

Stop the timer at the recorded check-out time. If the employee has multiple work sessions in one day, calculate the total according to the existing attendance and break rules.

### 6. Mobile UI/UX Improvements
- Design the screen specifically for mobile phones.
- Use a clean, modern interface with professional cards, consistent spacing, and readable typography.
- Make Check-In and Check-Out buttons large enough for comfortable touch interaction.
- Ensure the screen works in both light mode and dark mode.
- Support all languages already implemented in Stocrant, including correct right-to-left layout for Arabic.
- Add loading indicators, success notifications, error messages, and accessible button states.
- Keep the interface sharp, clear, responsive, and consistent with the rest of the application.

### 7. Data Accuracy and Security
- Inspect the existing database, authentication system, employee records, and attendance APIs before making changes.
- Store attendance timestamps reliably on the backend, preferably in UTC, and display them in the configured local time zone.
- Prevent duplicate records, unauthorized edits, and invalid attendance sequences through server-side validation.
- Ensure employees cannot change their own attendance records or access another employee's records unless explicitly authorized.
- Apply existing role-based permissions and preserve the administrator's ability to review attendance according to their access rights.
- Handle poor internet connections, API failures, and repeated requests safely.
- Do not use a frontend-only timer as the source of truth for attendance calculations.

### 8. Integration and Testing
- Integrate the improvements into the existing Stocrant mobile application without breaking other modules.
- Reuse the existing project architecture, API endpoints, database schema, design system, and authentication where appropriate.
- Do not create duplicate attendance systems or mock data to simulate successful check-ins.
- Test check-in, check-out, timer accuracy, app restart behavior, attendance history, permissions, time zones, and Arabic/English layouts.
- Fix any related errors and verify that the complete workflow works on mobile devices.

**Expected result:** Employees can see the live clock down to the second, check in and check out easily, monitor their working duration in real time, and review their complete attendance history in a polished, reliable mobile interface.