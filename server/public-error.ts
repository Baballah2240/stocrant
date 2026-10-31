/**
 * Business rules throw plain `Error`s whose messages are written for users.
 * Programming and filesystem failures are logged instead of exposing internal
 * details such as property names or storage paths to the client.
 */
export function publicErrorMessage(error: unknown, fallback = "The request could not be completed."): string {
  if (!(error instanceof Error)) return fallback;
  const internal = error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError || /^E[A-Z]+$/.test(String((error as { code?: unknown }).code ?? ""));
  if (!internal) return error.message;
  console.error("STOCRANT request failed", error);
  return fallback;
}
