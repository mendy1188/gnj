# Next.js starter kit with Appwrite

Kickstart your Next.js development with this ready-to-use starter project integrated with [Appwrite](https://www.appwrite.io)

## 🚀Getting started

###
Clone the Project
Clone this repository to your local machine using Git:

`git clone https://github.com/appwrite/starter-for-nextjs`

## 🛠️ Development guid
1. **Configure Appwrite**<br/>
   Navigate to `.env` and update the values to match your Appwrite project credentials.
2. **Customize as needed**<br/>
   Modify the starter kit to suit your app's requirements. Adjust UI, features, or backend
   integrations as per your needs.
3. **Install dependencies**<br/>
   Run `npm install` to install all dependencies.
4. **Run the app**<br/>
   Start the project by running `npm run dev`.

## 💡 Additional notes
- This starter project is designed to streamline your Next.js development with Appwrite.
- Refer to the [Appwrite documentation](https://appwrite.io/docs) for detailed integration guidance.

## Appwrite schema bootstrap

This repo includes a zero-dependency Node script that creates the main database collections used by the current mocked ERP flows:

- `stations`
- `products`
- `inventory_items`
- `fuel_deliveries`
- `sales_receipts`
- `sales_receipt_items`

The sales model is normalized for POS: one receipt can contain multiple line items, so receipt headers and receipt lines are stored separately.

### Required environment variables

Add these to `.env.local`:

```bash
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
APPWRITE_DATABASE_ID=
APPWRITE_API_KEY=
```

`APPWRITE_API_KEY` must be a server key with database write access.

### Run the script

```bash
npm run appwrite:schema
```

Optional dry run:

```bash
node scripts/create-appwrite-schema.mjs --dry-run
```

### Seed mock records

After the schema exists, seed the current mocked ERP data into Appwrite:

```bash
npm run appwrite:seed
```

Dry run:

```bash
node scripts/seed-appwrite-records.mjs --dry-run
```

The seed script:

- loads `src/lib/data/mockData.js`
- creates base `stations`, `products`, `inventory_items`, and `fuel_deliveries` records
- creates normalized `sales_receipts` and `sales_receipt_items` records
- includes extra POS receipts with multiple line items so the receipt model reflects the POS requirement
