#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Client, Databases, Query } from "appwrite";

import {
  createAdminConfig,
  isAlreadyExistsError,
  loadEnvFiles,
  parseArgs,
  request,
  validateAdminConfig,
} from "./lib/appwrite-admin.mjs";

loadEnvFiles();

const cliArgs = parseArgs(process.argv.slice(2), {
  booleanFlags: ["dry-run", "help"],
});
const config = createAdminConfig(cliArgs);
const PRODUCT_IMAGES_BUCKET_ID =
  cliArgs.bucketId ||
  process.env.APPWRITE_PRODUCT_IMAGES_BUCKET_ID ||
  "product-images";
const ICONS_DIR =
  cliArgs.iconsDir ||
  process.env.PRODUCT_IMAGES_SOURCE_DIR ||
  path.join(process.cwd(), "public", "icons");

const PRODUCT_IMAGE_MANIFEST = [
  {
    match: (name) => normalizeProductName(name) === "petrol",
    fileName: "petrol-icon.png",
    fileId: "product_petrol_icon",
    alt: "Petrol",
  },
  {
    match: (name) => normalizeProductName(name) === "diesel",
    fileName: "diesel-icon.png",
    fileId: "product_diesel_icon",
    alt: "Diesel",
  },
  {
    match: (name) => normalizeProductName(name) === "rice (50kg)",
    fileName: "jah-rice-50kg.png",
    fileId: "product_rice_50kg",
    alt: "Rice 50kg",
  },
  {
    match: (name) => normalizeProductName(name) === "rice (25kg)",
    fileName: "jah-rice-25kg.png",
    fileId: "product_rice_25kg",
    alt: "Rice 25kg",
  },
  {
    match: (name) => normalizeProductName(name).includes("cooking oil"),
    fileName: "cooking-oil50l.png",
    fileId: "product_cooking_oil",
    alt: "Cooking oil",
  },
  {
    match: (name) => normalizeProductName(name).includes("cement"),
    fileName: "cement.png",
    fileId: "product_cement",
    alt: "Cement",
  },
  {
    match: (name) => ["onion", "onions"].includes(normalizeProductName(name)),
    fileName: "onions.png",
    fileId: "product_onions",
    alt: "Onions",
  },
];

if (cliArgs.help) {
  printUsage();
  process.exit(0);
}

validateAdminConfig(config);

const databases = createDatabasesClient();

main().catch((error) => {
  console.error(`Product image upload failed: ${error.message}`);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});

async function main() {
  console.log(`Using Appwrite endpoint: ${config.apiBaseUrl}`);
  console.log(`Target database ID: ${config.databaseId}`);
  console.log(`Target bucket ID: ${PRODUCT_IMAGES_BUCKET_ID}`);
  console.log(`Source icons directory: ${ICONS_DIR}`);

  const products = await listProducts();
  const plannedUpdates = products
    .map((product) => ({
      product,
      image: getProductImageManifest(product.name),
    }))
    .filter((entry) => entry.image);

  if (config.dryRun) {
    console.log("Dry run only. No Appwrite files or product records will be changed.");
    plannedUpdates.forEach(({ product, image }) => {
      console.log(
        `- ${product.name}: ${image.fileName} -> ${PRODUCT_IMAGES_BUCKET_ID}/${image.fileId}`,
      );
    });
    return;
  }

  for (const { image } of plannedUpdates) {
    await uploadImageFile(image);
  }

  for (const { product, image } of plannedUpdates) {
    await updateProductImageMetadata(product.$id, {
      image_bucket_id: PRODUCT_IMAGES_BUCKET_ID,
      image_file_id: image.fileId,
      image_alt: image.alt || product.name || "",
    });
    console.log(`Updated product image: ${product.name}`);
  }

  console.log(`Product images are ready: ${plannedUpdates.length} product(s) updated.`);
}

async function listProducts() {
  const documents = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await databases.listDocuments(
      config.databaseId,
      "products",
      [Query.limit(limit), Query.offset(offset)],
    );
    const batch = response.documents || [];

    documents.push(...batch);

    if (batch.length < limit || documents.length >= (response.total || 0)) {
      break;
    }

    offset += limit;
  }

  return documents;
}

async function uploadImageFile(image) {
  const filePath = path.join(ICONS_DIR, image.fileName);
  const fileBuffer = await fs.readFile(filePath);
  const file = new Blob([fileBuffer], {
    type: getContentType(image.fileName),
  });
  const formData = new FormData();

  formData.append("fileId", image.fileId);
  formData.append("file", file, image.fileName);

  try {
    await multipartRequest(
      `/storage/buckets/${PRODUCT_IMAGES_BUCKET_ID}/files`,
      formData,
    );
    console.log(`Uploaded file: ${image.fileName}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`File already exists: ${image.fileName}`);
      return;
    }

    throw error;
  }
}

async function updateProductImageMetadata(productId, data) {
  await databases.updateDocument(
    config.databaseId,
    "products",
    productId,
    data,
  );
}

function createDatabasesClient() {
  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId);

  client.headers["X-Appwrite-Key"] = config.apiKey;

  return new Databases(client);
}

async function multipartRequest(resourcePath, formData) {
  const response = await fetch(`${config.apiBaseUrl}${resourcePath}`, {
    method: "POST",
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Key": config.apiKey,
    },
    body: formData,
  });
  const rawText = await response.text();
  const payload = rawText ? safeJsonParse(rawText) : {};

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

function getProductImageManifest(productName) {
  return PRODUCT_IMAGE_MANIFEST.find((entry) => entry.match(productName)) || null;
}

function normalizeProductName(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  return "application/octet-stream";
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/upload-product-images-to-appwrite.mjs

Required environment variables:
  NEXT_PUBLIC_APPWRITE_ENDPOINT
  NEXT_PUBLIC_APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_DATABASE_ID

Optional environment variables:
  APPWRITE_PRODUCT_IMAGES_BUCKET_ID
  PRODUCT_IMAGES_SOURCE_DIR

Optional flags:
  --bucketId <id>
  --iconsDir <path>
  --dry-run
  --help
`);
}
