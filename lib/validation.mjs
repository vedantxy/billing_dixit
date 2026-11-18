export class BillingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function ensure(condition, message, status) {
  if (!condition) throw new BillingError(message, status);
}
export function clean(value, label, limit = 150, required = true) {
  ensure(
    typeof value === "string" && value.trim().length <= limit,
    label + " is invalid or too long.",
  );
  const result = value.trim();
  ensure(!required || result.length > 0, label + " is required.");
  return result;
}
export function integer(value, label, min = 0, max = 2000000000) {
  ensure(
    Number.isSafeInteger(value) && value >= min && value <= max,
    label + " is outside the allowed range.",
  );
  return value;
}
export function choose(value, options, label) {
  ensure(options.includes(value), "Choose a valid " + label + ".");
  return value;
}
export function dateValue(value, label) {
  ensure(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value >= "1900-01-01" &&
      value <= "9998-12-31",
    label + " must be a valid date.",
  );
  const stamp = new Date(value + "T00:00:00Z");
  ensure(
    !Number.isNaN(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value,
    label + " must be a valid date.",
  );
  return value;
}
export function flag(value) {
  ensure(typeof value === "boolean", "Choose enabled or disabled.");
  return value;
}
