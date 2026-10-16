package com.ati.toobit

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var web: WebView
    private val io = Executors.newFixedThreadPool(4)
    private val base = "https://api.toobit.com"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Keep WebView content below the Android status bar on modern Android versions.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.rgb(3, 16, 32)
        // Use light system icons on the dark status/navigation bars.
        window.decorView.systemUiVisibility = 0
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowContentAccess = false
        web.webViewClient = WebViewClient()
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(NativeApi(), "AndroidApi")
        setContentView(web)
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            val statusInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            val navigationInset = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            web.evaluateJavascript(
                "document.documentElement.style.setProperty('--status-bar-inset', '${statusInset}px');" +
                    "document.documentElement.style.setProperty('--navigation-bar-inset', '${navigationInset}px');",
                null
            )
            insets
        }
        web.loadUrl("file:///android_asset/index.html")
    }

    inner class NativeApi {
        @JavascriptInterface
        fun getJson(endpoint: String, callbackId: String) {
            if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.contains("..")) {
                reply(callbackId, 400, "{}")
                return
            }
            io.execute {
                var connection: HttpURLConnection? = null
                try {
                    val start = System.currentTimeMillis()
                    connection = (URL(base + endpoint).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 12000
                        readTimeout = 12000
                        setRequestProperty("Accept", "application/json")
                        setRequestProperty("User-Agent", "AtiToobitAndroid/1.0")
                    }
                    val code = connection.responseCode
                    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                    val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
                    reply(callbackId, code, body)
                    val elapsed = System.currentTimeMillis() - start
                    if (elapsed < 180) Thread.sleep(180 - elapsed)
                } catch (e: Exception) {
                    reply(callbackId, 599, "{\"error\":\"network_error\"}")
                } finally {
                    connection?.disconnect()
                }
            }
        }
    }

    private fun reply(id: String, status: Int, body: String) {
        val safeId = id.filter { it.isLetterOrDigit() || it == '_' }
        val encoded = Base64.encodeToString(body.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        runOnUiThread {
            web.evaluateJavascript("window.__nativeHttpResult('$safeId',$status,'$encoded')", null)
        }
    }

    override fun onDestroy() {
        web.removeJavascriptInterface("AndroidApi")
        web.destroy()
        io.shutdownNow()
        super.onDestroy()
    }
}
