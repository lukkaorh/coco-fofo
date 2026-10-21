/**
 * Roda sozinho depois de "cap sync" (gancho do Capacitor, ver package.json).
 *
 * Cria um pequeno plugin nativo (SocialShare) que abre DIRETO o Facebook ou o WhatsApp
 * já com a imagem do certificado, sem menu e sem texto. Não usa login nem SDK do Facebook.
 * É seguro rodar várias vezes.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/** Abre direto o Facebook ou o WhatsApp com uma imagem PNG (sem texto, sem login). */
@CapacitorPlugin(name = "SocialShare")
public class SocialSharePlugin extends Plugin {

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
