export function getCommoditySales(records) {
  return records.filter((record) => record.type !== "Fuel" && record.type !== "Cement");
}

export function buildStationSummary(records) {
  const summary = {};

  records.forEach((record) => {
    if (!summary[record.station]) {
      summary[record.station] = {
        station: record.station,
        lastDate: record.date,
        totalAmount: 0,
        totalQuantity: 0,
        transactions: 0,
      };
    }

    summary[record.station].totalAmount += record.amount;
    summary[record.station].totalQuantity += record.quantity;
    summary[record.station].transactions += 1;

    if (record.date > summary[record.station].lastDate) {
      summary[record.station].lastDate = record.date;
    }
  });

  return Object.values(summary).map((station, index) => ({
    id: index + 1,
    ...station,
  }));
}

export function buildStationItemBreakdown(records) {
  const breakdown = {};

  records.forEach((record) => {
    if (!breakdown[record.item]) {
      breakdown[record.item] = {
        item: record.item,
        type: record.type,
        totalQuantity: 0,
        totalAmount: 0,
        transactions: 0,
      };
    }

    breakdown[record.item].totalQuantity += record.quantity;
    breakdown[record.item].totalAmount += record.amount;
    breakdown[record.item].transactions += 1;
  });

  return Object.values(breakdown);
}
