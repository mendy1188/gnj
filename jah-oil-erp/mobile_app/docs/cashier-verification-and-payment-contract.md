# Client Mobile Cashier Verification and Payment Confirmation Contract

This contract is intended for the client mobile app fuel checkout flow.

## 1. Verify cashier QR code

- **Route:** `POST /api/mobile/client/cashiers/verify`
- **Purpose:** Resolve a scanned cashier QR code to a valid cashier/station before checkout continues.

### Request body

```json
{
  "qrCode": "JAH-BANJUL-AMIE",
  "requestedFlow": "fuel_purchase"
}
```

### Allowed `requestedFlow`

- `fuel_purchase`
- `bulk_redeem`

### Success response

```json
{
  "success": true,
  "contractVersion": "2026-06-21",
  "requestedFlow": "fuel_purchase",
  "verifiedAt": "2026-06-21T12:15:30.000Z",
  "cashier": {
    "id": "cashier-amie",
    "qrCode": "JAH-BANJUL-AMIE",
    "name": "Amie",
    "stationId": "",
    "stationName": "Banjul Station",
    "roleName": "Fuel Sales",
    "capabilities": {
      "buyFuel": true,
      "redeemBulkFuel": true
    },
    "source": "demo"
  }
}
```

## 2. Confirm payment

- **Route:** `POST /api/mobile/client/payments/confirm`
- **Purpose:** Normalize the final payment-confirmation payload after cashier verification and before sale persistence/provider integration.

### Request body

```json
{
  "checkoutType": "fuel_purchase",
  "cashierQrCode": "JAH-BANJUL-AMIE",
  "providerCode": "wave",
  "providerStatus": "confirmed",
  "providerReference": "WAVE-REF-12345",
  "productCode": "petrol",
  "amount": 2000,
  "currency": "GMD",
  "pointsToRedeem": 0,
  "client": {
    "fullName": "Client Customer",
    "phone": "+2207000000"
  }
}
```

### Allowed `checkoutType`

- `fuel_purchase`
- `bulk_redeem`

### Allowed `providerStatus`

- `pending`
- `authorized`
- `confirmed`
- `failed`

### Accepted response

```json
{
  "success": true,
  "contractVersion": "2026-06-21",
  "message": "Payment confirmation contract accepted. Provider settlement and sale persistence should be implemented next.",
  "confirmation": {
    "confirmationId": "mcp_abc123_xyz456",
    "status": "accepted",
    "providerCode": "wave",
    "providerStatus": "confirmed",
    "providerReference": "WAVE-REF-12345",
    "checkoutType": "fuel_purchase",
    "productCode": "petrol",
    "amount": 2000,
    "currency": "GMD",
    "pointsToRedeem": 0,
    "recordedSale": false,
    "verifiedAt": "2026-06-21T12:16:12.000Z"
  },
  "cashier": {
    "id": "cashier-amie",
    "qrCode": "JAH-BANJUL-AMIE",
    "name": "Amie",
    "stationId": "",
    "stationName": "Banjul Station",
    "roleName": "Fuel Sales",
    "capabilities": {
      "buyFuel": true,
      "redeemBulkFuel": true
    },
    "source": "demo"
  },
  "client": {
    "fullName": "Client Customer",
    "phone": "+2207000000"
  },
  "nextAction": {
    "type": "persist_sale_after_provider_integration",
    "route": "/api/mobile/client/payments/confirm"
  }
}
```

## Notes

- Current backend behavior defines and validates the contract, but it does **not** yet persist a client mobile sale into ERP sales tables.
- Current verification supports:
  - demo QR codes already used in the mobile app
  - app user lookup for active `Fuel Sales` / `General Sales` users when QR structure matches `JAH-<STATION>-<NAME>`
- Real provider integration should later:
  - validate mobile-money callback signatures
  - enforce idempotency
  - persist the finalized sale into ERP collections
  - issue a receipt or transaction reference back to the client app
