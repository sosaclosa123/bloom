package app.bloom.calendar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Small native helpers for the phone app:
 *  - openFile: show a file (PDF / image) in the phone's viewer, or start
 *    installing a downloaded update (.apk) — Android then asks "Install?".
 *  - shareFile: the Android share sheet (save a backup to Drive, Files, ...).
 * Paths are file:// URIs from @capacitor/filesystem (app files or cache).
 */
@CapacitorPlugin(name = "BloomNative")
public class BloomNativePlugin extends Plugin {

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
}
