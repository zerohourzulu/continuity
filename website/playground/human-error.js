// Presentation only; no arbitrary exception text or user fields are echoed.
const knownMessages = new Set([
  "The scenario JSON could not be read within this playground’s format and limits. Check a scenario saved with “Download scenario”.",
  "The scenario check did not finish. This does not judge the scenario bad. The software could not track the cause; possible causes include a crash, timeout or unexpected error. Keep the downloaded scenario and report the problem to the site maintainer. This message does not establish how far the check got.",
  "This file is too large to open here. A scenario file can be at most 32 KiB (32,768 bytes). Choose a scenario saved from this playground with “Download scenario”.",
  "Choose an available step, agent and operation.",
  "Collect another packet",
  "Core could not capture this history.",
  "Each exclusive role needs one owner.",
  "Invalid direct permission.",
  "Invalid role assignment or operation list.",
  "Permission choices must be true or false.",
  "Quarantine a file",
  "Recorded example unavailable",
  "Review the packet",
  "Send scenario JSON text only.",
  "Synthetic policy observation. No new signed admission, file action, containment or real incident.",
  "The midnight handover",
  "The scenario has unexpected or missing fields.",
  "This scenario has too many events. Reduce the permissions.",
  "This scenario is too large. The limit is 32 KiB (32,768 bytes). Keep the saved scenario; changing it creates a different scenario.",
  "Unexpected engine response.",
  "Use 2–12 distinct agent names, each up to 24 characters.",
  "Use a scenario version 1 and a case name of 1–64 characters.",
  "Use at most 32 direct permissions.",
  "Use at most seven extra roles (eight including investigator)."
]);
const knownCodes = new Set(['INVALID_UTF8','INVALID_JSON','DUPLICATE_KEY','JSON_BYTES_EXCEEDED','JSON_DEPTH_EXCEEDED','JSON_NODES_EXCEEDED','INVALID_JSON_NUMBER']);
export function humanPlaygroundError(error) {
  const message=typeof error==='string'?error:error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:undefined;
  if (knownMessages.has(message)) return message;
  const code=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined;
  if (knownCodes.has(code)) return 'The scenario JSON could not be read within this playground’s format and limits. Check a scenario saved with “Download scenario”.';
  return 'The scenario check did not finish. This does not judge the scenario bad. The software could not track the cause; possible causes include a crash, timeout or unexpected error. Keep the downloaded scenario and report the problem to the site maintainer. This message does not establish how far the check got.';
}
