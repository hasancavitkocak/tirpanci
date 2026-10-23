import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { Capacitor } from '@capacitor/core';

/**
 * In-app purchase: "Reklamları kaldır" (a one-time, non-consumable product).
 * Create a product with this id in Google Play Console (Monetize → In-app products) and App Store
 * Connect (non-consumable). In the browser the purchase is simulated in development builds only.
 */
export const REMOVE_ADS_ID = 'remove_ads';

const native = Capacitor.isNativePlatform();

/** True if the player already owns "remove ads" (checked against the store, so it survives a reinstall). */
export async function ownsRemoveAds(): Promise<boolean> {
  if (!native) return false;
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.some((p) => p.productIdentifier === REMOVE_ADS_ID && (p.purchaseState === undefined || p.purchaseState === '1'));
  } catch (e) {
    console.warn('store: getPurchases failed', e);
    return false;
  }
}

/** Store price text, e.g. "₺299,99", or null when the store can't be reached. */
export async function removeAdsPrice(): Promise<string | null> {
  if (!native) return import.meta.env.DEV ? '₺299,99' : null;
  try {
    const { product } = await NativePurchases.getProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    return product.priceString ?? null;
  } catch {
    return null;
  }
}

/** Buy "remove ads"; resolves true when the player owns it afterwards. */
export async function buyRemoveAds(): Promise<boolean> {
  if (!native) return import.meta.env.DEV && confirm('Deneme satın alımı: reklamlar kaldırılsın mı?');
  try {
    const t = await NativePurchases.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    return t.productIdentifier === REMOVE_ADS_ID && (t.purchaseState === undefined || t.purchaseState === '1');
  } catch (e) {
    // Cancelled by the player or the store is unavailable.
    console.warn('store: purchase failed', e);
    return false;
  }
}

/** "Satın alımları geri yükle" (required on iOS). */
export async function restoreRemoveAds(): Promise<boolean> {
  if (!native) return false;
  try {
    await NativePurchases.restorePurchases();
  } catch {
    /* fall through to the check */
  }
  return ownsRemoveAds();
}

/**
 * Coin packs (consumable: bought again and again) and the starter pack (once). Create in-app products
 * with these ids in Google Play Console (Monetize → In-app products; the packs as consumables) and App
 * Store Connect (packs: consumable, starter: non-consumable). `devPrice` shows in the browser only.
 */
export const COIN_PACKS: { id: string; coins: number; name: string; devPrice: string }[] = [
  { id: 'para_10000', coins: 10_000, name: 'Bir Kese Para', devPrice: '₺99,99' },
  { id: 'para_35000', coins: 35_000, name: 'Bir Çuval Para', devPrice: '₺249,99' },
  { id: 'para_100000', coins: 100_000, name: 'Bir Sandık Para', devPrice: '₺549,99' },
];
/** The starter pack: some money, the pro face shield and no more forced ads. Offered for the first days. */
export const STARTER_ID = 'baslangic_paketi';
export const STARTER = { coins: 15_000, devPrice: '₺129,99', days: 3 };

/** Store prices for products ("₺99,99"), by id; the dev prices in a development browser build. */
export async function productPrices(ids: string[]): Promise<Record<string, string>> {
  if (!native) {
    if (!import.meta.env.DEV) return {};
    return Object.fromEntries(ids.map((id) => [id, COIN_PACKS.find((p) => p.id === id)?.devPrice ?? STARTER.devPrice]));
  }
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.INAPP });
    return Object.fromEntries(products.map((p) => [p.identifier, p.priceString]));
  } catch (e) {
    console.warn('store: getProducts failed', e);
    return {};
  }
}

/**
 * Buy a product; resolves true once paid for. Consumables (the coin packs) are consumed on Android so
 * they can be bought again. In a development browser build the purchase is simulated.
 */
export async function buyProduct(id: string, consumable: boolean): Promise<boolean> {
  if (!native) return import.meta.env.DEV && confirm(`Deneme satın alımı: ${id}`);
  try {
    const t = await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, isConsumable: consumable });
    return t.productIdentifier === id && (t.purchaseState === undefined || t.purchaseState === '1');
  } catch (e) {
    // Cancelled by the player or the store is unavailable.
    console.warn('store: purchase failed', e);
    return false;
  }
}

/** True if the player owns the starter pack (checked against the store, so it survives a reinstall). */
export async function ownsStarter(): Promise<boolean> {
  if (!native) return false;
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return purchases.some((p) => p.productIdentifier === STARTER_ID && (p.purchaseState === undefined || p.purchaseState === '1'));
  } catch {
    return false;
  }
}
