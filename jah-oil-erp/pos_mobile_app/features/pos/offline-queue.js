import storage from "../storage/local-storage";

const POS_PENDING_SALES_KEY = "jah_pos_mobile_pending_sales_v1";

function safeParseJson(value, fallbackValue) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

async function loadPendingPosSales() {
  const raw = await storage.getItem(POS_PENDING_SALES_KEY);
  const queue = safeParseJson(raw, []);

  return Array.isArray(queue) ? queue : [];
}

async function savePendingPosSales(queue) {
  await storage.setItem(
    POS_PENDING_SALES_KEY,
    JSON.stringify(Array.isArray(queue) ? queue : []),
  );
}

async function removePendingPosSale(saleId) {
  const normalizedSaleId = `${saleId || ""}`.trim();

  if (!normalizedSaleId) {
    return;
  }

  const nextQueue = (await loadPendingPosSales()).filter(
    (entry) => `${entry?.id || ""}` !== normalizedSaleId,
  );

  await savePendingPosSales(nextQueue);
}

const offlineQueue = {
  loadPendingPosSales,
  savePendingPosSales,
  removePendingPosSale,
};

export default offlineQueue;
