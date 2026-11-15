package af.zuri.browser

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Barre de recherche sur l'écran d'accueil : recherche directe, ou nouvel onglet privé. */
class SearchWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget_search)
        val search = pending(context, BrowserActivity.ACTION_SEARCH, 1)
        views.setOnClickPendingIntent(R.id.widget_root, search)
        views.setOnClickPendingIntent(R.id.widget_search, search)
        views.setOnClickPendingIntent(R.id.widget_logo, search)
        views.setOnClickPendingIntent(R.id.widget_private, pending(context, BrowserActivity.ACTION_NEW_PRIVATE_TAB, 2))
        manager.updateAppWidget(ids, views)
    }

    private fun pending(context: Context, action: String, code: Int): PendingIntent {
        val intent = Intent(context, BrowserActivity::class.java).setAction(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}
