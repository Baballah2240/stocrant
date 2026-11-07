package studio.islanddesk.launcher;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.util.LruCache;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** Home-screen features: list installed apps, open them, and manage the default home app. */
@CapacitorPlugin(name = "Launcher")
public class LauncherPlugin extends Plugin {
    private static final int ICON_SIZE = 108;
    private final LruCache<String, String> icons = new LruCache<>(400);

    @PluginMethod
    public void listApps(PluginCall call) {
        // Icons are rendered off the UI thread; a phone with 150 apps takes a moment the first time.
        getBridge().execute(() -> {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
            String self = getContext().getPackageName();
            JSArray apps = new JSArray();
            for (ResolveInfo info : found) {
                String pkg = info.activityInfo.packageName;
                if (pkg.equals(self)) continue;
                String key = pkg + "/" + info.activityInfo.name;
                String icon = icons.get(key);
                if (icon == null) { icon = encode(info.loadIcon(pm)); icons.put(key, icon); }
                JSObject app = new JSObject();
                app.put("label", String.valueOf(info.loadLabel(pm)));
                app.put("packageName", pkg);
                app.put("activity", info.activityInfo.name);
                app.put("icon", icon);
                // Preinstalled apps (including updated ones) count as system apps.
                int flags = info.activityInfo.applicationInfo.flags;
                app.put("system", (flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0);
                apps.put(app);
            }
            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("packageName"), activity = call.getString("activity");
        if (pkg == null || activity == null) { call.reject("Missing app."); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(new ComponentName(pkg, activity))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("That app couldn't be opened. It may have been uninstalled.");
        }
    }

    @PluginMethod
    public void isDefaultLauncher(PluginCall call) {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo info = getContext().getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        JSObject result = new JSObject();
        result.put("value", info != null && info.activityInfo != null && getContext().getPackageName().equals(info.activityInfo.packageName));
        call.resolve(result);
    }

    @PluginMethod
    public void openHomeSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception notAvailable) {
            // Some phones (including several Huawei builds) only offer this under Default apps.
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        String pkg = call.getString("packageName");
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    private static String encode(Drawable drawable) {
        Bitmap bitmap = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, ICON_SIZE, ICON_SIZE);
        drawable.draw(canvas);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        bitmap.recycle();
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
