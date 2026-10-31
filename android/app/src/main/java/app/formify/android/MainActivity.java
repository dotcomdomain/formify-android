package app.formify.android;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;

/** Android host for the production Formify app, sharing its routes, styles and API. */
public final class MainActivity extends Activity {
    private static final int MICROPHONE = 10, PICK_FILE = 11, SAVE_FILE = 12;
    private static final int CREAM = Color.rgb(245, 239, 228);
    private static final int FOREST = Color.rgb(31, 77, 58);
    private WebView webView;
    private FrameLayout root;
    private ProgressBar progress;
    private LinearLayout notice;
    private TextView noticeTitle, noticeText;
    private Button retry;
    private boolean failed;
    private String currentUrl = NavigationPolicy.HOME;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private byte[] pendingDownload;
    private String motionScript;
    private ValueAnimator themeAnimator;
    private int currentThemeColor = CREAM;
    private boolean themeApplied;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root = new FrameLayout(this);
        root.setBackgroundColor(CREAM);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard));
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);
        webView = new WebView(this);
        webView.setId(View.generateViewId());
        webView.setBackgroundColor(CREAM);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        configureWebView();
        createNotice();
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(ColorStateList.valueOf(FOREST));
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));
        if (state != null) {
            currentUrl = state.getString("url", NavigationPolicy.HOME);
            cameraUri = state.getParcelable("camera");
            pendingDownload = state.getByteArray("download");
        }
        applyTheme(getPreferences(MODE_PRIVATE).getBoolean("blue", false));
        if (state == null && NavigationPolicy.isInternal(getIntent().getDataString())) {
            currentUrl = getIntent().getDataString();
        }
        if (state == null || webView.restoreState(state) == null) load(currentUrl);
        else notice.setVisibility(View.GONE);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::navigateBack);
        }
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " FormifyAndroid/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        installMotionAtDocumentStart();

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "FormifyNative",
                    Set.of("https://getformify.pages.dev"), (view, message, origin, mainFrame, reply) -> {
                        if (!mainFrame || !NavigationPolicy.isInternal(origin.toString())) return;
                        try {
                            JSONObject data = new JSONObject(message.getData());
                            if ("theme".equals(data.optString("type"))) {
                                applyTheme("blue".equals(data.optString("value")));
                            } else if ("picker".equals(data.optString("type")) && data.optBoolean("open")) {
                                ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
                                        .hideSoftInputFromWindow(webView.getWindowToken(), 0);
                                if (Build.VERSION.SDK_INT >= 30) getWindow().getInsetsController().hide(WindowInsets.Type.ime());
                            } else if ("download".equals(data.optString("type"))) {
                                String encoded = data.getString("data");
                                if (encoded.length() > 14_000_000) {
                                    toast("This file is too large to save in the app.");
                                    return;
                                }
                                saveDownload(Base64.decode(encoded, Base64.DEFAULT),
                                        data.optString("name", "formify-data.json"));
                            }
                        } catch (Exception e) { toast("Could not save this file. Please try again."); }
                    });
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // Use the reviewed client bundled with this app; APIs and all other resources stay live.
                if ("GET".equals(request.getMethod())
                        && NavigationPolicy.isInternal(request.getUrl().toString())
                        && ("/js/consumer.js".equals(request.getUrl().getPath()) || "/render.js".equals(request.getUrl().getPath()))) {
                    try {
                        String asset = "/render.js".equals(request.getUrl().getPath()) ? "render.js" : "consumer.js";
                        return new WebResourceResponse("application/javascript", "UTF-8", getAssets().open(asset));
                    } catch (IOException ignored) { /* Fall back to the live client if packaging failed. */ }
                }
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !NavigationPolicy.isInternal(request.getUrl().toString());
                String url = request.getUrl().toString();
                if (NavigationPolicy.isInternal(url)) return false;
                openExternal(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                failed = false;
                if (NavigationPolicy.isInternal(url)) currentUrl = url;
                progress.animate().cancel();
                progress.setAlpha(1f);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                if (NavigationPolicy.isInternal(url)) currentUrl = url;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!failed) dismissNotice();
                progress.animate().alpha(0f).setDuration(ValueAnimator.areAnimatorsEnabled() ? 140 : 0)
                        .withEndAction(() -> progress.setVisibility(View.GONE)).start();
                CookieManager.getInstance().flush();
                if (NavigationPolicy.isInternal(url)) {
                    installPageIntegration();
                    if (motionScript != null) webView.evaluateJavascript(motionScript, null);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("You’re a little off the grid.",
                        "Connect to the internet, then try again. Your saved info stays on this device.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    showError("A small pause in the line.", "Formify couldn’t load this page. Try again in a moment.");
                }
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // Recreate the activity with a fresh WebView after a renderer crash.
                root.removeView(view);
                view.destroy();
                webView = null;
                recreate();
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value, ValueAnimator.areAnimatorsEnabled());
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!NavigationPolicy.isInternal(request.getOrigin().toString())
                            || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        if (pendingPermission != null) pendingPermission.deny();
                        pendingPermission = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingPermission == request) pendingPermission = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
                        .addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                // The current Formify file inputs scan images. Keep the system picker and camera available.
                Intent chooser = Intent.createChooser(picker, "Scan or choose a card");
                try {
                    Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (camera.resolveActivity(getPackageManager()) != null) {
                        File directory = new File(getCacheDir(), "card-photos");
                        directory.mkdirs();
                        clearCameraPhoto();
                        File photo = File.createTempFile("scan-", ".jpg", directory);
                        cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", photo);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        camera.setClipData(ClipData.newRawUri("Card photo", cameraUri));
                        camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                    }
                    startActivityForResult(chooser, PICK_FILE);
                } catch (Exception e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    clearCameraPhoto();
                    toast("No photo picker is available on this device.");
                }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message result) {
                if (!gesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (NavigationPolicy.isInternal(url)) load(url);
                        else openExternal(url);
                        child.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (!NavigationPolicy.isInternal(url)) { openExternal(url); return; }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, disposition, mime));
            try { ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request); toast("Saving to Downloads"); }
            catch (RuntimeException e) { toast("Could not download the file. Please try again."); }
        });
    }

    private void installMotionAtDocumentStart() {
        try {
            motionScript = "(()=>{if(window.__formifyMotion)return;window.__formifyMotion=true;const css="
                    + JSONObject.quote(readAsset("theme-motion.css") + readAsset("motion.css") + readAsset("form-controls.css") + readAsset("assistant.css"))
                    + ";" + readAsset("motion.js") + ";" + readAsset("form-controls.js") + "})()";
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(webView, motionScript,
                        Set.of("https://getformify.pages.dev"));
            }
        } catch (IOException e) {
            // The live app remains usable if an optional bundled visual asset cannot be read.
            motionScript = null;
        }
    }

    private String readAsset(String name) throws IOException {
        try (InputStream input = getAssets().open(name)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void dismissNotice() {
        if (notice.getVisibility() != View.VISIBLE) return;
        notice.animate().cancel();
        notice.animate().alpha(0f).setDuration(ValueAnimator.areAnimatorsEnabled() ? 180 : 0)
                .withEndAction(() -> {
                    notice.setVisibility(View.GONE);
                    notice.setAlpha(1f);
                }).start();
    }

    private void installPageIntegration() {
        // Origin-scoped messaging, without an unrestricted JavaScript interface. No restyling of the live site.
        webView.evaluateJavascript("""
            (() => {
              if (window.__formifyAndroid || !window.FormifyNative) return;
              window.__formifyAndroid = true;
              const sendTheme = () => FormifyNative.postMessage(JSON.stringify({type:'theme', value:document.documentElement.dataset.theme || 'warm'}));
              new MutationObserver(sendTheme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
              sendTheme();
              const saveBlob = async a => {
                try {
                  const blob = await (await fetch(a.href)).blob();
                  if (blob.size > 10000000) { alert('This file is too large to save in the app.'); return; }
                  const reader = new FileReader();
                  reader.onload = () => FormifyNative.postMessage(JSON.stringify({type:'download', name:a.download || 'formify-data.json', data:reader.result.split(',')[1]}));
                  reader.readAsDataURL(blob);
                } catch { alert('Could not save the file. Please try again.'); }
              };
              document.addEventListener('click', event => {
                const a = event.target.closest?.('a[download]');
                if (!a || !a.href.startsWith('blob:')) return;
                event.preventDefault();
                saveBlob(a);
              }, true);
              // The site's privacy export clicks a detached anchor, which does not bubble to document.
              const click = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function() {
                if (this.hasAttribute('download') && this.href.startsWith('blob:')) saveBlob(this);
                else click.call(this);
              };
            })()
            """, null);
    }

    private void createNotice() {
        notice = new LinearLayout(this);
        notice.setOrientation(LinearLayout.VERTICAL);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(32), dp(32), dp(32), dp(32));
        notice.setBackgroundColor(CREAM);
        TextView brand = new TextView(this);
        brand.setText(R.string.app_name);
        brand.setTextSize(38);
        brand.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        brand.setTextColor(FOREST);
        notice.addView(brand);
        noticeTitle = new TextView(this);
        noticeTitle.setText(R.string.loading_title);
        noticeTitle.setTextSize(24);
        noticeTitle.setTextColor(FOREST);
        noticeTitle.setGravity(Gravity.CENTER);
        noticeTitle.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(32);
        notice.addView(noticeTitle, titleParams);
        noticeText = new TextView(this);
        noticeText.setText(R.string.loading_message);
        noticeText.setTextSize(16);
        noticeText.setTextColor(Color.rgb(107, 111, 102));
        noticeText.setGravity(Gravity.CENTER);
        noticeText.setPadding(0, dp(12), 0, dp(24));
        notice.addView(noticeText);
        retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setTextColor(Color.WHITE);
        retry.setAllCaps(false);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(FOREST);
        shape.setCornerRadius(dp(24));
        retry.setBackground(new RippleDrawable(ColorStateList.valueOf(0x35FFFFFF), shape, null));
        retry.setPadding(dp(32), dp(12), dp(32), dp(12));
        retry.setVisibility(View.GONE);
        retry.setOnClickListener(v -> load(currentUrl));
        notice.addView(retry);
        root.addView(notice, new FrameLayout.LayoutParams(-1, -1));
    }

    private void applyTheme(boolean blue) {
        int background = blue ? Color.rgb(238, 243, 251) : CREAM;
        if (themeAnimator != null) themeAnimator.cancel();
        if (themeApplied && background != currentThemeColor && ValueAnimator.areAnimatorsEnabled()) {
            themeAnimator = ValueAnimator.ofArgb(currentThemeColor, background);
            themeAnimator.setDuration(340);
            themeAnimator.addUpdateListener(animation -> setThemeBackground((int) animation.getAnimatedValue()));
            themeAnimator.start();
        } else setThemeBackground(background);
        themeApplied = true;
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().getInsetsController().setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        getPreferences(MODE_PRIVATE).edit().putBoolean("blue", blue).apply();
    }

    private void setThemeBackground(int color) {
        currentThemeColor = color;
        root.setBackgroundColor(color);
        notice.setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(Build.VERSION.SDK_INT >= 27 ? color : FOREST);
    }

    private void showError(String title, String text) {
        failed = true;
        notice.animate().cancel();
        notice.setAlpha(1f);
        noticeTitle.setText(title);
        noticeText.setText(text);
        retry.setVisibility(View.VISIBLE);
        notice.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
    }

    private void load(String url) {
        if (!NavigationPolicy.isInternal(url)) return;
        currentUrl = url;
        failed = false;
        notice.animate().cancel();
        notice.setAlpha(1f);
        noticeTitle.setText(R.string.loading_title);
        noticeText.setText(R.string.loading_message);
        retry.setVisibility(View.GONE);
        notice.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void openExternal(String url) {
        if (!NavigationPolicy.isExternal(url)) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            // Select an external browser for web links to avoid routing a link back into this activity.
            if (url.startsWith("https:") || url.startsWith("http:")) {
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
            }
            startActivity(intent);
        } catch (ActivityNotFoundException e) { toast("No app is available to open this link."); }
    }

    private void saveDownload(byte[] bytes, String name) {
        if (pendingDownload != null) { toast("Finish saving the current file first."); return; }
        pendingDownload = bytes;
        String safeName = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(safeName.endsWith(".json") ? "application/json" : "application/octet-stream")
                .putExtra(Intent.EXTRA_TITLE, safeName);
        try { startActivityForResult(intent, SAVE_FILE); }
        catch (ActivityNotFoundException e) { pendingDownload = null; toast("No file saver is available."); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE) {
            Uri[] files = null;
            if (result == RESULT_OK) {
                Uri picked = data == null ? null : data.getData();
                files = picked != null ? new Uri[]{picked} : cameraUri == null ? null : new Uri[]{cameraUri};
            }
            if (fileCallback != null) fileCallback.onReceiveValue(files);
            fileCallback = null;
            // WebView reads the selected photo asynchronously; remove cached captures on the next pick/exit.
            if (result != RESULT_OK) clearCameraPhoto();
        } else if (request == SAVE_FILE) {
            if (result == RESULT_OK && data != null && data.getData() != null && pendingDownload != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new java.io.IOException("No output stream");
                    out.write(pendingDownload);
                    toast("File saved");
                } catch (Exception e) { toast("Could not save the file. Please try again."); }
            }
            pendingDownload = null;
        }
    }

    private void clearCameraPhoto() {
        if (cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (RuntimeException ignored) { }
            cameraUri = null;
        }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == MICROPHONE && pendingPermission != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else { pendingPermission.deny(); toast("Microphone access is off. You can still type your answers."); }
            pendingPermission = null;
        }
    }

    private void navigateBack() {
        WebView current = webView;
        if (current == null) { finish(); return; }
        current.evaluateJavascript("Boolean(window.FormifyUI && window.FormifyUI.dismissPicker())", handled -> {
            if (isFinishing() || current != webView) return;
            if (!"true".equals(handled)) navigateHistory();
        });
    }

    private void navigateHistory() {
        if (webView != null && webView.canGoBack()) {
            notice.setVisibility(View.GONE);
            failed = false;
            webView.goBack();
        } else finish();
    }
    @Override public void onBackPressed() { navigateBack(); }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (NavigationPolicy.isInternal(intent.getDataString())) load(intent.getDataString());
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (webView != null) webView.saveState(state);
        state.putString("url", currentUrl);
        state.putParcelable("camera", cameraUri);
        // Exports are normally tiny JSON documents; avoid exceeding the activity state transaction limit.
        if (pendingDownload != null && pendingDownload.length < 200_000) state.putByteArray("download", pendingDownload);
    }
    @Override protected void onPause() {
        if (webView != null) { webView.onPause(); CookieManager.getInstance().flush(); }
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (themeAnimator != null) themeAnimator.cancel();
        if (pendingPermission != null) pendingPermission.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (!isChangingConfigurations()) clearCameraPhoto();
        if (webView != null) { root.removeView(webView); webView.destroy(); }
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
}
