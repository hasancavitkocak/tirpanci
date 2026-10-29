package com.kraltirpan.thermal;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * How warm the phone is (0 nominal, 1 fair, 2 serious, 3 critical: PowerManager's thermal status from
 * Android 10, else the battery's temperature), whether battery saver is on, and its battery (level 0..1,
 * -1 unknown; charging). The game asks every few seconds.
 */
@CapacitorPlugin(name = "Thermal")
public class ThermalPlugin extends Plugin {

    @PluginMethod
    public void getState(PluginCall call) {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        Intent battery = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int thermal = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null) {
            // NONE, LIGHT: nominal; MODERATE: fair; SEVERE: serious; CRITICAL and beyond: critical.
            int s = pm.getCurrentThermalStatus();
            thermal = s >= PowerManager.THERMAL_STATUS_CRITICAL ? 3 : s == PowerManager.THERMAL_STATUS_SEVERE ? 2 : s == PowerManager.THERMAL_STATUS_MODERATE ? 1 : 0;
        } else if (battery != null) {
            // (Older phones: the battery's temperature, tenths of a degree.)
            float t = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10f;
            thermal = t >= 45 ? 3 : t >= 42 ? 2 : t >= 39 ? 1 : 0;
        }
        double level = -1;
        boolean charging = false;
        if (battery != null) {
            int l = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (l >= 0 && scale > 0) level = l / (double) scale;
            int st = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            charging = st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL;
        }
        JSObject r = new JSObject();
        r.put("thermal", thermal);
        r.put("lowPower", pm != null && pm.isPowerSaveMode());
        r.put("battery", level);
        r.put("charging", charging);
        call.resolve(r);
    }
}
