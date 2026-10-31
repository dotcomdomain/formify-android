package app.formify.android;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.view.MotionEvent;
import android.webkit.WebView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs against the real site on a device. No accounts, check-ins or payments are created. */
public final class SmokeInstrumentation extends Instrumentation {
    private MainActivity activity;
    private WebView web;
    private int checks;

    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent intent = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = (MainActivity) startActivitySync(intent);
            runOnMainSync(() -> web = findWebView(activity.getWindow().getDecorView()));
            await("document.querySelectorAll('#tabs button').length === 4", "four customer tabs");
            await("document.querySelectorAll('.bcard').length > 0", "live business directory");
            String initialTheme = js("document.documentElement.dataset.theme || 'warm'");
            String initialProfile = js("localStorage.getItem('ks_profile')");
            await("['#f5efe4','#eef3fb','rgb(245,239,228)','rgb(238,243,251)'].includes(getComputedStyle(document.body).getPropertyValue('--cream').replace(/\\s/g,''))", "existing Formify palette");

            // Open a real business detail, then return with Android back.
            tap(".bcard");
            await("!!document.querySelector('.sheet')", "business details");
            runOnMainSync(() -> activity.onBackPressed());
            await("!!document.querySelector('#q')", "Android back to search");

            // A deliberately unmatched search is read-only and exercises the live API.
            js("document.querySelector('#q').value='formify-android-smoke-no-match-92813'; document.querySelector('#q').dispatchEvent(new Event('input',{bubbles:true}))");
            await("document.querySelector('#results')?.textContent.includes('Nothing here yet')", "search empty state");
            js("document.querySelector('#q').value=''; document.querySelector('#q').dispatchEvent(new Event('input',{bubbles:true}))");
            await("document.querySelectorAll('.bcard').length > 0", "search recovery");

            js("document.querySelector('[data-tab=assistant]').click()");
            await("location.hash === '#assistant' && !!document.querySelector('.chatcard')", "assistant screen");
            js("document.querySelector('[data-tab=visits]').click()");
            await("location.hash === '#visits' && document.querySelector('#view').textContent.length > 20", "visits screen");
            js("document.querySelector('[data-tab=you]').click()");
            await("!!document.querySelector('#p_name')", "profile screen");
            // Save only a synthetic name in this emulator's local profile.
            js("document.querySelector('#p_name').value='Android Smoke Test'; document.querySelector('#pform').requestSubmit()");
            await("JSON.parse(localStorage.getItem('ks_profile')).name === 'Android Smoke Test'", "local profile save");
            js("document.querySelector('[data-th=blue]').click()");
            await("document.documentElement.dataset.theme === 'blue'", "blue theme");
            js("document.querySelector('[data-th=warm]').click()");
            await("document.documentElement.dataset.theme === 'warm'", "warm theme restored");
            await("typeof FormifyNative === 'object'", "origin-scoped native bridge");

            // Reload verifies local storage survives a page load.
            runOnMainSync(() -> web.reload());
            await("document.querySelector('#p_name')?.value === 'Android Smoke Test'", "profile survives reload");
            js("(()=>{const original=" + initialProfile + "; if(original===null) localStorage.removeItem('ks_profile'); else localStorage.setItem('ks_profile',original)})()");
            await("localStorage.getItem('ks_profile') === " + initialProfile, "original profile restored");
            js("document.querySelector('[data-th=' + " + initialTheme + " + ']').click()");

            // Business dashboard is another first-party route, inside the Android app.
            js("location.href='/business.html'");
            await("/^\\/business(?:\\.html)?$/.test(location.pathname) && document.body.textContent.includes('Sign in')", "business sign in");
            runOnMainSync(() -> web.loadUrl(NavigationPolicy.HOME));
            await("document.querySelectorAll('.bcard').length > 0", "home restored");
            result.putString("stream", "\nPASS: " + checks + " live Android integration checks.\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "\nFAIL after " + checks + " checks: " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private void await(String expression, String label) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 60_000;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(js("Boolean(" + expression + ")"))) {
                checks++;
                Bundle status = new Bundle();
                status.putString("stream", "PASS " + checks + ": " + label + "\n");
                sendStatus(0, status);
                return;
            }
            SystemClock.sleep(250);
        }
        throw new AssertionError("Timed out: " + label + "; URL=" + js("location.href"));
    }

    private String js(String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript(source, value -> { result.set(value); done.countDown(); }));
        if (!done.await(10, TimeUnit.SECONDS)) throw new AssertionError("WebView did not respond");
        return result.get();
    }

    private void tap(String selector) throws Exception {
        // Real touch gives same-document history the user activation required by Chromium back navigation.
        String encoded = js("JSON.stringify((()=>{const r=document.querySelector('" + selector + "').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})())");
        String decoded = new org.json.JSONTokener(encoded).nextValue().toString();
        org.json.JSONArray point = new org.json.JSONArray(decoded);
        int[] origin = new int[2];
        runOnMainSync(() -> web.getLocationOnScreen(origin));
        float density = getTargetContext().getResources().getDisplayMetrics().density;
        float x = origin[0] + (float) point.getDouble(0) * density;
        float y = origin[1] + (float) point.getDouble(1) * density;
        long now = SystemClock.uptimeMillis();
        sendPointerSync(MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0));
        sendPointerSync(MotionEvent.obtain(now, now + 100, MotionEvent.ACTION_UP, x, y, 0));
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
}
