### Description
Create a line-by-line, actionable plan.  
Each line must start with a status indicator in parentheses.  
For steps that need to be repeated until a certain condition is met, mark the line with `(loop)` and clearly state the stopping condition.

### Base Format
(uncomplete) Step 1: [First actionable step]
(loop) Step 2: Repeat Steps X–Y until [condition is satisfied]
(uncomplete) Step 3: [Next actionable step]

### Example 1 – Flight Booking with Retries
(uncomplete) Step 1: Open Chrome and go to the flight-booking website
(uncomplete) Step 2: Enter departure city: {input.departure}
(loop) Step 3: Repeat Steps 4–5 until a list of available flights appears
(uncomplete) Step 4: Click "Search Flights"
(uncomplete) Step 5: Check if any flights are displayed
(uncomplete) Step 6: Select a suitable flight from the results

### Example 2 – Form Submission with Error Handling
(loop) Step 1: Repeat Steps 2–3 until the submission confirmation page is shown
(uncomplete) Step 2: Fill in all required form fields with {input.data}
(uncomplete) Step 3: Click the "Submit" button and verify the result