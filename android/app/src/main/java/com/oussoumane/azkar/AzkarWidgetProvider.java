package com.oussoumane.azkar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.TimeZone;

// Home-screen widget: today's 6 prayer times, mirroring the prayer-times
// card on the app's home screen. Recomputed natively from the location/
// method last pushed by the JS app (see WidgetBridgePlugin) so the widget
// stays accurate all day, without needing the app to be open.
public class AzkarWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void updateAllWidgets(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null) return;
        for (int id : ids) {
            RemoteViews views = buildViews(context);
            manager.updateAppWidget(id, views);
        }
    }

    private static final int COLOR_GOLD = Color.parseColor("#D9A94A");
    private static final int COLOR_INK = Color.parseColor("#23291F");
    private static final int COLOR_LABEL = Color.parseColor("#6B6558");

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_azkar);
        SharedPreferences prefs = context.getSharedPreferences(WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE);

        double lat = prefs.getFloat("lat", 48.8375f);
        double lng = prefs.getFloat("lng", 2.2429f);
        String locationLabel = prefs.getString("locationLabel", "Mes Azkar");
        double fajrAngle = prefs.getFloat("fajrAngle", 16f);
        double ishaAngle = prefs.getFloat("ishaAngle", 15f);
        float ishaMinutesAfterMaghribRaw = prefs.getFloat("ishaMinutesAfterMaghrib", -1f);
        Double ishaMinutesAfterMaghrib = ishaMinutesAfterMaghribRaw >= 0 ? (double) ishaMinutesAfterMaghribRaw : null;
        double fajrOffset = prefs.getFloat("fajrOffset", 0f);
        double sunriseOffset = prefs.getFloat("sunriseOffset", 0f);
        double dhuhrOffset = prefs.getFloat("dhuhrOffset", 0f);
        double asrOffset = prefs.getFloat("asrOffset", 0f);
        double maghribOffset = prefs.getFloat("maghribOffset", 0f);
        double ishaOffset = prefs.getFloat("ishaOffset", 0f);

        views.setTextViewText(R.id.tv_location, locationLabel.toUpperCase());

        Calendar now = Calendar.getInstance();
        double[] decimals = computeTimes(
            now,
            lat,
            lng,
            fajrAngle,
            ishaAngle,
            ishaMinutesAfterMaghrib,
            fajrOffset,
            sunriseOffset,
            dhuhrOffset,
            asrOffset,
            maghribOffset,
            ishaOffset
        );
        // order: fajr, sunrise, dhuhr, asr, maghrib, isha
        String[] labels = { "Fajr", "Chourouk", "Dohr", "Asr", "Maghrib", "Isha" };
        int[] timeViewIds = {
            R.id.tv_time_fajr,
            -1, // sunrise has its own row below, not in the main grid
            R.id.tv_time_dhuhr,
            R.id.tv_time_asr,
            R.id.tv_time_maghrib,
            R.id.tv_time_isha,
        };
        for (int i = 0; i < 6; i++) {
            if (timeViewIds[i] == -1) continue;
            views.setTextViewText(timeViewIds[i], formatHour(decimals[i]));
        }

        int iqamaFajr = prefs.getInt("iqamaFajr", -1);
        int iqamaDhuhr = prefs.getInt("iqamaDhuhr", -1);
        int iqamaAsr = prefs.getInt("iqamaAsr", -1);
        int iqamaMaghrib = prefs.getInt("iqamaMaghrib", -1);
        int iqamaIsha = prefs.getInt("iqamaIsha", -1);
        views.setTextViewText(R.id.tv_iqama_fajr, iqamaFajr >= 0 ? "+" + iqamaFajr : "");
        views.setTextViewText(R.id.tv_iqama_dhuhr, iqamaDhuhr >= 0 ? "+" + iqamaDhuhr : "");
        views.setTextViewText(R.id.tv_iqama_asr, iqamaAsr >= 0 ? "+" + iqamaAsr : "");
        views.setTextViewText(R.id.tv_iqama_maghrib, iqamaMaghrib >= 0 ? "+" + iqamaMaghrib : "");
        views.setTextViewText(R.id.tv_iqama_isha, iqamaIsha >= 0 ? "+" + iqamaIsha : "");

        boolean notifyFajr = prefs.getBoolean("notifyFajr", true);
        boolean notifyDhuhr = prefs.getBoolean("notifyDhuhr", true);
        boolean notifyAsr = prefs.getBoolean("notifyAsr", true);
        boolean notifyMaghrib = prefs.getBoolean("notifyMaghrib", true);
        boolean notifyIsha = prefs.getBoolean("notifyIsha", true);
        views.setImageViewResource(R.id.iv_bell_fajr, notifyFajr ? R.drawable.ic_widget_bell : R.drawable.ic_widget_bell_muted);
        views.setImageViewResource(R.id.iv_bell_dhuhr, notifyDhuhr ? R.drawable.ic_widget_bell : R.drawable.ic_widget_bell_muted);
        views.setImageViewResource(R.id.iv_bell_asr, notifyAsr ? R.drawable.ic_widget_bell : R.drawable.ic_widget_bell_muted);
        views.setImageViewResource(R.id.iv_bell_maghrib, notifyMaghrib ? R.drawable.ic_widget_bell : R.drawable.ic_widget_bell_muted);
        views.setImageViewResource(R.id.iv_bell_isha, notifyIsha ? R.drawable.ic_widget_bell : R.drawable.ic_widget_bell_muted);

        double nowDecimal = now.get(Calendar.HOUR_OF_DAY) + now.get(Calendar.MINUTE) / 60.0 + now.get(Calendar.SECOND) / 3600.0;
        int nextIndex = -1;
        for (int i = 0; i < 6; i++) {
            if (decimals[i] > nowDecimal) {
                nextIndex = i;
                break;
            }
        }
        String nextText;
        if (nextIndex == -1) {
            nextText = labels[0] + " demain";
        } else {
            int minutesLeft = (int) Math.round((decimals[nextIndex] - nowDecimal) * 60);
            nextText = labels[nextIndex] + " dans " + formatCountdown(minutesLeft);
        }
        views.setTextViewText(R.id.tv_next, nextText);

        // Sunrise line: highlighted like any other "active" slot when it's the next event
        boolean sunriseActive = nextIndex == 1;
        views.setTextViewText(R.id.tv_sunrise, "🌅 Chourouk " + formatHour(decimals[1]));
        views.setTextColor(R.id.tv_sunrise, sunriseActive ? COLOR_GOLD : COLOR_LABEL);

        // Highlight the next prayer's column (label + time in gold, dot shown)
        // — indices into the 6-slot decimals array that map to the 5-column grid
        int[] gridPrayerIndex = { 0, 2, 3, 4, 5 }; // fajr, dhuhr, asr, maghrib, isha
        int[] labelViewIds = { R.id.tv_label_fajr, R.id.tv_label_dhuhr, R.id.tv_label_asr, R.id.tv_label_maghrib, R.id.tv_label_isha };
        int[] gridTimeViewIds = { R.id.tv_time_fajr, R.id.tv_time_dhuhr, R.id.tv_time_asr, R.id.tv_time_maghrib, R.id.tv_time_isha };
        int[] dotViewIds = { R.id.dot_fajr, R.id.dot_dhuhr, R.id.dot_asr, R.id.dot_maghrib, R.id.dot_isha };
        for (int col = 0; col < 5; col++) {
            boolean active = gridPrayerIndex[col] == nextIndex;
            views.setTextColor(labelViewIds[col], active ? COLOR_GOLD : COLOR_LABEL);
            views.setTextColor(gridTimeViewIds[col], active ? COLOR_GOLD : COLOR_INK);
            views.setViewVisibility(dotViewIds[col], active ? android.view.View.VISIBLE : android.view.View.GONE);
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
        }

        return views;
    }

    private static String formatCountdown(int minutes) {
        if (minutes < 1) return "moins d'1 min";
        int h = minutes / 60;
        int m = minutes % 60;
        if (h == 0) return m + " min";
        return h + " h " + String.format("%02d", m) + " min";
    }

    private static String formatHour(double t) {
        double norm = ((t % 24) + 24) % 24;
        int totalMinutes = (int) Math.round(norm * 60) % (24 * 60);
        int h = totalMinutes / 60;
        int m = totalMinutes % 60;
        return String.format("%02d:%02d", h, m);
    }

    // ---- Astronomical calculation — direct port of computePrayerTimesDecimal
    // (src/App.jsx) so the widget matches the app exactly. ----

    private static double fixAngle(double a) {
        a = a - 360 * Math.floor(a / 360);
        return a < 0 ? a + 360 : a;
    }

    private static double fixHour(double a) {
        a = a - 24 * Math.floor(a / 24);
        return a < 0 ? a + 24 : a;
    }

    private static double dsin(double d) {
        return Math.sin(Math.toRadians(d));
    }

    private static double dcos(double d) {
        return Math.cos(Math.toRadians(d));
    }

    private static double dtan(double d) {
        return Math.tan(Math.toRadians(d));
    }

    private static double darcsin(double x) {
        return Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, x))));
    }

    private static double darccos(double x) {
        return Math.toDegrees(Math.acos(Math.max(-1, Math.min(1, x))));
    }

    private static double darctan2(double y, double x) {
        return Math.toDegrees(Math.atan2(y, x));
    }

    private static double darccot(double x) {
        return darctan2(1, x);
    }

    private static double julianDate(int y, int m, int d) {
        if (m <= 2) {
            y -= 1;
            m += 12;
        }
        int A = (int) Math.floor(y / 100.0);
        int B = 2 - A + (int) Math.floor(A / 4.0);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }

    private static double[] sunPosition(double jd) {
        double D = jd - 2451545.0;
        double g = fixAngle(357.529 + 0.98560028 * D);
        double q = fixAngle(280.459 + 0.98564736 * D);
        double L = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));
        double e = 23.439 - 0.00000036 * D;
        double RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
        double eqt = q / 15 - fixHour(RA);
        double decl = darcsin(dsin(e) * dsin(L));
        return new double[] { decl, eqt };
    }

    private static double hourAngle(double angle, double lat, double decl) {
        double val = (-dsin(angle) - dsin(lat) * dsin(decl)) / (dcos(lat) * dcos(decl));
        return darccos(val) / 15;
    }

    private static double asrHourAngle(double lat, double decl, double factor) {
        double angle = -darccot(factor + dtan(Math.abs(lat - decl)));
        return hourAngle(angle, lat, decl);
    }

    private static double[] computeTimes(
        Calendar date,
        double lat,
        double lng,
        double fajrAngle,
        double ishaAngle,
        Double ishaMinutesAfterMaghrib,
        double fajrOffset,
        double sunriseOffset,
        double dhuhrOffset,
        double asrOffset,
        double maghribOffset,
        double ishaOffset
    ) {
        int year = date.get(Calendar.YEAR);
        int month = date.get(Calendar.MONTH) + 1;
        int day = date.get(Calendar.DAY_OF_MONTH);
        double tz = TimeZone.getDefault().getOffset(date.getTimeInMillis()) / 3600000.0;

        double jd = julianDate(year, month, day) - lng / (15 * 24);
        double[] sun = sunPosition(jd + 0.5);
        double decl = sun[0];
        double eqt = sun[1];
        double dhuhr = fixHour(12 - eqt);
        double fajrT = hourAngle(fajrAngle, lat, decl);
        double sunsetT = hourAngle(0.833, lat, decl);
        double asrT = asrHourAngle(lat, decl, 1);
        double tzAdjust = tz - lng / 15;

        double maghrib = (dhuhr + sunsetT + tzAdjust) + maghribOffset / 60;
        double isha;
        if (ishaMinutesAfterMaghrib != null) {
            isha = maghrib + ishaMinutesAfterMaghrib / 60;
        } else {
            isha = (dhuhr + hourAngle(ishaAngle, lat, decl) + tzAdjust) + ishaOffset / 60;
        }

        double fajr = (dhuhr - fajrT + tzAdjust) + fajrOffset / 60;
        double sunrise = (dhuhr - sunsetT + tzAdjust) + sunriseOffset / 60;
        double dhuhrFinal = (dhuhr + tzAdjust) + dhuhrOffset / 60;
        double asr = (dhuhr + asrT + tzAdjust) + asrOffset / 60;

        return new double[] { fajr, sunrise, dhuhrFinal, asr, maghrib, isha };
    }
}
