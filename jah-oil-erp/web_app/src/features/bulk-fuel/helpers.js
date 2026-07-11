export function normalizeBulkFuelPhone(value) {
  return `${value || ""}`.trim();
}

export function buildBulkFuelPurchaseReference({
  clientPhone = "",
  productName = "",
  purchaseDate = "",
}) {
  const phoneCode = normalizeBulkFuelPhone(clientPhone)
    .replace(/[^0-9]+/g, "")
    .slice(-4) || "0000";
  const productCode = `${productName || ""}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 3) || "FUL";
  const dateCode =
    `${purchaseDate || ""}`.replace(/[^0-9]+/g, "").slice(-6) ||
    new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randomCode = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `BFP-${productCode}-${phoneCode}-${dateCode}-${randomCode}`.slice(0, 64);
}

export function formatBulkFuelClientStatusLabel(value) {
  return `${value || ""}`.trim().toLowerCase() === "inactive" ? "Inactive" : "Active";
}

export function formatBulkFuelPurchaseStatusLabel(value, balanceAmount = 0) {
  const normalizedValue = `${value || ""}`.trim().toLowerCase();
  const normalizedBalance = Number(balanceAmount || 0);

  if (normalizedValue === "suspended") {
    return "Suspended";
  }

  if (normalizedValue === "inactive") {
    return "Inactive";
  }

  if (normalizedBalance <= 0) {
    return "Redeemed";
  }

  return "Active";
}

export function isBulkFuelPurchaseRecord(account) {
  if (`${account?.accountType || ""}` !== "bulk_redeem") {
    return false;
  }

  const productCategory = `${account?.productCategory || ""}`.trim().toLowerCase();
  const productName = `${account?.productName || ""}`.trim().toLowerCase();

  return (
    productCategory === "fuel" ||
    productName.includes("petrol") ||
    productName.includes("diesel")
  );
}

export function isActiveBulkFuelPurchase(account) {
  return (
    `${account?.status || ""}`.trim().toLowerCase() === "active" &&
    Number(account?.balanceAmount || 0) > 0
  );
}

export function getBulkFuelPurchaseStatusRank(account) {
  if (isActiveBulkFuelPurchase(account)) {
    return 0;
  }

  if (`${account?.status || ""}`.trim().toLowerCase() === "suspended") {
    return 1;
  }

  if (`${account?.status || ""}`.trim().toLowerCase() === "inactive") {
    return 2;
  }

  return 3;
}

export function buildBulkFuelPurchaseRows(balanceAccounts, movementRecords = []) {
  const sourceAccounts = Array.isArray(balanceAccounts) ? balanceAccounts : [];
  const sourceMovements = Array.isArray(movementRecords) ? movementRecords : [];

  return sourceAccounts
    .filter(isBulkFuelPurchaseRecord)
    .map((account) => {
      const accountMovements = sourceMovements.filter(
        (movement) => movement.accountId === account.id,
      );
      const purchaseAmount = Number(
        accountMovements
          .filter((movement) => Number(movement.amountDelta || 0) > 0)
          .reduce((sum, movement) => sum + Number(movement.amountDelta || 0), 0)
          .toFixed(2),
      ) || Number(account.balanceAmount || 0);
      const redeemedAmount = Number(
        Math.abs(
          accountMovements
            .filter((movement) => Number(movement.amountDelta || 0) < 0)
            .reduce((sum, movement) => sum + Number(movement.amountDelta || 0), 0),
        ).toFixed(2),
      );

      return {
        ...account,
        clientName: account.customerName || "",
        clientPhone: account.customerPhone || "",
        purchaseAmount,
        redeemedAmount,
        availableBalance: Number(account.balanceAmount || 0),
        isActive: isActiveBulkFuelPurchase(account),
      };
    })
    .sort(
      (left, right) =>
        getBulkFuelPurchaseStatusRank(left) - getBulkFuelPurchaseStatusRank(right) ||
        `${right.updatedAt || right.createdAt || ""}`.localeCompare(
          `${left.updatedAt || left.createdAt || ""}`,
        ) ||
        left.clientName.localeCompare(right.clientName),
    );
}

export function buildBulkFuelClientRows(clients, purchaseRows = []) {
  const sourceClients = Array.isArray(clients) ? clients : [];
  const sourcePurchases = Array.isArray(purchaseRows) ? purchaseRows : [];
  const clientByPhone = new Map();

  sourceClients.forEach((client) => {
    const normalizedPhone = normalizeBulkFuelPhone(client.phone);

    if (!normalizedPhone) {
      return;
    }

    clientByPhone.set(normalizedPhone, {
      key: normalizedPhone,
      id: client.id || "",
      name: client.name || "",
      phone: normalizedPhone,
      address: client.address || "",
      dateJoined: client.dateJoined || "",
      status: client.status || "active",
      notes: client.notes || "",
      createdAt: client.createdAt || "",
      updatedAt: client.updatedAt || "",
    });
  });

  sourcePurchases.forEach((purchase) => {
    const normalizedPhone = normalizeBulkFuelPhone(purchase.clientPhone);

    if (!normalizedPhone || clientByPhone.has(normalizedPhone)) {
      return;
    }

    clientByPhone.set(normalizedPhone, {
      key: normalizedPhone,
      id: "",
      name: purchase.clientName || "Unknown Client",
      phone: normalizedPhone,
      address: "",
      dateJoined: "",
      status: "active",
      notes: "",
      createdAt: purchase.createdAt || "",
      updatedAt: purchase.updatedAt || "",
    });
  });

  return Array.from(clientByPhone.values())
    .map((client) => {
      const clientPurchases = sourcePurchases.filter(
        (purchase) => normalizeBulkFuelPhone(purchase.clientPhone) === client.phone,
      );
      const activePurchases = clientPurchases.filter((purchase) => purchase.isActive);

      return {
        ...client,
        purchaseCount: clientPurchases.length,
        activePurchaseCount: activePurchases.length,
        availableBalance: Number(
          activePurchases
            .reduce(
              (sum, purchase) => sum + Number(purchase.availableBalance || 0),
              0,
            )
            .toFixed(2),
        ),
      };
    })
    .sort(
      (left, right) =>
        right.activePurchaseCount - left.activePurchaseCount ||
        right.availableBalance - left.availableBalance ||
        `${right.dateJoined || ""}`.localeCompare(`${left.dateJoined || ""}`) ||
        left.name.localeCompare(right.name),
    );
}
