# Foco Fofo — app Android (Play Store)

O app é o **mesmo `index.html` que você aprovou**, dentro de um aplicativo Android (Capacitor).
Nada do visual, das animações ou da lógica foi alterado. A única diferença é que a fonte
Fredoka agora vai dentro do app, para o texto ficar igual mesmo sem internet.

```
src/index.html          o app, exatamente como você aprovou
scripts/prepare-www.mjs gera a pasta www (troca só o carregamento da fonte)
capacitor.config.json   nome e identificador do app
resources/              ícone e tela de abertura (gatinho)
play-store/             ícone 512 e imagem de destaque 1024x500 para a loja
.github/workflows/      gera o APK de teste e o pacote .aab na nuvem
PRIVACIDADE.md          texto da política de privacidade
```

## Antes de tudo: escolha o identificador do app

Em `capacitor.config.json`, o campo `appId` (hoje `com.focofofo.app`) é o endereço único do app na
Play Store e **não pode mudar depois da primeira publicação**. Troque por algo seu, por exemplo
`br.com.seunome.focofofo`.

## Caminho A — gerar na nuvem (sem instalar nada)

1. Crie um repositório **privado** no GitHub e envie esta pasta inteira.
2. **Teste rápido (sem chave):** vá em *Actions → Gerar app Android → Run workflow*.
   Ao terminar, baixe `foco-fofo-apk-teste` e instale o `.apk` no seu celular para conferir tudo.
3. **Chave de assinatura (uma vez só).** No seu computador, com o Java instalado:
   ```
   keytool -genkeypair -v -keystore release.keystore -alias focofofo -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.keystore > release.keystore.b64        # no Mac: base64 -i release.keystore
   ```
   Guarde o `release.keystore` e as senhas em lugar seguro (faça cópia). Sem ele não dá para atualizar o app.
4. No GitHub: *Settings → Secrets and variables → Actions → New repository secret*, crie:
   - `ANDROID_KEYSTORE_BASE64` (conteúdo do arquivo `.b64`)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS` (no exemplo, `focofofo`)
   - `ANDROID_KEY_PASSWORD`
5. Rode o workflow de novo e baixe `foco-fofo-aab-play-store`: é o arquivo `.aab` que vai para a loja.
   O número da versão sobe sozinho a cada execução.

## Caminho B — gerar no seu computador

Precisa de Node 22, Java 21 e Android Studio.
```
npm install
npm run build:www
npx cap add android
npm run android:assets
npx cap sync android
npx cap open android      # no Android Studio: Build > Generate Signed Bundle
```

## Publicar na Play Store

1. Crie a conta em play.google.com/console (taxa única de US$ 25).
2. *Criar app* → idioma Português (Brasil), tipo App, gratuito.
3. **Versão:** envie o `.aab` em *Teste interno* para validar, depois em *Produção*.
   Contas pessoais novas costumam precisar de um **teste fechado** com testadores por um período
   antes de liberar a produção. Confira a regra atual no próprio Console.
4. **Ficha da loja:** nome, descrição curta e completa, ícone `play-store/icon-512.png`,
   imagem de destaque `play-store/feature-graphic-1024x500.png` e **pelo menos 2 capturas de tela**
   do app rodando no celular (tire do APK de teste: as duas telas).
5. **Política de privacidade:** publique o texto de `PRIVACIDADE.md` em uma página pública
   (GitHub Pages, Notion publicado ou Google Sites), coloque seu e-mail e cole o link no Console.
6. **Segurança dos dados:** o app não coleta nem compartilha dados, então marque que não coleta dados.
7. **Classificação de conteúdo** e **público-alvo:** responda o questionário. Se marcar que o app
   é voltado a crianças, entram as regras extras da política para famílias.
8. **Versão alvo do Android:** a Play exige uma versão mínima de API para apps novos. O workflow mostra a
   que o Capacitor está usando (passo "Número da versão"). Se a loja reclamar, atualize os pacotes
   `@capacitor/*` para a versão mais recente e gere de novo.

## Limites conhecidos (sem mudar o visual)

- O som e a vibração do fim do timer só tocam com o app aberto. Com o app em segundo plano ou a tela
  apagada o Android pausa a página. Para alarme com o app fechado seria preciso adicionar o plugin
  de notificações locais (não incluído, para não mexer em nada do que você aprovou).
- Teste o APK em um aparelho real antes de enviar: confira as animações, o botão voltar do Android
  e a barra de status.
