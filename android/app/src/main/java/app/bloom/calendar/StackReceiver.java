package app.bloom.calendar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * One notification per series (owner, Nov 2026): when a reminder repeats
 * (water nudges, the same medicine, the same event) while the last one is
 * still in the notification shade, the older ones are removed and the newest
 * shows "Missed N". Its buttons (Taken, + glass, Snooze) and tap stay as they
 * were, so they keep working. Nothing missed (the last one was swiped away or
 * answered) = no count.
 *
 * The app tells which notification belongs to which series and when each
 * fires (setStacks); a single alarm wakes this receiver a few seconds after
 * each one fires, to tidy up.
 */
public class StackReceiver extends BroadcastReceiver {

    private static final String PREFS = "bloom_stacks";
    private static final int ALARM_ID = 7_000_001;
    private static final long AFTER_MS = 3_000;
    private static final long KEEP_MS = 3L * 24 * 3600_000;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        collapse(ctx);
        armNext(ctx);
    }

    /** id -> {s: series, at: ms}; merged with what is known (shown ones stay known), old ones dropped. */
    static void save(Context ctx, JSONObject planned, String missedText) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all = new JSONObject(p.getString("items", "{}"));
            long now = System.currentTimeMillis();
            for (Iterator<String> it = all.keys(); it.hasNext(); ) {
                String k = it.next();
                JSONObject v = all.optJSONObject(k);
                // Future ones are replaced by the new plan; past ones (maybe on screen) are kept a while.
                if (v == null || v.optLong("at") > now || v.optLong("at") < now - KEEP_MS) it.remove();
            }
            for (Iterator<String> it = planned.keys(); it.hasNext(); ) {
                String k = it.next();
                all.put(k, planned.get(k));
            }
            p.edit().putString("items", all.toString()).putString("missed", missedText).apply();
            armNext(ctx);
        } catch (Exception e) {
            // never break reminders because of this
        }
    }

    private static void armNext(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all = new JSONObject(p.getString("items", "{}"));
            long now = System.currentTimeMillis();
            long next = 0;
            for (Iterator<String> it = all.keys(); it.hasNext(); ) {
                JSONObject v = all.optJSONObject(it.next());
                if (v == null) continue;
                long t = v.optLong("at") + AFTER_MS;
                if (t > now && (next == 0 || t < next)) next = t;
            }
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, ALARM_ID, new Intent(ctx, StackReceiver.class), flags);
            am.cancel(pi);
            if (next == 0) return;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            }
        } catch (Exception e) {
            // ignore
        }
    }

    /** Keep only the newest notification of each series on screen, with "Missed N". */
    static void collapse(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all = new JSONObject(p.getString("items", "{}"));
            String missedText = p.getString("missed", "Missed {n}");
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            Map<String, List<StatusBarNotification>> bySeries = new HashMap<>();
            for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                JSONObject v = all.optJSONObject(String.valueOf(sbn.getId()));
                if (v == null) continue;
                String s = v.optString("s");
                if (s.isEmpty()) continue;
                bySeries.computeIfAbsent(s, k -> new ArrayList<>()).add(sbn);
            }
            for (List<StatusBarNotification> list : bySeries.values()) {
                if (list.size() < 2) continue;
                list.sort((a, b) -> Long.compare(a.getPostTime(), b.getPostTime()));
                StatusBarNotification newest = list.get(list.size() - 1);
                int missed = newest.getNotification().extras.getInt("bloomMissed", 0);
                for (int i = 0; i < list.size() - 1; i++) {
                    StatusBarNotification old = list.get(i);
                    missed += 1 + old.getNotification().extras.getInt("bloomMissed", 0);
                    nm.cancel(old.getTag(), old.getId());
                }
                Notification n = newest.getNotification();
                CharSequence text = n.extras.getCharSequence(Notification.EXTRA_TEXT);
                String base = n.extras.getString("bloomBase", text == null ? "" : text.toString());
                String count = missedText.replace("{n}", String.valueOf(missed));
                Notification.Builder b = Notification.Builder.recoverBuilder(ctx, n);
                b.setContentText(base.isEmpty() ? count : base + " · " + count);
                b.setOnlyAlertOnce(true);
                Bundle extra = new Bundle();
                extra.putInt("bloomMissed", missed);
                extra.putString("bloomBase", base);
                b.addExtras(extra);
                nm.notify(newest.getTag(), newest.getId(), b.build());
            }
        } catch (Exception e) {
            // ignore: worst case the notifications stay as they were
        }
    }
}
