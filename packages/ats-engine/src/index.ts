// Detector
export { detectPlatform } from "./detector/platform-detector";
export { discoverFields } from "./detector/field-detector";

// Matchers
export { classifyField } from "./matchers/label-matcher";

// Autofill
export { autofill } from "./autofill/autofill-engine";
export { setInputValue } from "./autofill/value-setter";
export { answerFieldsWithAI } from "./autofill/ai-answerer";
export type { AIAnswerRequest, AIAnswerResult, AIFieldRequest, ProfileContext } from "./autofill/ai-answerer";

// Adapters
export { getAdapterForUrl, getAllAdapters } from "./adapters/registry";
export type { ATSAdapter } from "./adapters/base-adapter";
