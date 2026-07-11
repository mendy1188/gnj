function getPaymentMethodLines(paymentMethodValue) {
  const normalizedValue = `${paymentMethodValue || ""}`.trim();

  if (!normalizedValue) {
    return null;
  }

  const creditMatch = normalizedValue.match(/^credit\s*\((.+)\)$/i);

  if (!creditMatch) {
    return {
      primary: normalizedValue,
      secondary: "",
    };
  }

  return {
    primary: "Credit",
    secondary: `${creditMatch[1] || ""}`.trim(),
  };
}

export function renderPaymentMethodCell(row) {
  const paymentMethodLines = getPaymentMethodLines(row?.paymentMethod);

  if (!paymentMethodLines) {
    return "—";
  }

  if (!paymentMethodLines.secondary) {
    return paymentMethodLines.primary;
  }

  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-slate-900">
        {paymentMethodLines.primary}
      </p>
      <p className="text-xs text-slate-500">{paymentMethodLines.secondary}</p>
    </div>
  );
}
