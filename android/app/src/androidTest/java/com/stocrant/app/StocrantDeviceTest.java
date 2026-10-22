package com.stocrant.app;

import static org.junit.Assert.*;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the real Capacitor bridge; never signs in, changes business data, or saves a file. */
@RunWith(AndroidJUnit4.class)
public class StocrantDeviceTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String source) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(source, result -> {
            value.set(result); done.countDown();
        }));
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    private void until(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        for (int i = 0; i < 100; i++) {
            if ("true".equals(evaluate(scenario, expression))) return;
            Thread.sleep(100);
        }
        fail("Native bridge condition timed out: " + expression);
    }

    private void start(ActivityScenario<MainActivity> scenario, String method, String input) throws Exception {
        evaluate(scenario, "window.__stocrantDeviceTest=null;Capacitor.nativePromise('StocrantDevice','" + method + "'," + input + ").then(value=>window.__stocrantDeviceTest={ok:true,value}).catch(error=>window.__stocrantDeviceTest={ok:false,error:error.message});true");
    }

    @Test
    public void realBridgeSupportsAppearanceValidationAndSaveCancellation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            until(scenario, "Boolean(window.Capacitor && Capacitor.nativePromise)");
            start(scenario, "setAppearance", "{dark:document.documentElement.dataset.theme==='dark'}");
            until(scenario, "Boolean(window.__stocrantDeviceTest?.ok)");
            start(scenario, "openWebsite", "{url:'javascript:alert(1)'}");
            until(scenario, "window.__stocrantDeviceTest?.ok===false");
            assertTrue(evaluate(scenario, "window.__stocrantDeviceTest.error").contains("Invalid website address"));
            start(scenario, "saveFile", "{name:'STOCRANT-device-test.txt',type:'text/plain',data:'U1RPQ1JBTlQgdGVzdA=='}");
            boolean picker = false;
            for (int i = 0; i < 100; i++) {
                AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
                if (root != null && String.valueOf(root.getPackageName()).contains("documentsui")) { picker = true; break; }
                Thread.sleep(100);
            }
            assertTrue("Android system save picker did not open", picker);
            assertTrue(InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK));
            until(scenario, "window.__stocrantDeviceTest?.ok===true && window.__stocrantDeviceTest.value?.cancelled===true");
        }
    }
}
