/** Display name given to accounts whose sign-in provider shares no name. It is a placeholder, not a person's name. */
export const PLACEHOLDER_DISPLAY_NAME = "School administrator";

/** The name to address someone by, or "" when we only have the placeholder. */
export function personalName(displayName: string) {
  const name = displayName.trim();
  return name === PLACEHOLDER_DISPLAY_NAME ? "" : name;
}
