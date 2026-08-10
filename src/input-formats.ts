import { API_VERSION } from "./api-server.js";
import { ANSWER_EXTENSIONS, SOURCE_EXTENSIONS } from "./workflow.js";

export interface InputFormatContract {
  version: string;
  sources: string[];
  answers: string[];
}

/** Return the versioned, JSON-friendly input contract for integrations. */
export function getInputFormatContract(): InputFormatContract {
  return {
    version: API_VERSION,
    sources: [...SOURCE_EXTENSIONS].sort(),
    answers: [...ANSWER_EXTENSIONS].sort(),
  };
}
