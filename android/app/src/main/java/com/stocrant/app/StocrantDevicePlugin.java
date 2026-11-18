package com.stocrant.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/** Device actions for authenticated downloads. Never pass session tokens to external apps. */
@CapacitorPlugin(name = "StocrantDevice")
public class StocrantDevicePlugin extends Plugin {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private volatile boolean savingFile;

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (savingFile) { call.reject("A file save is already in progress."); return; }
        String data = call.getString("data");
        String name = call.getString("name", "STOCRANT-file");
        String type = call.getString("type", "application/octet-stream");
        if (data == null || data.length() > ((MAX_BYTES + 2) / 3) * 4) {
            call.reject("File is too large to save on this device.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type);
        intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[\\\\/\\p{Cntrl}]", "_").substring(0, Math.min(name.length(), 180)));
        savingFile = true;
        try { startActivityForResult(call, intent, "fileDestination"); }
        catch (Exception error) { savingFile = false; call.reject("Could not open the device file picker.", error); }
    }

    @ActivityCallback
    private void fileDestination(PluginCall call, ActivityResult result) {
        if (call == null) { savingFile = false; return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            savingFile = false; JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
        }
        Uri destination = result.getData().getData();
        if (!"content".equals(destination.getScheme())) { savingFile = false; call.reject("Invalid file destination."); return; }
        getBridge().execute(() -> {
            try {
                byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
                if (bytes.length > MAX_BYTES) { call.reject("File is too large to save on this device."); return; }
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (stream == null) throw new IllegalStateException("No writable file destination");
                    stream.write(bytes);
                }
                JSObject response = new JSObject(); response.put("cancelled", false); call.resolve(response);
            } catch (Exception error) { call.reject("Could not save the file on this device.", error); }
            finally { savingFile = false; }
        });
    }

    @PluginMethod
    public void openWebsite(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null) {
            call.reject("Invalid website address."); return;
        }
        try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve(); }
        catch (Exception error) { call.reject("Could not open the website.", error); }
    }

    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private volatile boolean installingUpdate;

    /** Downloads an approved HTTPS APK, verifies its SHA-256 checksum and opens the Android package installer. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String address = call.getString("url"), expected = call.getString("sha256", "");
        if (address == null || !address.startsWith("https://") || !expected.matches("(?i)^[0-9a-f]{64}$")) { call.reject("This update link or checksum is not valid."); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(settings); } catch (Exception ignored) {}
            call.reject("Allow Stocrant to install updates, then tap Install update again.", "INSTALL_PERMISSION");
            return;
        }
        if (installingUpdate) { call.reject("An update download is already in progress."); return; }
        installingUpdate = true;
        new Thread(() -> {
            File folder = new File(getContext().getCacheDir(), "updates");
            File target = new File(folder, "stocrant-update.apk");
            HttpURLConnection connection = null;
            try {
                if (!folder.exists() && !folder.mkdirs()) throw new Exception("Could not prepare the update folder.");
                connection = (HttpURLConnection) new URL(address).openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != 200) throw new Exception("The update could not be downloaded.");
                if (!"https".equals(connection.getURL().getProtocol())) throw new Exception("The update link must stay on HTTPS.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long total = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024]; int read;
                    while ((read = input.read(buffer)) != -1) {
                        total += read; if (total > MAX_APK_BYTES) throw new Exception("The update file is too large.");
                        digest.update(buffer, 0, read); output.write(buffer, 0, read);
                    }
                }
                StringBuilder actual = new StringBuilder();
                for (byte value : digest.digest()) actual.append(String.format("%02x", value));
                if (!actual.toString().equalsIgnoreCase(expected)) { target.delete(); throw new Exception("The downloaded update does not match its approved checksum. It was not installed."); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", target);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception error) {
                target.delete();
                String message = error.getMessage();
                call.reject(message != null && message.startsWith("The ") ? message : "The update could not be downloaded.");
            } finally {
                if (connection != null) connection.disconnect();
                installingUpdate = false;
            }
        }).start();
    }

    @PluginMethod
    public void pushReady(PluginCall call) {
        int resource = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject(); result.put("configured", resource != 0); call.resolve(result);
    }

    @PluginMethod
    public void printPage(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Printing is unavailable on this device."); return; }
                manager.print("STOCRANT", getBridge().getWebView().createPrintDocumentAdapter("STOCRANT"), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) { call.reject("Could not open device printing.", error); }
        });
    }

    @PluginMethod
    public void setAppearance(PluginCall call) {
        boolean dark = call.getBoolean("dark", false);
        getBridge().executeOnMainThread(() -> {
            int color = Color.parseColor(dark ? "#101d25" : "#f3f5f9");
            getActivity().getWindow().setStatusBarColor(color);
            getActivity().getWindow().setNavigationBarColor(color);
            WindowCompat.getInsetsController(getActivity().getWindow(), getBridge().getWebView()).setAppearanceLightStatusBars(!dark);
            WindowCompat.getInsetsController(getActivity().getWindow(), getBridge().getWebView()).setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
