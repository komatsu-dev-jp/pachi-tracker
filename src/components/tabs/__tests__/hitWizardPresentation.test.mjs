import assert from "node:assert/strict";
import test from "node:test";
import { getHitWizardPresentation } from "../hitWizardPresentation.js";
test("cash keeps push step while ball play embeds correction in rotation", () => { assert.deepEqual(getHitWizardPresentation({ playMode: "cash" }), { showPushStep: true, showPushCorrectionInRotation: false }); assert.deepEqual(getHitWizardPresentation({ playMode: "mochi" }), { showPushStep: false, showPushCorrectionInRotation: true }); });
