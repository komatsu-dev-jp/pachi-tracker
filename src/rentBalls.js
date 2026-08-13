export const DEFAULT_RENT_BALLS = 250;
export const MIN_RENT_BALLS = 250;
export const MAX_RENT_BALLS = 2000;

export function isValidRentBalls(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_RENT_BALLS && number <= MAX_RENT_BALLS;
}

export function resolveRentBalls(value) {
  const number = Number(value);
  const isValid = isValidRentBalls(value);
  return { value: isValid ? number : DEFAULT_RENT_BALLS, isValid, isAbnormal: !isValid };
}

export function canConfirmRentBallsFallback({ isAbnormal, candidate, effectiveValue } = {}) {
  return isAbnormal === true
    && typeof candidate !== "function"
    && isValidRentBalls(candidate)
    && Number(candidate) === Number(effectiveValue);
}
