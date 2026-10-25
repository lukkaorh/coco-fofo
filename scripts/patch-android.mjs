/**
 * Roda sozinho depois de "cap sync" (gancho do Capacitor, ver package.json).
 *
 * 1) Cria um pequeno plugin nativo (SocialShare) que abre DIRETO o Facebook ou o WhatsApp
 *    já com a imagem do certificado, sem menu e sem texto, e mantém a tela acesa durante o foco.
 *    Não usa login nem SDK do Facebook.
 * 2) Cria o widget da tela inicial (FocoWidget: foco de hoje, meta e sequência).
 * 3) Libera as permissões dos avisos do timer (notificações e alarme exato) e cria o ícone do aviso.
 * É seguro rodar várias vezes.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const javaRoot = 'android/app/src/main/java';
if (!existsSync(javaRoot)) process.exit(0);

// Acha a MainActivity criada pelo Capacitor (a pasta depende do appId)
function find(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name === 'MainActivity.java') return p;
  }
  return null;
}
const mainFile = find(javaRoot);
if (!mainFile) { console.log('MainActivity.java não encontrada; nada a fazer.'); process.exit(0); }

const pkg = /package\s+([\w.]+)\s*;/.exec(readFileSync(mainFile, 'utf8'))[1];
const dir = mainFile.slice(0, mainFile.lastIndexOf('/'));

writeFileSync(join(dir, 'SocialSharePlugin.java'), `package ${pkg};

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.view.WindowManager;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/** Abre direto o Facebook ou o WhatsApp com uma imagem PNG (sem texto, sem login) e mantém a tela acesa. */
@CapacitorPlugin(name = "SocialShare")
public class SocialSharePlugin extends Plugin {

    @PluginMethod
    public void keepAwake(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                call.resolve();
            }
        });
    }

    /** Guarda o foco de hoje, a meta e a sequência para o widget da tela inicial e o atualiza. */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        try {
            SharedPreferences.Editor e = getContext().getSharedPreferences(FocoWidget.PREFS, Context.MODE_PRIVATE).edit();
            e.putInt("today", call.getInt("today", 0));
            e.putInt("goal", call.getInt("goal", 60));
            e.putInt("streak", call.getInt("streak", 0));
            e.putString("day", call.getString("day", ""));
            e.putString("lang", call.getString("lang", "pt"));
            e.apply();
            FocoWidget.refresh(getContext());
            call.resolve();
        } catch (Exception ex) {
            call.reject("error: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        String target = call.getString("target", "facebook");
        String data = call.getString("data");
        if (data == null || data.isEmpty()) { call.reject("no_image"); return; }

        String[] packages = "whatsapp".equals(target)
            ? new String[] { "com.whatsapp", "com.whatsapp.w4b" }
            : new String[] { "com.facebook.katana", "com.facebook.lite" };

        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, "foco-fofo.png");
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

            for (String p : packages) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setPackage(p);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    getActivity().startActivity(send);
                    JSObject ok = new JSObject();
                    ok.put("opened", p);
                    call.resolve(ok);
                    return;
                } catch (ActivityNotFoundException e) {
                    // tenta o próximo pacote
                }
            }
            call.reject("not_installed");
        } catch (Exception e) {
            call.reject("error: " + e.getMessage());
        }
    }
}
`);

writeFileSync(join(dir, 'FocoWidget.java'), `package ${pkg};

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.util.Calendar;

/** Widget da tela inicial: foco de hoje, barra da meta e sequência. Funciona offline. */
public class FocoWidget extends AppWidgetProvider {
    static final String PREFS = "foco_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FocoWidget.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static String key(Calendar c) {
        return c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH);
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Calendar now = Calendar.getInstance();
        Calendar ontem = Calendar.getInstance();
        ontem.add(Calendar.DAY_OF_MONTH, -1);
        String saved = p.getString("day", "");
        boolean isToday = key(now).equals(saved);
        int today = isToday ? p.getInt("today", 0) : 0;
        int goal = Math.max(1, p.getInt("goal", 60));
        int streak = (isToday || key(ontem).equals(saved)) ? p.getInt("streak", 0) : 0;
        int pct = Math.min(100, (today * 100) / goal);

        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_foco);
        rv.setTextViewText(R.id.w_main, today + " / " + goal + " min");
        rv.setProgressBar(R.id.w_bar, 100, pct, false);
        String lang = p.getString("lang", "pt");
        String done = "Meta batida! ", left = "Faltam ", d1 = " dia", dn = " dias";
        if ("en".equals(lang)) { done = "Goal reached! "; left = "To go: "; d1 = " day"; dn = " days"; }
        else if ("es".equals(lang)) { done = "\\u00A1Meta cumplida! "; left = "Faltan "; d1 = " d\\u00EDa"; dn = " d\\u00EDas"; }
        String info = today >= goal ? done + "\\uD83C\\uDF89" : left + (goal - today) + " min";
        rv.setTextViewText(R.id.w_info, info + "  \\u00B7  \\uD83D\\uDD25 " + streak + (streak == 1 ? d1 : dn));

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            rv.setOnClickPendingIntent(R.id.w_root, pi);
        }
        return rv;
    }
}
`);

writeFileSync(mainFile, `package ${pkg};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SocialSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
console.log('SocialShare: plugin criado em ' + dir);

