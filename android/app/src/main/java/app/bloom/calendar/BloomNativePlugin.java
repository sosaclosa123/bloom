package app.bloom.calendar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.List;

/**
 * Small native helpers for the phone app:
 *  - openFile: show a file (PDF / image) in the phone's viewer, or start
 *    installing a downloaded update (.apk) — Android then asks "Install?".
 *  - shareFile: the Android share sheet (save a backup to Drive, Files, ...).
 *  - printHtml: Android's print screen for a page (doctor report; "Save as PDF").
 *  - the keyboard: tells the page how much of it the keyboard covers
 *    (window event "bloomKeyboard" { height, open }), so what is being typed
 *    in can move up above it (useKeyboard in src/ui/phone.tsx).
 * Paths are file:// URIs from @capacitor/filesystem (app files or cache).
 */
@CapacitorPlugin(name = "BloomNative")
public class BloomNativePlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        View web = getBridge().getWebView();
        ViewCompat.setWindowInsetsAnimationCallback(
            web,
            new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                @Override
                public WindowInsetsCompat onProgress(WindowInsetsCompat insets, List<WindowInsetsAnimationCompat> running) {
                    return insets;
                }

                @Override
                public WindowInsetsAnimationCompat.BoundsCompat onStart(WindowInsetsAnimationCompat a, WindowInsetsAnimationCompat.BoundsCompat bounds) {
                    sendKeyboard();
                    return bounds;
                }

                @Override
                public void onEnd(WindowInsetsAnimationCompat a) {
                    // Once the app has been resized (or not), measure again.
                    web.post(() -> sendKeyboard());
                }
            }
        );
    }

    /** Which notification belongs to which series (water, a medicine, an event), for "Missed N" (StackReceiver). */
    @PluginMethod
    public void setStacks(PluginCall call) {
        try {
            JSObject items = call.getObject("items", new JSObject());
            StackReceiver.save(getContext(), items, call.getString("missed", "Missed {n}"));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Tidy up now (the app came back): one notification per series. */
    @PluginMethod
    public void collapseStacks(PluginCall call) {
        StackReceiver.collapse(getContext());
        call.resolve();
    }

    private String lastKeyboard = "";

    /** How much of the page the keyboard covers right now (CSS px), measured on screen. */
    private void sendKeyboard() {
        try {
            View web = getBridge().getWebView();
            WindowInsetsCompat w = ViewCompat.getRootWindowInsets(web);
            if (w == null) return;
            boolean open = w.isVisible(WindowInsetsCompat.Type.ime());
            int ime = open ? w.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            View root = web.getRootView();
            int[] at = new int[2];
            web.getLocationOnScreen(at);
            int webBottom = at[1] + web.getHeight();
            int keyboardTop = root.getHeight() - ime;
            float density = getContext().getResources().getDisplayMetrics().density;
            int covered = open ? Math.max(0, Math.round((webBottom - keyboardTop) / density)) : 0;
            String data = "{ \"height\": " + covered + ", \"open\": " + open + " }";
            if (data.equals(lastKeyboard)) return;
            lastKeyboard = data;
            getBridge().triggerWindowJSEvent("bloomKeyboard", data);
        } catch (Exception e) {
            // never break typing because of this
        }
    }

    private Uri contentUri(String path) {
        String p = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
        File f = new File(p);
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mime", "*/*");
        if (path == null) {
            call.reject("no path");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(contentUri(path), mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("no-app");
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mime", "*/*");
        String title = call.getString("title", "");
        if (path == null) {
            call.reject("no path");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, contentUri(path));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(i, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Kept until printing is done (Android needs the page alive). */
    private WebView printView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "Bloom");
        if (html == null) {
            call.reject("no html");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                WebView view = new WebView(getActivity());
                final boolean[] done = { false };
                view.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView v, String url) {
                        if (done[0]) return;
                        done[0] = true;
                        PrintManager pm = (PrintManager) getActivity().getSystemService(android.content.Context.PRINT_SERVICE);
                        pm.print(title, v.createPrintDocumentAdapter(title), new PrintAttributes.Builder().build());
                        call.resolve();
                    }
                });
                printView = view;
                view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
