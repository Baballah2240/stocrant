package studio.islanddesk.island_desk_flutter

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.net.Uri

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "islanddesk/platform").setMethodCallHandler { call, result ->
            when (call.method) {
                "dataDirectory" -> result.success(filesDir.absolutePath)
                "openUrl" -> {
                    val uri = Uri.parse(call.argument<String>("url") ?: "")
                    if ((uri.scheme != "https" && uri.scheme != "http") || uri.host.isNullOrBlank()) {
                        result.error("INVALID_URL", "Use an http or https website.", null)
                    } else try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        result.success(null)
                    } catch (error: Exception) { result.error("UNAVAILABLE", "No browser is available.", null) }
                }
                else -> result.notImplemented()
            }
        }
    }
}
