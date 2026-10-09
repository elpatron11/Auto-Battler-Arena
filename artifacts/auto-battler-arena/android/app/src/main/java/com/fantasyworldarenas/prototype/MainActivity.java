package com.fantasyworldarenas.prototype;

import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enforce the prototype's no-purchases rule even before the hosted UI
        // receives the matching Store disclosure in a future website publish.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (PrototypePolicy.blocksCheckout(
                    request.getUrl().getHost(), request.getUrl().getPath(), request.getMethod()
                )) {
                    String body = "{\"error\":\"Purchases are disabled in the Android prototype.\"}";
                    return new WebResourceResponse(
                        "application/json", "UTF-8", 403, "Forbidden",
                        Collections.singletonMap("Cache-Control", "no-store"),
                        new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))
                    );
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if ("checkout.stripe.com".equals(request.getUrl().getHost())) {
                    Toast.makeText(MainActivity.this, "Purchases are disabled in this test app.", Toast.LENGTH_LONG).show();
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Close the game?")
                        .setMessage("Any fight currently running on this device will stop.")
                        .setNegativeButton("Stay", null)
                        .setPositiveButton("Close", (dialog, which) -> finish())
                        .show();
                }
            }
        });
        if (!getPreferences(MODE_PRIVATE).getBoolean("prototypeNoticeShown", false)) {
            new AlertDialog.Builder(this)
                .setTitle("Android test app")
                .setMessage("This private prototype loads the live game and needs internet. It is not a Google Play release. Purchases are disabled. Social sign-in still needs Android device verification.")
                .setPositiveButton("Continue", (dialog, which) ->
                    getPreferences(MODE_PRIVATE).edit().putBoolean("prototypeNoticeShown", true).apply())
                .show();
        }
    }
}
