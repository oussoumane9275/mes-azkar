package com.oussoumane.azkar;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridges prayer-time inputs (location + resolved calc config) from the JS
// app into SharedPreferences the home-screen widget can read natively — the
// widget lives outside the WebView and has no access to the app's
// localStorage, so this is the only way it sees live data. The widget
// recomputes prayer times itself from these inputs, so it stays accurate
// even hours after the app was last opened.
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    public static final String PREFS_NAME = "azkar_widget_prefs";

    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        if (call.hasOption("lat")) editor.putFloat("lat", call.getDouble("lat").floatValue());
        if (call.hasOption("lng")) editor.putFloat("lng", call.getDouble("lng").floatValue());
        if (call.hasOption("locationLabel")) editor.putString("locationLabel", call.getString("locationLabel"));
        if (call.hasOption("fajrAngle")) editor.putFloat("fajrAngle", call.getDouble("fajrAngle").floatValue());
        if (call.hasOption("ishaAngle")) editor.putFloat("ishaAngle", call.getDouble("ishaAngle").floatValue());
        if (call.hasOption("ishaMinutesAfterMaghrib")) {
            Double v = call.getDouble("ishaMinutesAfterMaghrib");
            editor.putFloat("ishaMinutesAfterMaghrib", v == null ? -1f : v.floatValue());
        } else {
            editor.putFloat("ishaMinutesAfterMaghrib", -1f);
        }
        String[] offsetKeys = { "fajrOffset", "sunriseOffset", "dhuhrOffset", "asrOffset", "maghribOffset", "ishaOffset" };
        for (String key : offsetKeys) {
            if (call.hasOption(key)) editor.putFloat(key, call.getDouble(key).floatValue());
        }
        String[] iqamaKeys = { "iqamaFajr", "iqamaDhuhr", "iqamaAsr", "iqamaMaghrib", "iqamaIsha" };
        for (String key : iqamaKeys) {
            if (call.hasOption(key)) editor.putInt(key, call.getInt(key, 0));
        }
        String[] notifyKeys = { "notifyFajr", "notifyDhuhr", "notifyAsr", "notifyMaghrib", "notifyIsha" };
        for (String key : notifyKeys) {
            if (call.hasOption(key)) editor.putBoolean(key, Boolean.TRUE.equals(call.getBoolean(key)));
        }
        editor.apply();

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, AzkarWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        AzkarWidgetProvider.updateAllWidgets(context, manager, ids);

        call.resolve(new JSObject());
    }
}
