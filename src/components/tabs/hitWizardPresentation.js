export function getHitWizardPresentation({ playMode, isYutimeOrigin = false } = {}) {
  const isBallPlay = playMode === "mochi" || playMode === "chodama";
  return {
    showPushStep: !isYutimeOrigin && !isBallPlay,
    showPushCorrectionInRotation: !isYutimeOrigin && isBallPlay,
  };
}
