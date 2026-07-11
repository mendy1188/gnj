export const clientAppSettings = {
  buyFuel: {
    rewardProgram: {
      pointsPerTwentyDalasi: 1,
      appBonusMultiplier: 2,
      redemptionValuePerPoint: 0.1,
      samplePointsBalance: 1480,
    },
    fuelProducts: [
      { code: "petrol", label: "Petrol", pricePerLitre: 112 },
      { code: "diesel", label: "Diesel", pricePerLitre: 115 },
    ],
    mobileMoneyProviders: [
      { code: "wave", label: "Wave", placeholder: "Enter Wave number" },
      { code: "qmoney", label: "QMoney", placeholder: "Enter QMoney number" },
      { code: "afrimoney", label: "Afrimoney", placeholder: "Enter Afrimoney number" },
    ],
  },
  bulkBalance: {
    supportedProducts: [
      {
        code: "petrol",
        label: "Petrol",
        pricePerUnit: 112,
        unit: "litre",
        sampleFundedAmount: 100000,
        sampleRedeemedAmount: 18600,
      },
      {
        code: "diesel",
        label: "Diesel",
        pricePerUnit: 115,
        unit: "litre",
        sampleFundedAmount: 75000,
        sampleRedeemedAmount: 12650,
      },
    ],
    sampleTopUpAmount: 100000,
    sampleLastRedeemedAmount: 18600,
    sampleReferenceCode: "BLK-PETROL-0001",
  },
};
