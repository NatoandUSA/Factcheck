// Browser adapter for the CommonJS canonical contract. Keeping the decision
// logic in one file prevents the Vite path and the Node test path drifting.
import contract from './xrayUploadOutcome.cjs';

export function deriveXrayUploadOutcome(input = {}) {
  return contract.deriveXrayUploadOutcome(input);
}
