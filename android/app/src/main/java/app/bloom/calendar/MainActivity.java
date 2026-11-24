package app.bloom.calendar;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BloomNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Android would otherwise blow up all text by the phone's own font size,
        // which pushes menus and labels off the screen. Bloom has its own
        // "Text size" setting (Settings > General) for that.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
