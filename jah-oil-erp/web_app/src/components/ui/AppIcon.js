import { cloneElement, isValidElement } from "react";
import {
  HiOutlineArchiveBox,
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineBanknotes,
  HiOutlineBell,
  HiOutlineBeaker,
  HiOutlineBolt,
  HiOutlineBuildingOffice2,
  HiOutlineChartBar,
  HiOutlineChartBarSquare,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineCube,
  HiOutlineCursorArrowRays,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineGift,
  HiOutlineHashtag,
  HiOutlineMapPin,
  HiOutlinePauseCircle,
  HiOutlinePlus,
  HiOutlineShieldCheck,
  HiOutlineShoppingBag,
  HiOutlineShoppingCart,
  HiOutlineTag,
  HiOutlineTicket,
  HiOutlineTruck,
  HiOutlineUsers,
  HiOutlineWrenchScrewdriver,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
  FaCalculator,
  FaCompass,
  FaGasPump,
  FaOilCan,
  FaScaleBalanced,
  FaTrophy,
} from "react-icons/fa6";

const ICON_COMPONENTS = {
  dashboard: HiOutlineChartBarSquare,
  coupon: HiOutlineTicket,
  coupons: HiOutlineTicket,
  bulk: FaOilCan,
  fuel: FaGasPump,
  diesel: FaOilCan,
  station: HiOutlineBuildingOffice2,
  building: HiOutlineBuildingOffice2,
  inventory: HiOutlineArchiveBox,
  box: HiOutlineArchiveBox,
  tag: HiOutlineTag,
  wrench: HiOutlineWrenchScrewdriver,
  payment: HiOutlineBanknotes,
  card: HiOutlineBanknotes,
  gift: HiOutlineGift,
  receipt: HiOutlineDocumentText,
  bank: HiOutlineBanknotes,
  reverse: HiOutlineArrowUturnLeft,
  download: HiOutlineArrowDownTray,
  cement: HiOutlineCube,
  truck: HiOutlineTruck,
  shop: HiOutlineShoppingBag,
  cart: HiOutlineShoppingCart,
  reports: HiOutlineChartBar,
  admin: HiOutlineShieldCheck,
  settings: HiOutlineCog6Tooth,
  users: HiOutlineUsers,
  money: HiOutlineBanknotes,
  pin: HiOutlineMapPin,
  active: HiOutlineCheckCircle,
  paused: HiOutlinePauseCircle,
  measure: FaScaleBalanced,
  warning: HiOutlineExclamationTriangle,
  trophy: FaTrophy,
  bolt: HiOutlineBolt,
  document: HiOutlineDocumentText,
  compass: FaCompass,
  eye: HiOutlineEye,
  hashtag: HiOutlineHashtag,
  plus: HiOutlinePlus,
  clock: HiOutlineClock,
  target: HiOutlineCursorArrowRays,
  beaker: HiOutlineBeaker,
  sync: HiOutlineArrowPath,
  bell: HiOutlineBell,
  close: HiOutlineXMark,
  calculator: FaCalculator,
};

const LEGACY_ICON_ALIASES = {
  "📊": "dashboard",
  "🎟️": "coupon",
  "🛢️": "diesel",
  "🏢": "building",
  "📦": "box",
  "🏷️": "tag",
  "🛠️": "wrench",
  "💳": "card",
  "🎁": "gift",
  "🧾": "receipt",
  "⛽": "fuel",
  "🏦": "bank",
  "↩️": "reverse",
  "📥": "download",
  "🧱": "cement",
  "🚚": "truck",
  "🥖": "shop",
  "🛒": "cart",
  "📈": "reports",
  "🛡️": "admin",
  "⚙️": "settings",
  "👥": "users",
  "💰": "money",
  "📌": "pin",
  "💵": "money",
  "✅": "active",
  "⏸️": "paused",
  "🧮": "calculator",
  "🏗️": "cement",
  "📏": "measure",
  "🍚": "shop",
  "🫗": "beaker",
  "⚠️": "warning",
  "🎯": "target",
  "↘️": "download",
  "🔢": "hashtag",
  "➕": "plus",
  "🕒": "clock",
  "📄": "document",
  "🧭": "compass",
  "👁️": "eye",
  "💸": "money",
  "⚡": "bolt",
  "🔔": "bell",
  "✕": "close",
};

function resolveIconName(name) {
  const normalizedValue = `${name || ""}`.trim();

  if (!normalizedValue) {
    return "";
  }

  return LEGACY_ICON_ALIASES[normalizedValue] || normalizedValue;
}

export function AppIcon({
  name,
  className = "",
  title = "",
  spin = false,
}) {
  if (isValidElement(name)) {
    return cloneElement(name, {
      className: `${name.props.className || ""} ${className}`.trim(),
      "aria-hidden": title ? undefined : true,
      ...(title ? { title } : {}),
    });
  }

  const resolvedName = resolveIconName(name);
  const IconComponent = ICON_COMPONENTS[resolvedName];

  if (!IconComponent) {
    return null;
  }

  return (
    <IconComponent
      aria-hidden={title ? undefined : true}
      title={title || undefined}
      className={`${className} ${spin ? "animate-spin" : ""}`.trim()}
    />
  );
}

export function resolveIconKey(name) {
  return resolveIconName(name);
}
