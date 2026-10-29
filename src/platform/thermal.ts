import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/**
 * How the phone is doing, from the game's own plugin (plugins/thermal: iOS's thermal state and Low
 * Power Mode, Android's thermal status and battery saver; both the battery): 0 cool .. 3 critical.
 * In the browser (and the tests): always cool, unless the address asks (?thermal=2&lowpower).
 */
export interface PhoneState {
  thermal: number;
  lowPower: boolean;
  /** 0..1, -1 not known. */
  battery: number;
  charging: boolean;
}

interface ThermalPlugin {
  getState(): Promise<PhoneState>;
}

const Thermal = registerPlugin<ThermalPlugin>('Thermal');
const params = new URLSearchParams(location.search);

/** The phone's state now (cool and plugged in if it cannot tell). */
export async function phoneState(): Promise<PhoneState> {
  if (!isNative) {
    return { thermal: Number(params.get('thermal') ?? 0), lowPower: params.has('lowpower'), battery: params.has('lowbattery') ? 0.1 : -1, charging: false };
  }
  try {
    return await Thermal.getState();
  } catch {
    // (A build without the plugin: nothing to go by.)
    return { thermal: 0, lowPower: false, battery: -1, charging: true };
  }
}
