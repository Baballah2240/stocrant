package studio.islanddesk.launcher;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;
import java.text.DateFormat;
import java.util.Date;

/** Full-screen ringing screen, shown over the lock screen. */
public class AlarmActivity extends Activity {
    private static WeakReference<AlarmActivity> open = new WeakReference<>(null);
    static void closeIfOpen() { AlarmActivity activity = open.get(); if (activity != null) activity.runOnUiThread(activity::finish); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        open = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { setShowWhenLocked(true); setTurnScreenOn(true); }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        String label = getIntent().getStringExtra("label");
        int snooze = getIntent().getIntExtra("snooze", 10);
        float dp = getResources().getDisplayMetrics().density;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.BLACK);
        root.setPadding((int) (24 * dp), (int) (24 * dp), (int) (24 * dp), (int) (24 * dp));

        TextView pill = new TextView(this);
        pill.setText("  ●  Island alarm  ");
        pill.setTextColor(Color.parseColor("#BCE8C8"));
        pill.setTextSize(14);
        pill.setPadding((int) (18 * dp), (int) (10 * dp), (int) (18 * dp), (int) (10 * dp));
        pill.setBackground(rounded("#000000", "#2A2A30", 22 * dp));
        root.addView(pill);

        TextView time = new TextView(this);
        time.setText(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()));
        time.setTextColor(Color.WHITE);
        time.setTextSize(88);
        time.setTypeface(Typeface.create("sans-serif-thin", Typeface.NORMAL));
        time.setGravity(Gravity.CENTER);
        time.setPadding(0, (int) (40 * dp), 0, 0);
        root.addView(time);

        TextView name = new TextView(this);
        name.setText(label == null || label.isEmpty() ? "Alarm" : label);
        name.setTextColor(Color.parseColor("#8A8A94"));
        name.setTextSize(20);
        name.setGravity(Gravity.CENTER);
        name.setPadding(0, 0, 0, (int) (56 * dp));
        root.addView(name);

        root.addView(button("Snooze " + snooze + " min", "#1C1C20", Color.WHITE, dp, v -> send(AlarmService.ACTION_SNOOZE)));
        View gap = new View(this); root.addView(gap, new LinearLayout.LayoutParams(1, (int) (14 * dp)));
        root.addView(button("Stop", "#FFFFFF", Color.BLACK, dp, v -> send(AlarmService.ACTION_STOP)));
        setContentView(root);
    }

    private Button button(String text, String background, int color, float dp, View.OnClickListener click) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(18);
        button.setTextColor(color);
        button.setBackground(rounded(background, background, 34 * dp));
        button.setOnClickListener(click);
        button.setLayoutParams(new LinearLayout.LayoutParams((int) (280 * dp), (int) (68 * dp)));
        return button;
    }
    private static GradientDrawable rounded(String fill, String stroke, float radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.parseColor(fill));
        shape.setStroke(2, Color.parseColor(stroke));
        shape.setCornerRadius(radius);
        return shape;
    }
    private void send(String action) { startService(new Intent(this, AlarmService.class).setAction(action)); finish(); }

    // The back button shouldn't silently dismiss a ringing alarm.
    @Override public void onBackPressed() { }
    @Override protected void onDestroy() { if (open.get() == this) open = new WeakReference<>(null); super.onDestroy(); }
}