// ---- Permissões dos avisos e ícone do aviso ----
const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  const perms = ['POST_NOTIFICATIONS', 'USE_EXACT_ALARM', 'SCHEDULE_EXACT_ALARM', 'VIBRATE']
    .filter(p => !xml.includes(`android.permission.${p}`))
    .map(p => `<uses-permission android:name="android.permission.${p}" />`);
  if (perms.length) {
    xml = xml.replace('<application', perms.join('\n    ') + '\n\n    <application');
    writeFileSync(manifest, xml);
    console.log('AndroidManifest.xml: permissões adicionadas (' + perms.length + ').');
  }
}
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  if (!xml.includes('.FocoWidget')) {
    const rcv = `<receiver android:name="${pkg}.FocoWidget" android:exported="true" android:label="Foco Fofo">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/foco_widget_info" />
        </receiver>`;
    xml = xml.replace('</application>', '    ' + rcv + '\n    </application>');
    writeFileSync(manifest, xml);
    console.log('AndroidManifest.xml: widget registrado.');
  }
}
// ---- Backup automático do Android (Google Drive do próprio usuário): guarda o progresso (localStorage do WebView) e restaura em celular novo ----
{
  const xmlDir = 'android/app/src/main/res/xml';
  mkdirSync(xmlDir, { recursive: true });
  writeFileSync(join(xmlDir, 'foco_backup_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <include domain="root" path="app_webview/Default/Local Storage" />
    <include domain="root" path="app_webview/Default/IndexedDB" />
    <include domain="sharedpref" path="." />
</full-backup-content>
`);
  writeFileSync(join(xmlDir, 'foco_data_extraction_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="root" path="app_webview/Default/Local Storage" />
        <include domain="root" path="app_webview/Default/IndexedDB" />
        <include domain="sharedpref" path="." />
    </cloud-backup>
    <device-transfer>
        <include domain="root" path="app_webview/Default/Local Storage" />
        <include domain="root" path="app_webview/Default/IndexedDB" />
        <include domain="sharedpref" path="." />
    </device-transfer>
</data-extraction-rules>
`);
  if (existsSync(manifest)) {
    let xml = readFileSync(manifest, 'utf8');
    xml = xml.replace(/\s+android:(allowBackup|fullBackupContent|dataExtractionRules)="[^"]*"/g, '');
    xml = xml.replace('<application', '<application android:allowBackup="true" android:fullBackupContent="@xml/foco_backup_rules" android:dataExtractionRules="@xml/foco_data_extraction_rules"');
    writeFileSync(manifest, xml);
    console.log('AndroidManifest.xml: backup automático configurado.');
  }
}
const resRoot = 'android/app/src/main/res';
if (existsSync(resRoot)) {
  for (const d of ['drawable', 'layout', 'xml', 'values']) mkdirSync(join(resRoot, d), { recursive: true });
  writeFileSync(join(resRoot, 'drawable', 'widget_bg.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:startColor="#FFD7E2" android:endColor="#D6ECFA" android:angle="315" />
    <corners android:radius="24dp" />
    <stroke android:width="3dp" android:color="#FFFFFF" />
</shape>
`);
  writeFileSync(join(resRoot, 'layout', 'widget_foco.xml'), `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/w_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg"
    android:gravity="center_vertical"
    android:orientation="vertical"
    android:padding="14dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Foco Fofo"
        android:textColor="#8B4A3A"
        android:textSize="13sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/w_main"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="0 / 60 min"
        android:textColor="#5C2E1A"
        android:textSize="26sp"
        android:textStyle="bold" />

    <ProgressBar
        android:id="@+id/w_bar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="10dp"
        android:layout_marginTop="4dp"
        android:layout_marginBottom="4dp"
        android:max="100"
        android:progress="0"
        android:progressBackgroundTint="#FFFFFF"
        android:progressTint="#F27FA6" />

    <TextView
        android:id="@+id/w_info"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Abra o app para começar"
        android:textColor="#8B4A3A"
        android:textSize="12sp"
        android:textStyle="bold" />
</LinearLayout>
`);
  writeFileSync(join(resRoot, 'xml', 'foco_widget_info.xml'), `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/foco_widget_desc"
    android:initialLayout="@layout/widget_foco"
    android:minHeight="110dp"
    android:minWidth="250dp"
    android:previewImage="@mipmap/ic_launcher"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="3600000"
    android:widgetCategory="home_screen" />
`);
  writeFileSync(join(resRoot, 'values', 'foco_widget.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="foco_widget_desc">Foco de hoje, meta e sequência</string>
</resources>
`);
  for (const [loc, txt] of [['en', "Today's focus, goal and streak"], ['es', 'Foco de hoy, meta y racha']]) {
    mkdirSync(join(resRoot, 'values-' + loc), { recursive: true });
    writeFileSync(join(resRoot, 'values-' + loc, 'foco_widget.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="foco_widget_desc">${txt}</string>
</resources>
`);
  }
}
const drawDir = 'android/app/src/main/res/drawable';
if (existsSync('android/app/src/main/res')) {
  mkdirSync(drawDir, { recursive: true });
  writeFileSync(join(drawDir, 'ic_stat_foco.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,13.5c-2.5,0 -5,2.2 -5,4.5c0,1.7 1.4,2.5 2.8,2.5c0.9,0 1.4,-0.3 2.2,-0.3s1.3,0.3 2.2,0.3c1.4,0 2.8,-0.8 2.8,-2.5C17,15.7 14.5,13.5 12,13.5z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M4.6,11.2a1.7,2.2 0,1 0,3.4 0a1.7,2.2 0,1 0,-3.4 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M8.4,6.8a1.7,2.3 0,1 0,3.4 0a1.7,2.3 0,1 0,-3.4 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M12.2,6.8a1.7,2.3 0,1 0,3.4 0a1.7,2.3 0,1 0,-3.4 0z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M16,11.2a1.7,2.2 0,1 0,3.4 0a1.7,2.2 0,1 0,-3.4 0z"/>
</vector>
`);
}
