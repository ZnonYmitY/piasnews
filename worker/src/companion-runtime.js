import {
  DISTILLATION_PACKAGE_ID,
  DISTILLATION_PACKAGE_VERSION,
  DISTILLATION_RUNTIME_DATA,
  DISTILLATION_SOURCE_CATALOG,
  DISTILLATION_SOURCE_HASH,
  DISTILLATION_SYSTEM_PROMPT,
} from "./persona-runtime.generated.js";

if (DISTILLATION_PACKAGE_ID !== "piastri-persona-distillation") {
  throw new Error(`Unexpected distillation package: ${DISTILLATION_PACKAGE_ID}`);
}

// Product-facing aliases keep Piastri Fan Companion code independent from the
// source repository's export names and leave room for product-only policy.
export const COMPANION_PACKAGE_VERSION = DISTILLATION_PACKAGE_VERSION;
export const COMPANION_RUNTIME_DATA = DISTILLATION_RUNTIME_DATA;
export const COMPANION_SOURCE_CATALOG = DISTILLATION_SOURCE_CATALOG;
export const COMPANION_SOURCE_HASH = DISTILLATION_SOURCE_HASH;
export const COMPANION_SYSTEM_PROMPT = DISTILLATION_SYSTEM_PROMPT;
