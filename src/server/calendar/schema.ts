import { z } from "zod";

const selectedCalendarInputSchema = z.object({
  externalCalendarId: z.string().min(1, "externalCalendarId is required"),
  isCheckedForConflicts: z.boolean(),
});

/** Validates the `selections` array passed to `updateSelectedCalendars`. */
export const updateSelectedCalendarsSchema = z.array(selectedCalendarInputSchema);

/** Validates the `externalCalendarId` passed to `setDestinationCalendar`. */
export const setDestinationCalendarSchema = z.string().min(1, "externalCalendarId is required");
