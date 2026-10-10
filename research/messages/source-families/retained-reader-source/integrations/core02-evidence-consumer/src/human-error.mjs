// Human-only bounded catch formatter; original machine stdout is unchanged.
const messages = Object.freeze({
  EXPECTED_ONE_FIXED_PROFILE: 'Select exactly one existing fixed profile for this inspection.',
  VERIFIER_PROFILE_MISMATCH: 'The selected profile does not match the expected catalogue and verifier. Keep the selected inputs and ask the maintainer to reconcile their source pins.',
  INSPECTION_OUTPUT_LIMIT: 'The inspection result exceeds its 65,536-byte output limit. No complete report was printed. Keep the selected profile and report this limit to the maintainer.',
  COMPARISON_ACCEPTS_NO_ARGUMENTS: 'The comparison command does not accept extra arguments. Use node src/inspect.mjs compare.',
  COMPARISON_OUTPUT_LIMIT: 'The comparison result exceeds its 131,072-byte output limit. No complete comparison was printed. Keep the selected profiles and report this limit to the maintainer.',
  'Usage: node src/inspect.mjs compare | core02-packet | core02-simulated': 'Choose one supported command: node src/inspect.mjs compare | core02-packet | core02-simulated.'
});
export function humanInspectionError(error) {
  const descriptor = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error,'message') : undefined;
  const key = descriptor && typeof descriptor.value === 'string' ? descriptor.value : '';
  return Object.hasOwn(messages,key) ? messages[key] : 'The inspection could not report a result. Its cause was not identified. Keep the original command and selected profile; ask the maintainer to inspect the retained evidence and source pins. This message does not establish how far the operation progressed or make another attempt safe.';
}
