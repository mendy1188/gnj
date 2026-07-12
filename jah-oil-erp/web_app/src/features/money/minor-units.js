const MINOR_UNIT_SCALE = 100;

export function toMinorUnits(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * MINOR_UNIT_SCALE);
}

export function fromMinorUnits(value) {
  const minorUnits = Number(value || 0);

  if (!Number.isFinite(minorUnits)) {
    return 0;
  }

  return Number((minorUnits / MINOR_UNIT_SCALE).toFixed(2));
}

export function roundCurrency(value) {
  return fromMinorUnits(toMinorUnits(value));
}

export function sumCurrency(values) {
  const totalMinorUnits = (Array.isArray(values) ? values : []).reduce(
    (total, value) => total + toMinorUnits(value),
    0,
  );

  return fromMinorUnits(totalMinorUnits);
}
